import { Frame } from "../util/frame";
import { Rectangle, scalePointWithinRect } from "../util/rectangle";
import { DigitClassifier, Prediction } from "../digit-classifier/digit-classifier";

// width and height for the normalized rect around one digit
const NUMBER_PIXEL_SIZE = 14;

/**
 * OCRs each of the digits found within the OCR box
 */
export class NumberOCRBox {

    constructor(
        public readonly numDigits: number,
        public readonly rect: Rectangle,
        private readonly digitClassifier?: DigitClassifier,
    ) {}

    /**
     * Get the normalized bitmask for a digit with a fixed 16x16 width and height by averaging
     * the values
     * @param digit The digit to get the matrix for, where digit < this.numDigits
     * @param frame The video frame to get the digit matrix for
     * @param threshold The cutoff for what should be evaluated as a white or black pixel
     * @param offset The offset for each of top, left, bottom, and right for the digit bounding box
     */
    getDigitMatrix(
        digit: number,
        frame: Frame,
        threshold: number = 100,
        offset: Rectangle = {left: 0, top: 0, right: 0, bottom: 0}
    ): number[][] {

        if (digit >= this.numDigits) throw new Error(`Digit ${digit} must be less than this.numDigits ${this.numDigits}`);

        const topLeft = scalePointWithinRect(this.rect, { x: digit / this.numDigits, y : 0 }, true);
        const bottomRight = scalePointWithinRect(this.rect, { x: (digit+1) / this.numDigits, y : 1 }, true);
        const digitRect: Rectangle = {
            top: topLeft.y + offset.top,
            left: topLeft.x + offset.left,
            bottom: bottomRight.y + offset.bottom,
            right: bottomRight.x + offset.right,
        };

        const matrix = [];
        for (let y = 0; y < NUMBER_PIXEL_SIZE; y++) {
            const row = [];
            for (let x = 0; x < NUMBER_PIXEL_SIZE; x++) {

                const tl = scalePointWithinRect(digitRect, { x: x / NUMBER_PIXEL_SIZE, y: y / NUMBER_PIXEL_SIZE }, true);
                const br = scalePointWithinRect(digitRect, { x: (x+1) / NUMBER_PIXEL_SIZE, y: (y+1) / NUMBER_PIXEL_SIZE }, true);
                
                let sum = 0;
                for (let py = tl.y; py <= br.y; py++) {
                    for (let px = tl.x; px <= br.x; px++) {
                        sum += (frame.getPixelAt({x : px, y : py})?.average ?? 0) > threshold ? 1 : 0;
                    }
                }
                const numCells = (br.y - tl.y + 1) * (br.x - tl.x + 1);
                row.push(sum / numCells);
            }
            matrix.push(row);
        }

        // let str = "";
        // for (let y = 0; y < matrix.length; y++) {
        //     for (let x = 0; x < matrix[0].length; x++) {
        //         str += Math.round(matrix[y][x]).toString();
        //     }
        //     str += "\n";
        // }
        // console.log(str);

        return matrix;
    }

    async predictDigit(digit: number, frame: Frame): Promise<Prediction | undefined> {
        if (!this.digitClassifier) {
            console.error("Digit classifier not set");
            return undefined;
        }
        return await this.digitClassifier.predictDigit(this.getDigitMatrix(digit, frame));
    }

    async predictDigits(frame: Frame, ignoreFirstDigit: boolean = false): Promise<(Prediction | undefined)[]>{

        // Determine starting index based on ignoreFirstDigit flag
        const startIndex = ignoreFirstDigit ? 1 : 0;
        
        // Create array of indices to process
        const indices = Array.from(
            {length: this.numDigits - startIndex}, 
            (_, i) => i + startIndex
        );
        
        // Process each digit in parallel and return results
        return await Promise.all(
            indices.map(i => this.predictDigit(i, frame))
        );
    }


}