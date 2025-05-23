import { TetrisBoard } from "../tetris/tetris-board";
import { TetrominoType } from "../tetris/tetromino-type";
import { RNG } from "../tetris/piece-sequence-generation/rng";
import MoveableTetromino from "../tetris/moveable-tetromino";
import { MemoryGameStatus } from "../tetris/memory-game-status";
import { DroughtCounter } from "../game-state-from-packets/drought-counter";
import { Keybind } from "./keybinds";
import { CurrentlyPressedKeys } from "./currently-pressed-keys";
import { getGravity } from "../tetris/gravity";
import { SmartGameStatus } from "../tetris/smart-game-status";

export const EMULATOR_FPS = 60;


// return the number of delay frames after a piece has locked
// it is dependent on the y position of the piece
export function getLockDelay(lastPlacement: MoveableTetromino): number {

    /*
    ARE is 10~18 frames depending on the height at which the piece locked;
    pieces that lock in the bottom two rows are followed by 10 frames of entry delay,
    and each group of 4 rows above that has an entry delay 2 frames longer than the last. 
    */
    const y = lastPlacement.getLowestY();
    const additionalDelay = Math.floor((19 - y + 2) / 4);

    return 10 + additionalDelay * 2; // TODO: make this more accurate

}


export class EmulatorGameState {
    
    // board without active piece
    private isolatedBoard: TetrisBoard = new TetrisBoard();

    /**
     * The current status of the game
     * Use MemoryGameStatus to keep track of snapshots of the game status at each line clear, for
     * displaying the game summary graph at the end of the game
     */
    private status: MemoryGameStatus;

    private droughtCounter = new DroughtCounter();

    // piece shown in next box
    private nextPieceType: TetrominoType;
    private nextNextPieceType: TetrominoType;

    // the pose of the moveable active piece
    private activePiece: MoveableTetromino;
    private pieceLocked: boolean = false;

    // whether game is over
    private toppedOut = false;
    private reachedLevelCap: boolean = false;

    // current DAS charge
    private currentDAS = 0;

    // Number of frames since piece spawn
    private placementFrameCount: number = 0;

    private gravity: number;
    private gravityCounter = 1;

    private pushingDown = false;
    private rawPushDownPoints = 0;

    private lineClearDelay = 0;
    private lineClearRows: number[] = [];

    // DAS settings
    private readonly MAX_DAS = 16;
    private readonly RESET_DAS = 10;
    private readonly FRAMES_PER_LINE_CLEAR_STEP = 4;
    private readonly MAX_LINE_CLEAR_DELAY = 6 * this.FRAMES_PER_LINE_CLEAR_STEP;

    constructor(
        public readonly startLevel: number,
        public readonly levelCap: number | undefined,
        private readonly rng: RNG,
        private countdown: number = 3, // how many seconds of countdown before game starts
        private readonly storeHistory: boolean = true // whether to store history for game summary (requires more memory)
    ) {
        this.status = new MemoryGameStatus(storeHistory, startLevel);
        this.gravity = getGravity(this.status.level);

        // generate current piece
        this.activePiece = MoveableTetromino.fromSpawnPose(this.rng.getNextPiece());
        this.droughtCounter.onPiece(this.activePiece.tetrominoType);

        // generate new next piece
        this.nextPieceType = this.rng.getNextPiece();
        this.nextNextPieceType = this.rng.getNextPiece();
    }
    
    copy(): EmulatorGameState {
        const copy = new EmulatorGameState(this.startLevel, this.levelCap, this.rng.copy(), this.countdown);
        copy.isolatedBoard = this.isolatedBoard.copy();
        copy.status = new MemoryGameStatus(this.storeHistory, this.status.startLevel, this.status.lines, this.status.score, this.status.level);
        copy.droughtCounter = this.droughtCounter.copy();
        copy.nextPieceType = this.nextPieceType;
        copy.nextNextPieceType = this.nextNextPieceType;
        copy.activePiece = this.activePiece.copy();
        copy.pieceLocked = this.pieceLocked;
        copy.toppedOut = this.toppedOut;
        copy.currentDAS = this.currentDAS;
        copy.placementFrameCount = this.placementFrameCount;
        copy.gravity = this.gravity;
        copy.gravityCounter = this.gravityCounter;
        copy.pushingDown = this.pushingDown;
        copy.rawPushDownPoints = this.rawPushDownPoints;
        copy.lineClearDelay = this.lineClearDelay;
        copy.lineClearRows = this.lineClearRows.slice();
        return copy;
    }

    private getMidLineClearBoard(): TetrisBoard {

        const displayBoard = this.isolatedBoard.copy();

        if (this.lineClearDelay <= 2) {
            displayBoard.processLineClears();
            return displayBoard;
        }

        // goes from 1 mino disappear to 5 minos disappear
        const minos = Math.floor(6 - this.lineClearDelay / this.FRAMES_PER_LINE_CLEAR_STEP);

        
        for (let row of this.lineClearRows) {
            // if minos === 1, clear col 4 and 5
            // if minos === 2, clear col 3, 4, 5, 6
            // if minos === 3, clear col 2, 3, 4, 5, 6, 7
            // if minos === 4, clear col 1, 2, 3, 4, 5, 6, 7, 8
            // if minos === 5, clear all
            for (let x = 0; x < 10; x++) {
                if (x >= 5 - minos && x < 5 + minos) {
                    displayBoard.setAt(x, row, 0);
                }
            }
        }

        return displayBoard;
    }

    getDisplayBoard(): TetrisBoard {
        if (this.pieceLocked) {
            if (this.lineClearRows.length === 0 || this.placementFrameCount !== 0) return this.isolatedBoard;
            return this.getMidLineClearBoard();
        }
        
        const displayBoard = this.isolatedBoard.copy();
        this.activePiece.blitToBoard(displayBoard);
        return displayBoard;
    }

    getIsolatedBoard(): TetrisBoard {
        return this.isolatedBoard;
    }

    getCurrentPieceType(): TetrominoType {
        return this.activePiece.tetrominoType;
    }
    

    getNextPieceType(): TetrominoType {
        return this.nextPieceType;
    }

    getNextNextPieceType(): TetrominoType {
        return this.nextNextPieceType;
    }

    getStatus(): MemoryGameStatus {
        return this.status;
    }

    isToppedOut(): boolean {
        return this.toppedOut;
    }

    isReachedLevelCap(): boolean {
        return this.reachedLevelCap;
    }

    getActivePiece(): MoveableTetromino {
        return this.activePiece;
    }

    isPieceLocked(): boolean {
        return this.pieceLocked;
    }

    getCountdown(): number | undefined {
        return this.countdown > 0 ? this.countdown : undefined;
    }

    getTetrisRate(): number {
        return this.status.getTetrisRate();
    }

    getDroughtCount(): number | null {
        return this.droughtCounter.getDroughtCount();
    }

    getPushdownPoints(): number {
        return this.calculatePushdown(this.status.score, this.rawPushDownPoints);
    }

    getPlacementFrameCount(): number {
        return this.placementFrameCount;
    }

    private calculatePushdown(currentScore: number, pushdownPoints: number): number {
        // Helper to convert to BCD
        function toBCD(value: number): number {
            let result = 0;
            let multiplier = 1;
            while (value > 0) {
                result += (value % 10) * multiplier;
                value = Math.floor(value / 10);
                multiplier *= 16;
            }
            return result;
        }
    
        // Helper to convert from BCD
        function fromBCD(bcd: number): number {
            let result = 0;
            let multiplier = 1;
            while (bcd > 0) {
                result += (bcd % 16) * multiplier;
                bcd = Math.floor(bcd / 16);
                multiplier *= 10;
            }
            return result;
        }

        const originalScore = currentScore;
    
        if (pushdownPoints >= 2) {
            // Extract the last two digits of the score
            const lowDigits = fromBCD(
                toBCD(currentScore % 100) + pushdownPoints - 1
            );
    
            // Round down score to the nearest hundred
            currentScore = Math.floor(currentScore / 100) * 100;
    
            // Add the modified low digits back to the score
            currentScore += lowDigits;
    
            // If lowDigits overflows (>= 100), round down to the nearest ten
            if (lowDigits >= 100) {
                currentScore = Math.floor(currentScore / 10) * 10;
            }
        }
    
        return currentScore - originalScore;
    }

    private spawnNewPiece() {

        // If linecap, game over
        if (this.levelCap && this.status.level >= this.levelCap) {
            this.toppedOut = true;
            this.reachedLevelCap = true;
            return;
        }

        // reset gravity counter. not 0 because gravity is not applied on first frame
        this.gravityCounter = 1;

        // reset pushdown flag
        this.pushingDown = false;
        this.rawPushDownPoints = 0;

        // set active piece to spawn location of next piece
        this.activePiece = MoveableTetromino.fromSpawnPose(this.nextPieceType);
        this.droughtCounter.onPiece(this.activePiece.tetrominoType);
        this.pieceLocked = false;

        // generate new next piece
        this.nextPieceType = this.nextNextPieceType;
        this.nextNextPieceType = this.rng.getNextPiece();

        // if piece is illegal, game over
        if (this.activePiece.intersectsBoard(this.isolatedBoard)) {
            this.toppedOut = true;
            console.log("topped out");
        }
    }

    // attempts to move the active piece by dr, dt
    // return true if successful, false if illegal
    private attemptMove(dr: number, dt: number): boolean {
        if (this.pieceLocked) return false; // do nothing if no piece is locked
        
        this.activePiece.moveBy(dr, dt, 0);

        // if illegal, undo
        if (!this.activePiece.isInBoundsIgnoreTop() || this.activePiece.intersectsBoard(this.isolatedBoard)) {
            this.activePiece.moveBy(-dr, -dt, 0);
            return false;
        }

        return true;
    }

    private handleTranslate(pressedKeys: CurrentlyPressedKeys) {

        // attempt translate if key is pressed
        if (pressedKeys.isJustPressed(Keybind.SHIFT_LEFT)) {
            // if legal, reset DAS. otherwise, set DAS to max (wall charge)
            this.currentDAS = this.attemptMove(0, -1) ? 0 : this.MAX_DAS;
        }
        else if (pressedKeys.isJustPressed(Keybind.SHIFT_RIGHT)) {
            // if legal, reset DAS. otherwise, set DAS to max (wall charge)
            this.currentDAS = this.attemptMove(0, 1) ? 0 : this.MAX_DAS;
        } else {

            // handle normal DAS for left/right
            const leftPressed = pressedKeys.isPressed(Keybind.SHIFT_LEFT);
            const rightPressed = pressedKeys.isPressed(Keybind.SHIFT_RIGHT);
            if (leftPressed || rightPressed) {
                this.currentDAS++;

                if (this.currentDAS >= this.MAX_DAS) {
                    // if successful shift, reset DAS. otherwise, set DAS to max (wall charge)
                    this.currentDAS = this.attemptMove(0, leftPressed ? -1 : 1) ? this.RESET_DAS : this.MAX_DAS;
                }
            }

        }
        
    }

    private handleRotate(pressedKeys: CurrentlyPressedKeys) {
        // attempt rotate if key is pressed
        if (pressedKeys.isJustPressed(Keybind.ROTATE_LEFT)) this.attemptMove(-1, 0);
        else if (pressedKeys.isJustPressed(Keybind.ROTATE_RIGHT)) this.attemptMove(1, 0);
    }

    private handlePieceDrop() {

        if (this.pieceLocked) return; // do nothing if no active piece

        // attempt moving piece downwards
        this.activePiece.moveBy(0, 0, 1);

        // if illegal, undo and lock piece instead
        if (!this.activePiece!.isInBoundsIgnoreTop() || this.activePiece.intersectsBoard(this.isolatedBoard)) {
            // console.log("piece locked");

            this.activePiece.moveBy(0, 0, -1); // undo piece drop

            this.activePiece.blitToBoard(this.isolatedBoard); // lock piece

            // reset placement frame counter, adding a lock delay before next piece spawns at placementFrameCount == 0
            this.placementFrameCount = 0 - getLockDelay(this.activePiece);

            this.pieceLocked = true; // clear active piece

            this.lineClearRows = this.isolatedBoard.getLineClearRows();
            if (this.lineClearRows.length > 0) {
                this.lineClearDelay = this.MAX_LINE_CLEAR_DELAY;
                this.placementFrameCount = -4;
            }
            
        } else {
            // successful piece drop, add pushdown points if pushing down
            if (this.pushingDown) this.rawPushDownPoints++;
            else this.rawPushDownPoints = 0;
        }
    }

    // Get state after lock for after line clear happens
    getPostLockState() {
        if (!this.pieceLocked) throw new Error("Cannot get post lock state when piece is not locked");

        // At lock, the active piece is already placed, but line clear delay is still ongoing
        const postLockBoard = this.isolatedBoard.copy();
        const postLockStatus = new SmartGameStatus(this.startLevel, this.status.lines, this.status.score, this.status.level)
        postLockStatus.onLineClear(postLockBoard.processLineClears());

        // We cycle current and next piece types for the next piece
        const current = this.nextPieceType;
        const next = this.nextNextPieceType;

        return { postLockBoard, postLockStatus, current, next };
    }

    // given the current state and a set of pressed keys, progress the state
    executeFrame(pressedKeys: CurrentlyPressedKeys) {

        // do nothing on topout
        if (this.toppedOut) return;

        if (pressedKeys.isJustPressed(Keybind.PUSHDOWN)) this.pushingDown = true;
        if (pressedKeys.isJustReleased(Keybind.PUSHDOWN)) this.pushingDown = false;

        // on first frame, spawn piece
        if (this.placementFrameCount === 0 && this.pieceLocked) {

            if (this.lineClearDelay > 0) {
                this.lineClearDelay--;

                // waiting for line clear delay to finish
                return;

            } else { // if line clear delay is over, spawn new piece

                // Count the number of line clears, and remove them from the board
                const linesCleared = this.isolatedBoard.processLineClears();

                // update score/line/level count, and update gravity accordingly
                if (linesCleared > 0) {
                    this.status.onLineClear(linesCleared);
                    this.gravity = getGravity(this.status.level);
                }

                // update pushdown
                this.status.onPushdown(this.getPushdownPoints());

                this.status.onPlacement();

                this.spawnNewPiece();
                if (this.toppedOut) return; // if piece spawn causes topout, exit

            }

        }

        // only update DAS/translation/rotation if piece is active (not during lock)
        if (this.placementFrameCount > 0) {
            if (!pressedKeys.isPressed(Keybind.PUSHDOWN)) this.handleTranslate(pressedKeys);
            this.handleRotate(pressedKeys);
        }
        
        
        if (this.countdown > 0) {
            // if we're still in countdown before game start, do not drop piece
            
            if ((this.placementFrameCount+1) % EMULATOR_FPS === 0) {
                this.countdown--;
            }

        } else {
            // we're in normal gameplay now with pieces falling

            if (this.gravityCounter === 0) {
                // gravityCounter cycles mod gravity, so this only happens once every gravity frames
                this.handlePieceDrop();
            }

            // increment gravity counter. if pushdown, gravity is bounded at 2
            let gravity = this.gravity;
            if (this.pushingDown) gravity = Math.min(2, gravity);
            this.gravityCounter = (this.gravityCounter + 1) % gravity;
    
        }

        // increment placement frame counter
        this.placementFrameCount++;        
    }

}