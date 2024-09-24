import { Role } from "./room-info";

export type PlayerRole = Role.PLAYER_1 | Role.PLAYER_2;

export enum MultiplayerRoomMode {
    WAITING = "WAITING",
    COUNTDOWN = "COUNTDOWN",
    PLAYING = "PLAYING",
    MATCH_ENDED = "MATCH_ENDED",
}

export enum MultiplayerPlayerMode {
    NOT_IN_ROOM = "NOT_IN_ROOM",
    NOT_READY = "NOT_READY",
    READY = "READY",
    IN_GAME = "IN_GAME",
    DEAD = "DEAD",
}

export interface MultiplayerPlayerState {

    mode: MultiplayerPlayerMode;
    score: number;

}

export interface MultiplayerRoomState {
    startLevel: number;
    mode: MultiplayerRoomMode;
    levelPicker: PlayerRole;
    players: {[role in PlayerRole]: MultiplayerPlayerState};
}

export interface MatchPoint {
    seed: string;
    gameIDPlayer1: string;
    scorePlayer1: number;
    gameIDPlayer2: string;
    scorePlayer2: number;
}

export interface MatchPlayerInfo {
    userID: string;
    username: string;
    trophiesBeforeMatch: number;
}

export interface MatchPlayerStakes {
    winXP: number;
    winTrophies: number;
    loseTrophies: number;
}

export interface MatchInfo {
    matchID: string;
    isRanked: boolean;
    seed: string;
    winningScore: number;
    validStartLevels: number[];
    points: MatchPoint[];

    playerInfo: {[role in PlayerRole]: MatchPlayerInfo};

    // If the match is ranked, these are the stakes for each player
    playerStakes?: {[role in PlayerRole]: MatchPlayerStakes};
}

export interface MultiplayerData {
    state: MultiplayerRoomState;
    match: MatchInfo;
}

export function getMatchScore(match: MatchInfo): {[role in PlayerRole]: number} {
    let score1 = 0;
    let score2 = 0;
    for (const point of match.points) {
        if (point.scorePlayer1 > point.scorePlayer2) {
            score1++;
        } else if (point.scorePlayer1 < point.scorePlayer2) {
            score2++;
        } else {
            // Tie
            score1 += 0.5;
            score2 += 0.5;
        }
    }
    return {
        [Role.PLAYER_1]: score1,
        [Role.PLAYER_2]: score2,
    };
}

export function getMatchWinner(match: MatchInfo): PlayerRole | null {
    const scores = getMatchScore(match);
    if (scores[Role.PLAYER_1] >= match.winningScore) return Role.PLAYER_1;
    if (scores[Role.PLAYER_2] >= match.winningScore) return Role.PLAYER_2;
    return null;
}