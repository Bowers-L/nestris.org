import { PacketSender } from "../util/packet-sender";
import { DEFAULT_POLLED_GAME_DATA, GameDisplayData } from "../../shared/tetris/game-display-data";
import { COUNTDOWN_LINECAP_REACHED, GameAbbrBoardPacket, GameCountdownPacket, GameEndPacket, GameFullBoardPacket, GameFullStatePacket, GameFullStateSchema, GamePlacementPacket, GameRecoveryPacket, GameRecoverySchema, GameStartPacket } from "../../shared/network/stream-packets/packet";
import { TetrominoType } from "../../shared/tetris/tetromino-type";
import { TetrisBoard } from "../../shared/tetris/tetris-board";
import MoveableTetromino from "../../shared/tetris/moveable-tetromino";
import GameStatus from "../../shared/tetris/game-status";
import { GameState } from "../../shared/game-state-from-packets/game-state";
import { TimeDelta } from "../../shared/scripts/time-delta";
import { GameAnalyzer } from "../../shared/evaluation/game-analyzer";
import { MemoryGameStatus, StatusHistory } from "src/app/shared/tetris/memory-game-status";
import { OCRColor } from "./ocr-color";

export enum RolloverState {
    BELOW_800K,
    ABOVE_800K
}

class OCRProfile {
    public isMaxoutCapped: boolean | undefined = undefined;
    public numRollovers: number = 0;
    public rolloverState: RolloverState = RolloverState.BELOW_800K;

    calculateRolloverOnScore(score: number) {
        const rolloverScore = score % 1600000;
        if (this.rolloverState === RolloverState.BELOW_800K && rolloverScore > 800000) {
            this.rolloverState = RolloverState.ABOVE_800K;
        } else if (this.rolloverState === RolloverState.ABOVE_800K && rolloverScore < 800000) {
            this.rolloverState = RolloverState.BELOW_800K;
            this.numRollovers += 1;
            console.log("Rollover count:", this.numRollovers, "score", score);
        }
    }

}

/**
 * Stores the state global to the state machine, and sends packets to the injected PacketSender on changes.
 */
export class GlobalState {

    public readonly ocrColor: OCRColor = new OCRColor();

    public game?: OCRGameState;

    private topoutData: GameDisplayData = DEFAULT_POLLED_GAME_DATA;
    private lastMemoryStatus?: MemoryGameStatus;

    constructor(
        private readonly packetSender?: PacketSender,
        private readonly analyzerFactory?: (startLevel: number) => GameAnalyzer
    ) {}

    startGame(level: number, current: TetrominoType, next: TetrominoType): void {
        this.game = new OCRGameState(this.packetSender, level, current, next, this.analyzerFactory);
        this.packetSender?.bufferPacket(new GameStartPacket().toBinaryEncoder({level, current, next}));
        console.log("started OCR game");
    }

    endGame() {
        this.packetSender?.bufferPacket(new GameEndPacket().toBinaryEncoder({}));
        this.topoutData = this.game!.getDisplayData();
        this.lastMemoryStatus = this.game!.getMemoryStatus() as MemoryGameStatus;
        console.log("save lastMemoryStatus", this.lastMemoryStatus);
        this.game = undefined;
    }

    getGameDisplayData(): GameDisplayData {
        return this.game?.getDisplayData() ?? this.topoutData;
    }

    getLastMemoryStatus() {
        return this.lastMemoryStatus;
    }

}

/**
 * Stores the state global to the state machine for the current game.
 */
export class OCRGameState {

    private readonly game: GameState;

    // used for calculating time elapsed between frames
    private readonly timeDelta = new TimeDelta(true);

    private readonly analyzer?: GameAnalyzer;

    public readonly profile = new OCRProfile();

    private countdown: number = 0;

    constructor(
        private readonly packetSender: PacketSender | undefined,
        public readonly startLevel: number,
        currentType: TetrominoType,
        nextType: TetrominoType,
        analyzerFactory?: (startLevel: number) => GameAnalyzer
    ) {
        this.game = new GameState(startLevel, currentType, nextType, undefined, true);

        if (analyzerFactory) {
            this.analyzer = analyzerFactory(startLevel);

            this.analyzer.onNewPosition({
                board: new TetrisBoard(),
                currentPiece: currentType,
                nextPiece: nextType,
                level: startLevel,
                lines: 0,
            })
        }
    }

    getStableBoard(): TetrisBoard {
        return this.game.getIsolatedBoard();
    }

    getDisplayBoard(): TetrisBoard {
        return this.game.getCurrentBoard();
    }

    getStableBoardCount(): number {
        return this.getStableBoard().count();
    }

    getCurrentType(): TetrominoType {
        return this.game.getCurrentType();
    }

    getNextType(): TetrominoType {
        return this.game.getNextType();
    }

    getStatus(): GameStatus {
        return this.game.getStatus().status;
    }

    getMemoryStatus(): MemoryGameStatus {
        return this.game.getStatus() as MemoryGameStatus;
    }

    getNumPlacements(): number {
        return this.game.getNumPlacements();
    }

    getNumTetrises(): number {
        return this.game.getNumTetrises();
    }

    placePiece(mt: MoveableTetromino, nextType: TetrominoType, pushdown: number) {

        // Place piece and update game state
        this.game.onPlacement(mt.getMTPose(), nextType, pushdown);

        // Send the game placement packet
        this.packetSender?.bufferPacket(new GamePlacementPacket().toBinaryEncoder({
            nextNextType: nextType,
            mtPose: mt.getMTPose(),
            pushdown,
        }));

        // Analyze placement
        this.analyzer?.onPlacement(mt);
        this.analyzer?.onNewPosition({
            board: this.game.getIsolatedBoard(),
            currentPiece: this.game.getCurrentType(),
            nextPiece: this.game.getNextType(),
            level: this.game.getStatus().level,
            lines: this.game.getStatus().lines,
        });
        
    }

    /**
     * Sent on frames where the active piece cannot be derived, so we set the display board to the ocr board
     * directly and send a packet with the full board
     * @param board The full color board for this frame
     */
    setFullBoard(board: TetrisBoard) {

        // Duplicate board, do not need to resend
        if (this.getDisplayBoard().equals(board)) return;

        // Update game state with full board for this frame
        this.game.onFullBoardUpdate(board);
        
        this.packetSender?.bufferPacket(new GameFullBoardPacket().toBinaryEncoder({
            delta: this.timeDelta.getDelta(),
            board: board
        }));
    }

    /**
     * Sent on frames where the active piece is known, so we can compute the display board from just the stable
     * board and active piece, and also just send the active piece in an abbreviated packet
     * @param activePiece The active piece on the current board for this frame
     */
    setAbbreviatedBoard(activePiece: MoveableTetromino) {

        // If no changes, do not send packet
        const newDisplayBoard = this.getStableBoard().copy();
        activePiece.blitToBoard(newDisplayBoard);
        if (this.getDisplayBoard().equals(newDisplayBoard)) return;

        // Update game state with active piece blitted into pre-existing isolated board
        this.game.onAbbreviatedBoardUpdate(activePiece.getMTPose());

        // Send the abbreviated packet
        this.packetSender?.bufferPacket(new GameAbbrBoardPacket().toBinaryEncoder({
            delta: this.timeDelta.getDelta(),
            mtPose: activePiece.getMTPose()
        }));
    }

    setFullState(board: TetrisBoard, next: TetrominoType, level: number, lines: number, score: number) {
        
        // If no changes, do not send packet
        if (
            level === this.getStatus().level &&
            lines === this.getStatus().lines &&
            score === this.getStatus().score &&
            next === this.getNextType() &&
            board.equals(this.getDisplayBoard())
        ) return;

        const delta = this.timeDelta.getDelta();
        const fullState: GameFullStateSchema = { delta, board, next, level, lines, score };

        // Set game state in limbo
        this.game.onFullState(fullState);

        // Send full state packet
        this.packetSender?.bufferPacket(new GameFullStatePacket().toBinaryEncoder(fullState));
    }

    /**
     * Sent when the state machine reached an invalid state, but was able to recover and continue the same game.
     * @param recovery 
     */
    setRecovery(recovery: GameRecoverySchema) {
        // Set game state from recovery
        this.game.onRecovery(recovery);

        // Send recovery packet
        this.packetSender?.bufferPacket(new GameRecoveryPacket().toBinaryEncoder(recovery));
    }

    /**
     * Sending special code countdown = 15 means linecap has been reached, and game will terminate
     */
    linecapReached() {
        this.countdown = COUNTDOWN_LINECAP_REACHED;
        this.packetSender?.bufferPacket(new GameCountdownPacket().toBinaryEncoder({
            delta: this.timeDelta.getDelta(),
            countdown: COUNTDOWN_LINECAP_REACHED,
        }));
    }

    getDisplayData(): GameDisplayData {
        const snapshot = this.game.getSnapshot();
        return {
            board: snapshot.board,
            nextPiece: snapshot.next,
            level: snapshot.level,
            lines: snapshot.lines,
            score: snapshot.score,
            trt: snapshot.tetrisRate,
            drought: snapshot.droughtCount,
            countdown: this.countdown,
        }
    }

}