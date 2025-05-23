import { AbstractNesLayoutComponent } from '../abstract-nes-layout.component';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { TetrisBoard } from 'src/app/shared/tetris/tetris-board';
import { TetrominoType } from 'src/app/shared/tetris/tetromino-type';
import { GameOverMode } from '../../nes-board/nes-board.component';
import { RatedMove } from 'src/app/components/ui/eval-bar/eval-bar.component';
import { Observable } from 'rxjs';
import { EVALUATION_TO_COLOR, overallAccuracyRating } from 'src/app/shared/evaluation/evaluation';
import MoveableTetromino from 'src/app/shared/tetris/moveable-tetromino';
import { COUNTDOWN_LINECAP_REACHED } from 'src/app/shared/network/stream-packets/packet';

@Component({
  selector: 'app-layout-one',
  templateUrl: './layout-one.component.html',
  styleUrls: ['./layout-one.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutOneComponent extends AbstractNesLayoutComponent implements OnChanges {
  @Input() board: TetrisBoard = new TetrisBoard();
  @Input() canvasBoard?: Observable<TetrisBoard>; // If defined, use canvas instead of svg for faster rendering
  @Input() nextType: TetrominoType = TetrominoType.ERROR_TYPE;
  @Input() level: number | null = 0; // if null, show -
  @Input() lines: number | null = 0; // if null, show -
  @Input() score: number | null = 0; // if null, show -
  @Input() opponentScore: number | null = null; // For showing score diff. if null, do not show diff
  @Input() countdown?: number | string;
  @Input() trt: number | null = null;
  @Input() drought: number | null = null; // if undefined, not in drought and hidden. if drought, replace trt
  @Input() das?: number = undefined; // if undefined, not in das and hidden. if das, replace trt
  @Input() accuracy: number | null = null;
  @Input() gameOver? : GameOverMode;
  @Input() gameOverShowNext: boolean = false;
  @Input() keybinds?: string;
  @Input() showEvalBar: boolean = false;
  @Input() showAccuracy: boolean = false;
  @Input() ratedMove: RatedMove | null = null;
  @Input() dimmed: boolean = false;
  @Input() enginePiece?: MoveableTetromino;
  @Output() clickNext = new EventEmitter<void>();

  readonly COUNTDOWN_LINECAP_REACHED = COUNTDOWN_LINECAP_REACHED;


  ngOnChanges(changes: SimpleChanges): void {
    // console.log('frame layout-one changes', changes);
  }

  padScore(score: number | null): string {
    if (score === null) return "------";
    return score.toString().padStart(6, '0');
  }

  accuracyLabel(accuracy: number | null): string {
    if (accuracy === null) return '-';
    return `${Math.round(accuracy * 1000) / 10}%`;
  }

  accuracyColor(accuracy: number | null): string {
    if (accuracy === null) return 'white';
    const rating = overallAccuracyRating(accuracy * 100);
    return EVALUATION_TO_COLOR[rating];
  }

  getDiffString(): string {
    const diff = (this.score ?? 0) - (this.opponentScore ?? 0);
    if (diff >= 0) return `+${diff}`;
    else return `${diff}`;
  }

  getDiffColor(): string {
    const diff = (this.score ?? 0) - (this.opponentScore ?? 0);
    if (diff >= 0) return "rgb(0,255,0)";
    else return "rgb(255,0,0)";
  }

}
