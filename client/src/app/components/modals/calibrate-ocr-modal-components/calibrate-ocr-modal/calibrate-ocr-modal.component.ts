import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, from, Observable, Subscription } from 'rxjs';
import { ButtonColor } from 'src/app/components/ui/solid-button/solid-button.component';
import { OCRFrame } from 'src/app/ocr/state-machine/ocr-frame';
import { ModalManagerService } from 'src/app/services/modal-manager.service';
import { FrameWithContext, VideoCaptureService } from 'src/app/services/ocr/video-capture.service';
import { PlatformInterfaceService } from 'src/app/services/platform-interface.service';
import { TetrisBoard } from 'src/app/shared/tetris/tetris-board';
import { TetrominoType } from 'src/app/shared/tetris/tetromino-type';
import { OCRVerifier } from '../ocr-verifier';
import { OcrGameService } from 'src/app/services/ocr/ocr-game.service';
import { CONFIG } from 'src/app/shared/config';


export enum CalibrationStep {
  SELECT_VIDEO_SOURCE = "Select video source",
  LOCATE_TETRIS_BOARD = "Locate tetris board",
  VERIFY_OCR = "Verify capture",
  // ANTI_CHEAT = "Anti-cheat"
}

export interface OCRFrameData {
  score: number | undefined;
  level: number | undefined;
  lines: number | undefined;
}

@Component({
  selector: 'app-calibrate-ocr-modal',
  templateUrl: './calibrate-ocr-modal.component.html',
  styleUrls: ['./calibrate-ocr-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalibrateOcrModalComponent implements OnDestroy, OnInit {

  readonly ButtonColor = ButtonColor;
  readonly TetrominoType = TetrominoType;
  readonly CalibrationStep = CalibrationStep;
  readonly EMPTY_BOARD = new TetrisBoard();

  readonly ALL_CALIBRATION_STEPS: CalibrationStep[] = CONFIG.requireOCRVerifier ? 
  [
    CalibrationStep.SELECT_VIDEO_SOURCE,
    CalibrationStep.LOCATE_TETRIS_BOARD,
    CalibrationStep.VERIFY_OCR
  ] :
  [
    CalibrationStep.SELECT_VIDEO_SOURCE,
    CalibrationStep.LOCATE_TETRIS_BOARD
  ];

  // We do not poll for level every frame, as that is too computationally expensive. Instead,
  // we poll for level every few frames and cache the result here.
  ocrFrameData$ = new BehaviorSubject<OCRFrameData | undefined>(undefined);

  public stepIndex$ = new BehaviorSubject<number>(0);

  captureDisconnectedSubscription: Subscription | undefined;
  frameUpdateSubscription: Subscription | undefined;
  private computingLevel = false;

  public ocrVerifier?: OCRVerifier;

  get currentStep(): CalibrationStep {
    return this.ALL_CALIBRATION_STEPS[this.stepIndex$.getValue()];
  }

  public DESCRIPTIONS: {[step in CalibrationStep] : string} = {
    [CalibrationStep.SELECT_VIDEO_SOURCE] : `
        If you have a NES console and the ability to capture your gameplay,
        you can play directly on your console by streaming your realtime game data in the site.
        Start by selecting a video or screen capture source connected to your NES.
        But If all this is foreign to you, just play on the browser instead!
    `,
    [CalibrationStep.LOCATE_TETRIS_BOARD] : `
      You'll need to tell nestris.org where the board is. Click on the empty or near-empty board in the source
      you're capturing to calibrate. Make sure the board, next piece, score, level, and lines are all correct before saving!
    `,
    [CalibrationStep.VERIFY_OCR] : `
      One last step to verify your capture! Start a game at level 0, then place the two pieces as indicated on the preview screen.
      Remember that cheating is strictly prohibited and can result in a ban.
    `
  }

  constructor(
    public videoCapture: VideoCaptureService,
    private modalManager: ModalManagerService,
    private readonly ocrGameService: OcrGameService,
    public readonly platform: PlatformInterfaceService,
  ) {

    // subscribe to frame updates to get level
    this.frameUpdateSubscription = this.videoCapture.getCurrentFrame$().subscribe(
      (frame: FrameWithContext | null) => {
        if (frame?.ocrFrame) this.onFrameUpdate(frame.ocrFrame);
      }
    );

    this.captureDisconnectedSubscription = this.videoCapture.captureDisconnected$.subscribe(() => this.setStepIndex(0));
  }

  ngOnInit() {

    this.initStep(this.ALL_CALIBRATION_STEPS[0]);

    // start initializing digit classifier
    this.videoCapture.initDigitClassifier();

    // generate list of video sources
    this.videoCapture.generateVideoDevicesList();

    // if there is already a video source, start capturing immediately
    if (this.videoCapture.hasCaptureSource()) {
      this.videoCapture.startCapture();
    }
  }

  // whether allowed to go to next step of stepper for calibration
  // returns true if allowed, or a string tooltip if not allowed
  nextAllowed(): true | string {

    switch (this.currentStep) {
      case CalibrationStep.SELECT_VIDEO_SOURCE:

        if (!this.videoCapture.hasCaptureSource()) return "Video source not set";

        return true;

      case CalibrationStep.LOCATE_TETRIS_BOARD:

        const ocrFrame = this.videoCapture.getCurrentFrame()?.ocrFrame;
        if (!ocrFrame) return "Invalid video frame";

        try {
          const nextPiece = ocrFrame.getNextType();
          if (nextPiece === undefined || nextPiece === TetrominoType.ERROR_TYPE) return "Valid next piece not detected";
        } catch {
          return "An error occured";
        }
        
        const frameData = this.ocrFrameData$.getValue();
        if (frameData === undefined) return "Loading...";
        if (frameData.level === undefined || frameData.level === -1) return "Valid level not detected";
        if (frameData.score === undefined || frameData.score === -1) return "Valid score not detected";
        if (frameData.lines === undefined || frameData.lines === -1) return "Valid lines not detected";

        return true;

      case CalibrationStep.VERIFY_OCR:

        const status = this.ocrVerifier!.getStatus();
        if (!status.newGame && this.ocrFrameData$.getValue()?.level !== 0) return "You aren't playing on level level 0";
        if (!status.newGame) return "You didn't start a new game at level 0";
        if (!status.firstPiece) return "You didn't place the first piece as instructed";
        if (!status.secondPiece) return "You didn't place the next piece as instructed";

        return true;
      // case CalibrationStep.ANTI_CHEAT:
      //   return true;
    }
  }

  // whether allowed to go to previous step of stepper for calibration
  previousAllowed(): boolean {
    return this.stepIndex$.getValue() > 0;
  }

  isLastStep(): boolean {
    return this.stepIndex$.getValue() === this.ALL_CALIBRATION_STEPS.length - 1;
  }

  initStep(step: CalibrationStep) {
    console.log("init step", step);

    if (step === CalibrationStep.VERIFY_OCR) {
      this.ocrVerifier = new OCRVerifier(this.ocrGameService);
    }

  }

  deinitStep(step: CalibrationStep) {
    console.log("deinit step", step);

    if (step === CalibrationStep.VERIFY_OCR) {
      this.ocrVerifier!.destroy();
      this.ocrVerifier = undefined;
    }
  }

  // go to next step of stepper for calibration
  next() {
    if (this.nextAllowed() === true) {

      // if at the last step, mark as valid, switch to this platform, and hide modal
      if (this.isLastStep()) {
        this.videoCapture.setCalibrationValid(true);
        this.modalManager.hideModal();
      }

      // otherwise, go to next step
      else this.setStepIndex(this.stepIndex$.getValue() + 1);
    }
  }

  // Enter is the same as clickign next button
    @HostListener('window:keydown', ['$event'])
    handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Enter') this.next();
    }

  // go to previous step of stepper for calibration
  previous() {
    if (this.previousAllowed()) {
      this.setStepIndex(this.stepIndex$.getValue() - 1);
    }
  }

  private setStepIndex(newIndex: number) {
    this.deinitStep(this.currentStep);
    this.stepIndex$.next(newIndex);
    this.initStep(this.currentStep);
  }


  async setScreenCapture() {

    // get screen capture, requesting with 1000px width
    const mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: 1200,
      }
    });

    this.videoCapture.setCaptureSource(mediaStream);
    this.videoCapture.startCapture();

    // Go to next step
    this.next();
  }

  async setVideoCapture() {

    // fetch the selected device in dropdown
    const selectedDevice = this.videoCapture.selectedDevice$.getValue();

    // if no device selected, stop capture
    if (!selectedDevice) {
      this.videoCapture.setCaptureSource(null);
      this.videoCapture.stopCapture();
      return;
    }

    // get video stream from selected device
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: selectedDevice.deviceId,
        width: 1200,
      }
    });

    this.videoCapture.setCaptureSource(mediaStream);
    this.videoCapture.startCapture();

    // Go to next step
    this.next();
  }

  // Periodically update ocr frame data
  async onFrameUpdate(frame: OCRFrame) {
    if (this.computingLevel) return;
    this.computingLevel = true;

    // Expensive calculation that gets number counters from frame
    let level = await frame.getLevel();
    let score = await frame.getScore(false);
    let lines = await frame.getLines(false);
    if (level === -1) level = undefined;
    if (score === -1) score = undefined;
    if (lines === -1) lines = undefined;
    this.ocrFrameData$.next({ level, score, lines });

    // wait a short time before allowing another computation
    setTimeout(() => {
      this.computingLevel = false;
    }, 300);

  }

  getLevelSync(): number | null {
    return (this.ocrFrameData$.getValue())?.level ?? null;
  }

  cancel() {
    this.videoCapture.stopCapture();
    this.videoCapture.setCaptureSource(null);
    this.videoCapture.setCalibrationValid(false);
    this.modalManager.hideModal();
  }

  ngOnDestroy() {
    this.deinitStep(this.currentStep);

    this.videoCapture.stopCapture(); // don't capture when not necessary to save processing time
    this.frameUpdateSubscription?.unsubscribe();
    this.captureDisconnectedSubscription?.unsubscribe();

    // if (!this.videoCapture.getCalibrationValid()) {
    //   this.videoCapture.setCaptureSource(null);
    // }
  }

}
