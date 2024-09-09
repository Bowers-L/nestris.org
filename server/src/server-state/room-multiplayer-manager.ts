import { v4 as uuid } from "uuid";
import { getMatchWinner, MatchPlayerInfo, MatchPlayerStakes, MatchInfo, MultiplayerData, MultiplayerPlayerMode, MultiplayerRoomMode, MultiplayerRoomState, PlayerRole } from "../../shared/models/multiplayer";
import { Role, RoomMode } from "../../shared/models/room-info";
import { UserSession } from "./online-user";
import { Challenge } from "../../shared/models/challenge";


const BOTH_READY_COUNTDOWN_SECONDS = 2;
export class MultiplayerManager {

    private players: {[role in PlayerRole]: UserSession};

    // Current state about the room
    private state!: MultiplayerRoomState;

    // Current state about the match
    private match!: MatchInfo;

    private countdownTimeout: NodeJS.Timeout | null = null;

    private topoutPlayerGameID: string | null = null;
    private topoutPlayerScore: number | null = null;

    constructor(
        private readonly challenge: Challenge,
        player1: UserSession,
        player2: UserSession,

        // Whenever room state is updated, this function is called to notify the client
        private readonly sendToClient: (data: MultiplayerData) => void,
    ) {
        this.players = {
            [Role.PLAYER_1]: player1,
            [Role.PLAYER_2]: player2,
        };
    }

    private async getMatchPlayerInfo(role: PlayerRole): Promise<MatchPlayerInfo> {
        return {
            userID: this.players[role].user.userid,
            username: this.players[role].user.username,
            trophiesBeforeMatch: 1000, // TODO: Get actual trophies from database
        };
    }

    // Calculate the stakes for the match by using the player's current trophies to determine the stakes
    private async getMatchPlayerStakes(player: MatchPlayerInfo): Promise<MatchPlayerStakes> {
        return {
            winXP: 10, // TODO: Get actual XP
            winTrophies: 20, // TODO: Get actual trophies
            loseTrophies: 10, // TODO: Get actual trophies
        };
    }

    async init() {

        let validStartLevels: number[];
        if (this.challenge.rated) {
            // TEMPORARY: should derive valid start levels from trophies
            validStartLevels = [15, 18, 19];
        }
        else validStartLevels = [9, 12, 15, 18, 19, 29];

        // Initialize the multiplayer room state
        this.state = {
            startLevel: validStartLevels[ Math.floor(validStartLevels.length / 2) ],
            mode: MultiplayerRoomMode.WAITING,
            levelPicker: Role.PLAYER_1,
            players: {
                [Role.PLAYER_1]: {
                    mode: MultiplayerPlayerMode.NOT_READY,
                    score: 0,
                },
                [Role.PLAYER_2]: {
                    mode: MultiplayerPlayerMode.NOT_READY,
                    score: 0,
                },
            },
        };

        // Fetch player info for the match
        const playerInfo = {
            [Role.PLAYER_1]: await this.getMatchPlayerInfo(Role.PLAYER_1),
            [Role.PLAYER_2]: await this.getMatchPlayerInfo(Role.PLAYER_2),
        };

        // For ranked matches, calculate the stakes for the match
        const playerStakes = this.challenge.rated ? {
            [Role.PLAYER_1]: await this.getMatchPlayerStakes(playerInfo[Role.PLAYER_1]),
            [Role.PLAYER_2]: await this.getMatchPlayerStakes(playerInfo[Role.PLAYER_2]),
        } : undefined;

        // Initialize the match info
        this.match = {
            matchID: uuid(),
            isRanked: this.challenge.rated,
            seed: "6EF248",
            winningScore: this.challenge.winningScore,
            validStartLevels: validStartLevels,
            points: [],
            playerInfo: playerInfo,
            playerStakes: playerStakes,
        };
    }

    setPlayerReady(role: PlayerRole) {

        if (![MultiplayerRoomMode.WAITING, MultiplayerRoomMode.COUNTDOWN].includes(this.state.mode)) {
            throw new Error("Room must be in WAITING or COUNTDOWN mode");
        }

        // If player is already ready, ignore
        if (this.state.players[role].mode === MultiplayerPlayerMode.READY) return;

        // Set player to ready
        this.state.players[role].mode = MultiplayerPlayerMode.READY;

        // If both players are ready, start countdown
        if (this.state.players[Role.PLAYER_1].mode === MultiplayerPlayerMode.READY &&
            this.state.players[Role.PLAYER_2].mode === MultiplayerPlayerMode.READY) {
            this.state.mode = MultiplayerRoomMode.COUNTDOWN;

            this.countdownTimeout = setTimeout(() => {
                this.state.mode = MultiplayerRoomMode.PLAYING;
                this.update();
            }, BOTH_READY_COUNTDOWN_SECONDS * 1000);
        }

        // Send updates to clients
        this.update();
    }

    setPlayerNotReady(role: PlayerRole) {

        if (![MultiplayerRoomMode.WAITING, MultiplayerRoomMode.COUNTDOWN].includes(this.state.mode)) {
            throw new Error("Room must be in WAITING or COUNTDOWN mode");
        }

        // If player is already not ready, ignore
        if (this.state.players[role].mode === MultiplayerPlayerMode.NOT_READY) return;

        // Set player to not ready, and reset countdown
        this.state.players[role].mode = MultiplayerPlayerMode.NOT_READY;
        this.state.mode = MultiplayerRoomMode.WAITING;
        if (this.countdownTimeout) {
            clearTimeout(this.countdownTimeout);
            this.countdownTimeout = null;
        }

        // Send updates to clients
        this.update();
    }

    selectLevelForPlayer(role: PlayerRole, level: number) {
        // Verify that the player can select a level
        if (this.state.mode != MultiplayerRoomMode.WAITING) throw new Error("Room must be in WAITING mode");
        if (this.state.levelPicker != role) throw new Error("Not this player's turn to pick level");
        if (this.state.players[role].mode != MultiplayerPlayerMode.NOT_READY) throw new Error("Player must be in NOT_READY mode");
        if (!this.match.validStartLevels.includes(level)) throw new Error("Invalid level selection");

        // Set the level for the player and update client
        this.state.startLevel = level;
        this.update();
    }

    // Only when certain conditions are met, will a game start packet be accepted. Otherwise, it should be ignored.
    // Return whether to accept the packet, and update state if so
    onGameStartPacket(role: PlayerRole): boolean {

        // Only can start game when in COUNTDOWN or already PLAYING
        if (![MultiplayerRoomMode.COUNTDOWN, MultiplayerRoomMode.PLAYING].includes(this.state.mode)) {
            return false;
        }

        // Only can start game if player is in READY mode (i.e. not already in game or dead)
        if (this.state.players[role].mode != MultiplayerPlayerMode.READY) {
            return false;
        }

        // Conditions are met. Move player to IN_GAME mode
        this.state.players[role].mode = MultiplayerPlayerMode.IN_GAME;
        this.update();

        return true;
    }

    // Only should move player mode from IN_GAME to DEAD. Ignore otherwise.
    // Return a new game uuid if game should be saved and accepted as a valid game during the match
    onGameEndPacket(role: PlayerRole, score: number, becauseLeftRoom: boolean = false): string | null {

        // In a special case where game that was started in countdown ends in countdown, go back to READY mode
        if (
            this.state.mode === MultiplayerRoomMode.COUNTDOWN &&
            this.state.players[role].mode === MultiplayerPlayerMode.IN_GAME &&
            !becauseLeftRoom
        ) {
            this.state.players[role].mode = MultiplayerPlayerMode.READY;
            this.update();

            // This isn't a valid game though
            return null;
        }

        /* Otherwise, only move player to DEAD mode if in PLAYING mode */

        // Room to be in PLAYING mode to end game
        if (this.state.mode != MultiplayerRoomMode.PLAYING) return null;

        // Player has to be in IN_GAME mode to end game
        if (this.state.players[role].mode != MultiplayerPlayerMode.IN_GAME) return null;
        
        // Conditions are met. Move player to DEAD mode
        this.state.players[role].mode = MultiplayerPlayerMode.DEAD;
        const myGameID = uuid();

        if (this.topoutPlayerGameID === null || this.topoutPlayerScore === null) {
            // if this is the first player that is dead, save the game id and score
            this.topoutPlayerGameID = myGameID;
            this.topoutPlayerScore = score;

        } else { // Otherwise, the entire match point ended. Save the match point
            
            this.match.points.push({
                seed: this.match.seed,
                gameIDPlayer1: role === Role.PLAYER_1 ? myGameID : this.topoutPlayerGameID,
                scorePlayer1: role === Role.PLAYER_1 ? score : this.topoutPlayerScore,
                gameIDPlayer2: role === Role.PLAYER_2 ? myGameID:  this.topoutPlayerGameID ,
                scorePlayer2: role === Role.PLAYER_2 ? score : this.topoutPlayerScore,
            });
            this.topoutPlayerGameID = null;
            this.topoutPlayerScore = null;

            if (getMatchWinner(this.match)) {
                // If reached winning score, entire match ended
                this.state.mode = MultiplayerRoomMode.MATCH_ENDED;   
            } else {
                // Otherwise, reset for next match point
                this.state.mode = MultiplayerRoomMode.WAITING;

                // Toggle level picker
                this.state.levelPicker = this.state.levelPicker === Role.PLAYER_1 ? Role.PLAYER_2 : Role.PLAYER_1;
            }
        }

        if (becauseLeftRoom) this.state.players[role].mode = MultiplayerPlayerMode.NOT_IN_ROOM;

        // Push updates to multiplayer and match state
        this.update();

        // Return the id of the game that just ended for the player, so that the game can be saved
        return myGameID;
    }

    transitionDeadPlayerToWaiting(role: PlayerRole) {
        if (this.state.players[role].mode === MultiplayerPlayerMode.DEAD) {
            this.state.players[role].mode = MultiplayerPlayerMode.NOT_READY;
            this.update();
        }
    }

    onPlayerLeaveRoom(role: PlayerRole, score: number | null) {

        // If player is in game, end the game
        if (this.state.mode === MultiplayerRoomMode.PLAYING) {
            console.log("Player left room while in game");
            this.onGameEndPacket(role, score ?? 0, true);
        } else {
            // Otherwise, just update player status
            console.log("Player left room while not in game");
            this.state.players[role].mode = MultiplayerPlayerMode.NOT_IN_ROOM;
            this.update();
        }
    }

    isPlayerInGame(role: PlayerRole): boolean {
        return this.state.players[role].mode === MultiplayerPlayerMode.IN_GAME;
    }

    private update() {
        this.sendToClient(this.getData());
    }

    getPlayerRoleBySessionID(sessionID: string): PlayerRole {
        if (this.players[Role.PLAYER_1].sessionID === sessionID) return Role.PLAYER_1;
        if (this.players[Role.PLAYER_2].sessionID === sessionID) return Role.PLAYER_2;
        throw new Error("Player not found");
    }

    getData(): MultiplayerData {
        return { state: this.state, match: this.match };
    }
}