import { Calibration, CalibrationPlus } from "../util/calibration";
import { Frame } from "../util/frame";
import { FloodFill } from "../util/floodfill";
import { Point } from "../../shared/tetris/point";
import { BoardOCRBox } from "./board-ocr-box";
import { NextOCRBox } from "./next-ocr-box";
import { scalePointWithinRect } from "../util/rectangle";

/**
 * Given a frame and a point, calibrate all the bounding rectangles for all the OCR elements.
 * 
 * @param frame The frame to use for calibration
 * @param frameIndex The index of the provided calibration frame in the video
 * @param point The point to start the main board floodfill from
 */
export function calibrate(frame: Frame, point: Point): [Calibration, CalibrationPlus] {

    // Floodfill at the given point to derive the main board
    const boardRect = FloodFill.fromFrame(frame, point).getBoundingRect();
    if (!boardRect) throw new Error("Could not floodfill main board");

    // Use the main board rect to derive floodfill points and thus bounding rect for the next box
    const NEXTBOX_LOCATIONS: Point[] = [
        {x: 1.5, y: 0.42}, // top of the next box
        {x: 1.5, y: 0.58} // bottom of the next box
    ];
    let nextRect = FloodFill.fromRelativeRect(frame, boardRect, NEXTBOX_LOCATIONS).getBoundingRect();
    if (!nextRect) {
        console.log("Could not floodfill next box");
        nextRect = {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0
        };
    }

    const calibration: Calibration = {
        floodfillPoint: point,
        rects: {
            board: boardRect,
            next: nextRect
        }
    };

    const points = Object.assign({},
        (new BoardOCRBox(boardRect)).getPlusPoints(),
        { 
            next: (new NextOCRBox(nextRect)).getGridPoints().flat(),
            nextFloodfill: NEXTBOX_LOCATIONS.map(point => scalePointWithinRect(boardRect, point, true))
        }
    )

    const calibrationPlus: CalibrationPlus = {
        points: points,
    };

    return [calibration, calibrationPlus];
}