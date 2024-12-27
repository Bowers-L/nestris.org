import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ColorType } from 'src/app/shared/tetris/tetris-board';
import { getColorForLevel } from 'src/app/shared/tetris/tetromino-colors';

@Component({
  selector: '[app-nes-block]',
  templateUrl: './nes-block.component.html',
  styleUrls: ['./nes-block.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NesBlockComponent {
  @Input() color: ColorType | "engine" = ColorType.EMPTY;
  @Input() level: number = 18;
  
  @Input() offsetX: number = 0;
  @Input() offsetY: number = 0;
  @Input() isHovering: boolean = false;

  // if is log in page, white color with rounded corners
  @Input() isLoginPage: boolean = false;

  readonly Color = ColorType;

  constructor() {}

  getBackgroundColor(): string {
    
    if (this.color === ColorType.EMPTY || this.color === undefined || this.color === "engine") return "rgb(0,0,0,0)"; // invisible if empty

    // if is login page, force to be white
    if (this.isLoginPage) return "white";

    const colorType = (this.color === ColorType.WHITE) ? ColorType.PRIMARY : this.color;
    return getColorForLevel(colorType, this.level);
  }

  // for solid blocks, get the four white pixel locations to draw on the block
  public getWhiteLocations(): {x: number, y: number}[] {
    return [
      {x: 0, y: 0},
      {x: 1, y: 1},
      {x: 1, y: 2},
      {x: 2, y: 1}
    ];
  }
}
