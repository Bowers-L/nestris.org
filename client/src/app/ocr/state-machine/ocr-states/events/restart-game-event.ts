import { OCRFrame } from "../../ocr-frame";
import { StartGameEvent } from "../states/before-game-state";
import { OCRStateID } from "../ocr-state-id";

/**
 * Defines an event to start a new game when conditions are met, while already in a game or in limbo. Checks that
 * it isn't just the same game, and if it is a new game, ends the previous one before starting the new one
 */
export class RestartGameEvent extends StartGameEvent {
    public override readonly name = "RestartGameEvent";

    /**
     * In addition to meeting normal game start requirements, make sure this isn't the same game. We can only
     * be sure of this if a placement has already been made in previous game
     * @param ocrFrame 
     */
    protected override async precondition(ocrFrame: OCRFrame): Promise<boolean> {

        // Only if multiple games allowed
        if (!this.config.multipleGames) return false;

        // If in a game but haven't made a placement yet, so can't be sure it's a new game
        if (this.globalState.game && this.globalState.game.getNumPlacements() === 0) {

            // Can't be sure if the next box is the same. but if next box has changed, then it's fine to assume new game
            const nextType = ocrFrame.getNextType();
            if (this.globalState.game.getNextType() === nextType) {
                return false;
            }
        }

        return await super.precondition(ocrFrame);
    }

    /**
     * When the persistence condition is met, we transition into InGameState. We end the ongoing
     * game, and start the new one
     * @param ocrFrame The current OCR frame
     * @returns The new state to transition to
     */
    override async triggerEvent(ocrFrame: OCRFrame): Promise<OCRStateID | undefined> {
        
        // First, end the game
        this.globalState.endGame();
        
        // Next, start new game
        return super.triggerEvent(ocrFrame);
    }

}