import { ColorType, TetrisBoard } from "../../../../shared/tetris/tetris-board";
import { OCRFrame } from "../../ocr-frame";
import { OCRState } from "../../ocr-state";
import { OCRStateID } from "../ocr-state-id";
import MoveableTetromino from "../../../../shared/tetris/moveable-tetromino";
import { LogType } from "../../state-machine-logger";
import { TETROMINO_CHAR } from "../../../../shared/tetris/tetrominos";
import { RegularSpawnEvent } from "../events/regular-spawn-event";
import { LineClearSpawnEvent } from "../events/line-clear-spawn-event";
import { TopoutEvent } from "../events/topout-event";
import { ConfusionEvent } from "../events/confusion-event";
import { RestartGameEvent } from "../events/restart-game-event";
import { getColorTypeForTetromino } from "src/app/shared/tetris/tetromino-colors";
import { StuckEvent } from "../events/stuck-event";

enum ActivePieceFailure {
    NOT_PLUS_FOUR_MINOS = "NOT_PLUS_FOUR_MINOS",
    CANNOT_ISOLATE_PIECE = "CANNOT_ISOLATE_PIECE",
    NO_PIECE_FOUND = "NO_PIECE_FOUND",
    PIECE_INCORRECT_TYPE = "PIECE_INCORRECT_TYPE",
}

export class PieceDroppingState extends OCRState {

    public override readonly id = OCRStateID.PIECE_DROPPING;
    // The last known good position of the active piece, calculated by doing a perfect subtraction of stable board
    // from the current board
    private activePiece: MoveableTetromino | undefined = undefined;
    private activePieceThisFrame: MoveableTetromino | null = null;

    // Level remains the same throughout the piece dropping
    private readonly currentLevel = this.globalState.game!.getStatus().level;
        
    public override init() {

        this.registerEvent(new RestartGameEvent(this.config, this.globalState, this.textLogger));
        this.registerEvent(new RegularSpawnEvent(this, this.globalState));
        this.registerEvent(new LineClearSpawnEvent(this, this.config, this.globalState));
        this.registerEvent(new TopoutEvent(this));
        this.registerEvent(new ConfusionEvent(this));
        this.registerEvent(new StuckEvent());
    }

    /**
     * Runs the logic for the BeforeGameState each frame.
     * @param gameData 
     * @param ocrFrame 
     */
    protected override async onAdvanceFrame(ocrFrame: OCRFrame) {
        if (this.globalState.game === undefined) throw new Error("Game must be defined in PieceDroppingState");

        // We attempt to compute the active piece for this frame
        const maybeActivePiece = this.computeActivePiece(ocrFrame);
        this.activePieceThisFrame = (maybeActivePiece instanceof MoveableTetromino) ? maybeActivePiece : null;

        // If active piece was already found but is different from this frame, then it is a false positive
        if (
            this.activePieceThisFrame &&
            this.activePiece &&
            this.activePieceThisFrame.tetrominoType !==this.activePiece.tetrominoType
        ) this.activePieceThisFrame = null;


        if (this.activePieceThisFrame) {
            // We only update the active piece if it was found this frame
            this.activePiece = this.activePieceThisFrame;

            // Since this is a stable frame, we can try to derive any ocr colors that haven't be derived yet
            const displayBoard = this.globalState.game!.getStableBoard().copy();
            this.activePieceThisFrame.blitToBoard(displayBoard);
            this.globalState.ocrColor.deriveColorsFromBoard(ocrFrame, displayBoard, this.globalState.game!.getStatus().level);

            // We use the found active piece this frame to send an abbreviated-length packet for just the active piece
            this.globalState.game!.setAbbreviatedBoard(this.activePieceThisFrame);

        } else {
            // We didn't find the active piece this frame, so we are forced to send the entire board state
            let colorBoard: TetrisBoard;

            // If subtracting isolated board is a perfect substraction, use isolated board colors
            const binaryBoard = ocrFrame.getBinaryBoard()!;
            const stableBoard = this.globalState.game!.getStableBoard();
            if (TetrisBoard.subtract(binaryBoard, stableBoard, true) !== null) {

                // Use the binary board's minos, but derive colors
                colorBoard = binaryBoard;
                
                const activePieceColor = getColorTypeForTetromino(this.globalState.game!.getCurrentType());
                for (let {x, y, color} of stableBoard.iterateMinos()) {
                    // If there's a mino in the stable board in the same spot, use the stable board's color
                    if (color !== ColorType.EMPTY) colorBoard.setAt(x, y, color);

                    // This is probably the active piece,so  set to active piece color
                    else if (colorBoard.exists(x, y)) colorBoard.setAt(x, y, activePieceColor);
                }
            } else {
                // If not a perfect subtraction. It's likely a line clear situation. Find color type most
                // similar to the captured color
                colorBoard = ocrFrame.getColorBoard(this.currentLevel, this.globalState.ocrColor)!;;
            }

            // Update entire board
            this.globalState.game!.setFullBoard(colorBoard);
        }

    }

    /**
     * We attempt to find the location of the active piece this frame. This is done by subtracting the stable
     * board from the current board, and checking if the result is a valid MoveableTetromino that matches the
     * current piece type. A known activePiece is not guaranteed to found at any frame, but can be useful
     * to help determine the final placement of the falling piece, though a fallback is necessary if not found.
     * @param ocrFrame The current OCR frame to use for updating the active piece
     */
    private computeActivePiece(ocrFrame: OCRFrame): MoveableTetromino | ActivePieceFailure {
        

        // Do a perfect subtraction, subtracting the stable board from the current board to get the active piece
        const diffBoard = TetrisBoard.subtract(ocrFrame.getBinaryBoard()!, this.globalState.game!.getStableBoard(), true);
        if (diffBoard === null) {
            this.textLogger.log(LogType.VERBOSE, "Active piece not updated: Failed to subtract stable board from current board");
            return ActivePieceFailure.CANNOT_ISOLATE_PIECE;
        }

        // If the current board's count is not exactly 4 minos more than the stable board, then we cannot determine
        // the active piece
        const stableCount = this.globalState.game!.getStableBoardCount();
        const currentCount = ocrFrame.getBinaryBoard()!.count();
        if (currentCount !== stableCount + 4) {
            this.textLogger.log(LogType.VERBOSE, "Active piece not updated: Current board count is not 4 more than stable board count");
            return ActivePieceFailure.NOT_PLUS_FOUR_MINOS;
        }

        // Extract the active piece from the diff board, if it exists
        const mt = MoveableTetromino.extractFromTetrisBoard(diffBoard);
        if (mt === null) {
            this.textLogger.log(LogType.VERBOSE, "Active piece not updated: Failed to extract MoveableTetromino from diff board");
            return ActivePieceFailure.NO_PIECE_FOUND;
        }

        // Check that the extracted piece is of the correct type
        if (mt.tetrominoType !== this.globalState.game!.getCurrentType()) {
            this.textLogger.log(LogType.VERBOSE, "Active piece not updated: Extracted piece is not of the correct type");
            return ActivePieceFailure.PIECE_INCORRECT_TYPE;
        }


        // We have found a valid active piece
        this.textLogger.log(LogType.VERBOSE, `Active piece updated: ${TETROMINO_CHAR[mt.tetrominoType]} at ${mt.getTetrisNotation()}`);
        return mt;
    }

    /**
     * Returns the active piece, if it exists. The active piece is the piece that is currently falling
     * on the board. This piece is not guaranteed to be found every frame, and may be undefined.
     * @returns The active piece, if it exists
     */
    getActivePiece(): MoveableTetromino | undefined {
        return this.activePiece;
    }

    getActivePieceThisFrame(): MoveableTetromino | null {
        return this.activePieceThisFrame;
    }
}

