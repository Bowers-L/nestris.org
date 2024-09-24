import { BlockSet } from "./block-set";
import { Point } from "./point";
import { ColorType, TetrisBoard } from "./tetris-board";
import { getColorTypeForTetromino } from "./tetromino-colors";
import { PIECE_TOP_LEFT } from "./tetromino-shapes";
import { ALL_TETROMINO_TYPES, TetrominoType } from "./tetromino-type";
import { TETROMINO_CHAR, Tetromino } from "./tetrominos";

/*
A tetromino set to some absolute position and rotation on the board. Mutable, so can be translated around.
Exposes utility methods for checking if the tetromino is in bounds, and if it is colliding with
other blocks.
*/

export interface MTPose {
    r: number;
    x: number;
    y: number;
}

export default class MoveableTetromino {

    private currentBlockSet!: BlockSet;

    public readonly color: ColorType;

    // Returns the starting pose of a piece at spawn
    static fromSpawnPose(tetrominoType: TetrominoType): MoveableTetromino {

        // special case: I piece needs to be one higher
        const y = (tetrominoType === TetrominoType.I_TYPE) ? -2 : -1;

        return new MoveableTetromino(tetrominoType, 0, 3, y);
    }

    static fromStackRabbitPose(tetrominoType: TetrominoType, r: number, x: number, y: number) {

        // special case: I piece needs to be one higher
        const dy = (tetrominoType === TetrominoType.I_TYPE) ? -2 : -1;

        return new MoveableTetromino(tetrominoType, r, x + 3, y + dy);
    }

    static fromMTPose(tetrominoType: TetrominoType, pose: MTPose): MoveableTetromino {
        return new MoveableTetromino(tetrominoType, pose.r, pose.x, pose.y);
    }

    constructor(public readonly tetrominoType: TetrominoType, private rotation: number, private translateX: number, private translateY: number) {
        this.rotation = rotation % Tetromino.getPieceByType(tetrominoType).numPossibleRotations();
        this.color = getColorTypeForTetromino(tetrominoType);
        this.updateCurrentBlockSet()
    }

    copy(): MoveableTetromino {
        return new MoveableTetromino(this.tetrominoType, this.rotation, this.translateX, this.translateY);
    }

    public contains(x: number, y: number): boolean {
        return this.getCurrentBlockSet().contains(x, y);
    }

    // encoding format: TRXXYY
    public encodeAsNumber(): number {

        const typeAsNumber: number = this.tetrominoType as number;
        return typeAsNumber * 100000 + this.rotation * 10000 + this.translateX * 100 + this.translateY;
    }

    static decodeFromNumber(number: number): MoveableTetromino {

        const typeAsNumber = Math.floor(number / 100000);
        let type: TetrominoType;
        switch (typeAsNumber) {
            case 0: type = TetrominoType.I_TYPE; break;
            case 1: type = TetrominoType.J_TYPE; break;
            case 2: type = TetrominoType.L_TYPE; break;
            case 3: type = TetrominoType.O_TYPE; break;
            case 4: type = TetrominoType.S_TYPE; break;
            case 5: type = TetrominoType.T_TYPE; break;
            case 6: type = TetrominoType.Z_TYPE; break;
            default: throw new Error("invalid typeAsNumber");
        }

        const rotation = Math.floor((number % 100000) / 10000);
        const translateX = Math.floor((number % 10000) / 100);
        const translateY = Math.floor(number % 100);

        return new MoveableTetromino(type, rotation, translateX, translateY);
    }

    /**
     * Attempt to extract a MoveableTetromino from an otherwise-empty TetrisBoard, or null if one is not found.
     * @param board The TetrisBoard to extract from
     * @returns The extracted MoveableTetromino, or null if one is not found
     */
    static extractFromTetrisBoard(board: TetrisBoard): MoveableTetromino | null {

        // The board can only contain the exact number of minos a tetromino has
        if (board.count() !== 4) return null;

        // Find the top left block of the tetromino in the TetrisBoard
        const topLeft = (() => {
            for (let y = 0; y < 20; y++) {
                for (let x = 0; x < 10; x++) {
                    if (board.exists(x, y)) return { x, y };
                }
            }
            throw new Error("Board is empty");
        })();

        // Iterate through each rotation of each tetromino type, and check for a match
        for (let type of ALL_TETROMINO_TYPES) {
            for (let r = 0; r < Tetromino.getPieceByType(type).numPossibleRotations(); r++) {

                // The MT that is aligned with the top left block of the board's top left block
                const offset = PIECE_TOP_LEFT[type][r];
                const MT = new MoveableTetromino(type, r, topLeft.x - offset.x, topLeft.y - offset.y);

                // Check if each block of the MT is in the board
                if (MT.getCurrentBlockSet().blocks.every(block => board.exists(block.x, block.y))) {
                    return MT;
                }
            }
        }

        return null;
    }


    private updateCurrentBlockSet(): void {
        const tetromino = Tetromino.getPieceByType(this.tetrominoType);
        this.currentBlockSet = tetromino.getBlockSet(this.rotation).translate(this.translateX, this.translateY);
    }

    public getCurrentBlockSet(): BlockSet {
        return this.currentBlockSet;
    }

    public getRotation(): number {
        return this.rotation;
    }

    public getTranslateX(): number {
        return this.translateX;
    }

    public getTranslateY(): number {
        return this.translateY;
    }

    public getMTPose(): MTPose {
        return { r: this.rotation, x: this.translateX, y: this.translateY };
    }

    public getLowestY(): number {
        return this.getCurrentBlockSet().maxY;
    }

    public updatePose(rotation: number | undefined, translateX: number | undefined, translateY: number | undefined): void {
        if (rotation !== undefined) {
            const numPossibleRotations = Tetromino.getPieceByType(this.tetrominoType).numPossibleRotations();
            this.rotation = rotation % numPossibleRotations;
        }
        if (translateX !== undefined) {
            this.translateX = translateX;
        }
        if (translateY !== undefined) {
            this.translateY = translateY;
        }
        this.updateCurrentBlockSet();
    }

    public moveBy(dr: number, dx: number, dy: number): void {
        this.updatePose(this.rotation + dr + 4, this.translateX + dx, this.translateY + dy);
    }

    public rotateBy(delta: number): void {
        const numPossibleRotations = Tetromino.getPieceByType(this.tetrominoType).numPossibleRotations();
        this.rotation = (this.rotation + delta) % numPossibleRotations;
        this.updateCurrentBlockSet();
    }

    // attempt to kick the piece in all directions to a valid placement
    public kickToValidPlacement(board: TetrisBoard, hoveredX: number, hoveredY: number, piece: TetrominoType, rotation: number): void {

        // no need to kick if already valid
        if (this.isValidPlacement(board)) return;

        let kickOffsets: Point[] = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: 1, y: -1 },
            { x: -1, y: -1 },
            { x: 1, y: 1 },
            { x: -1, y: 1 },
            { x: 0, y: 2 },
            { x: -1, y: 2 },
            { x: 1, y: 2 },

        ];

        // vertical longbar has different kick offsets. No horizontal kicks if vertical
        if (piece === TetrominoType.I_TYPE && rotation % 2 === 1) {
            kickOffsets = [
                { x: 0, y: 0 },
                { x: 0, y: -1 },
                { x: 0, y: 1 },
                { x: 0, y: -2 },
                { x: 0, y: 2 },
            ];
        }


        let bestNotContainingMT: Point | undefined = undefined;
        for (let offset of kickOffsets) {
            const MT = new MoveableTetromino(this.tetrominoType, this.rotation, this.translateX + offset.x, this.translateY + offset.y);
            if (MT.isValidPlacement(board)) {
                
                if (MT.contains(hoveredX, hoveredY)) {
                    // If it's the best placement so far AND it contains the hovered block, then we definitely want tomove to it
                    this.moveBy(0, offset.x, offset.y);
                    return;
                } else if (bestNotContainingMT === undefined) {
                    // If it's the best placement so far, but it doesn't contain the hovered block, we'd prefer a
                    // placement with the hovered block, but we'll take this one if we can't find one
                    bestNotContainingMT = offset;
                }
            }
        };

        // We try to look for placements that contain the hovered block. But if we can't find
        // any, we just move to the best placement that doesn't contain the hovered block
        if (bestNotContainingMT !== undefined) {
            this.moveBy(0, bestNotContainingMT.x, bestNotContainingMT.y);
        }
    }

    public moveIntoBounds(): void {
        const blockSet = this.getCurrentBlockSet();
        const minX = blockSet.minX;
        const maxX = blockSet.maxX;
        const minY = blockSet.minY;
        const maxY = blockSet.maxY;

        if (minX < 0) {
            this.moveBy(0, -minX, 0);
        }
        if (maxX > 9) {
            this.moveBy(0, 9 - maxX, 0);
        }
        if (minY < 0) {
            this.moveBy(0, 0, -minY);
        }
        if (maxY > 19) {
            this.moveBy(0, 0, 19 - maxY);
        }
    }

    // whether the entire MT is within the bounds of the board
    public isInBounds(): boolean {
        return this.getCurrentBlockSet().blocks.every(block => block.inBounds());
    }

    // whether the entire MT is within the bounds of the board, but ignores if out of top bounds
    public isInBoundsIgnoreTop(): boolean {
        return this.getCurrentBlockSet().blocks.every(block => block.x >= 0 && block.x < 10 && block.y < 20);
    }


    // Whether one of the minos of this tetromino is a the given position
    public isAtLocation(x: number, y: number): boolean {
        return this.getCurrentBlockSet().blocks.some(block => block.x === x && block.y === y);
    }

    // blit each block of the tetromino into the board with the tetromino's color
    public blitToBoard(board: TetrisBoard) {

        const blockSet = this.getCurrentBlockSet();
        blockSet.blocks.forEach(block => {
            board.setAt(block.x, block.y, this.color);
        });
    }

    public intersectsBoard(board: TetrisBoard): boolean {
        return this.getCurrentBlockSet().blocks.some(block => board.exists(block.x, block.y));
    }

    // placement is valid if the piece is in bounds, and does not intersect with the grid, 
    // but moving the piece down one row would intersect with the grid
    public isValidPlacement(board: TetrisBoard): boolean {
        if (!this.isInBoundsIgnoreTop()) return false;
        if (this.intersectsBoard(board)) return false;
        const movedMT = new MoveableTetromino(this.tetrominoType, this.rotation, this.translateX, this.translateY + 1);
        return !movedMT.isInBounds() || movedMT.intersectsBoard(board);
    }

    // whether the two MTs are the same type and  at the exact same pose
    public equals(other: MoveableTetromino): boolean {
        if (this.tetrominoType !== other.tetrominoType) return false;
        if (this.rotation !== other.rotation) return false;
        if (this.translateX !== other.translateX) return false;
        if (this.translateY !== other.translateY) return false;
        return true;
    }

    // return in tetris notation
    public getTetrisNotation(): string {

        let string = "" + TETROMINO_CHAR[this.tetrominoType] + "-";

        // find all the columns that have blocks
        const columns: number[] = [];
        this.getCurrentBlockSet().blocks.forEach(block => {
            if (!columns.includes(block.x)) {
                columns.push(block.x);
            }
        });

        // sort columns in ascending order
        columns.sort((a, b) => a - b);

        // assemble into string
        columns.forEach(column => {
            if (column === 9) string += "0";
            else string += column + 1;
        });

        return string;
    }

    public print() {

        const mask = new TetrisBoard();
        this.blitToBoard(mask);

        console.log(this.getTetrisNotation());
        mask.print();
    }
}
