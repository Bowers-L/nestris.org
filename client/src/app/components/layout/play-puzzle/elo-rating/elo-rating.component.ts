import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';


export enum EloMode {
  NEUTRAL = 'NEUTRAL',
  WIN = 'WIN',
  LOSS = 'LOSS',
}

@Component({
  selector: 'app-elo-rating',
  templateUrl: './elo-rating.component.html',
  styleUrls: ['./elo-rating.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EloRatingComponent implements OnInit, OnChanges {

  readonly EloMode = EloMode;
  @Input() mode: EloMode = EloMode.NEUTRAL;

  @Input() rating!: number;
  @Input() increase!: number;
  @Input() decrease!: number;

  adjustedRating!: number;

  displayRating = new BehaviorSubject<number>(1000);

  ngOnInit() {
    this.displayRating.next(this.adjustedRating);
  }

  // when rating changes, have displayRating approach rating over time
  ngOnChanges() {

    this.adjustedRating = this.rating;
    if (this.mode === EloMode.WIN) this.adjustedRating += this.increase;
    if (this.mode === EloMode.LOSS) this.adjustedRating -= this.decrease;

    const oldRating = this.displayRating.getValue();

    // if rating is already equal to displayRating, do nothing
    if (oldRating === this.adjustedRating) return;

    // delay 300ms before starting animation to set displayRating to rating
    setTimeout(
      () => this.animateRating(),
      300
    );
  }

  // recursively call itself until displayRating is equal to rating
  animateRating() {

    // how fast to approach rating
    const RATE = 0.1;

    const oldRating = this.displayRating.getValue();
    
    // if difference is less than 1, set display rating to rating and exit loop
    if (Math.abs(this.adjustedRating - oldRating) < 1) {
      this.displayRating.next(this.adjustedRating);
      return;
    }

    // otherwise, update display rating and call again
    this.displayRating.next(oldRating + (this.adjustedRating - oldRating) * RATE);
    requestAnimationFrame(() => this.animateRating());

  }

}
