import { Point } from "../../shared/tetris/point";
import { Rectangle } from "./rectangle";

/**
 * Represents the complete calibration settings for a video, which is used to OCR each frame.
 */
export interface Calibration {

    // The point that the floodfill started from
    floodfillPoint: Point;

    // All the bounding rectangles for the OCR elements
    rects: {
        board: Rectangle;
        next: Rectangle;
        level: Rectangle;
        score: Rectangle;
    }
    // TODO 
}

// Extra generated calibration data that is useful for debugging
export interface CalibrationPlus {

    // Each group represents a set of colored points to draw on the canvas
    points: {[group: string]: Point[]};
}