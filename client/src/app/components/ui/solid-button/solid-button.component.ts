import { ChangeDetectionStrategy, Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export enum ButtonColor {
  GREEN = "#54A165",
  RED = "#B73C3C",
  BLUE = "#3C5EB7",
  GREY = "#2F3033",
  LIGHT_GREY = "#2D2D31"
}

@Component({
  selector: 'app-solid-button',
  templateUrl: './solid-button.component.html',
  styleUrls: ['./solid-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SolidButtonComponent {
  @Input() icon?: string;
  @Input() label?: string;
  @Input() color: string | ButtonColor = ButtonColor.BLUE;
  @Input() disabled: boolean = false;
  @Input() stretch: boolean = false; // stretch to fit parent width
  @Input() fontSize: number = 16;
  @Input() fontWeight: number = 600;
  @Input() loading: boolean = false;
  @Input() loadingSize: number = 30;
  @Input() paddingHorizontal: number = 15;
  @Input() paddingVertical: number = 6;
  @Input() borderRadius: number = 5;
  @Input() disableHover: boolean = false;
  @Input() iconHeight?: number;
  @Input() noShadow: boolean = false;
  @Input() gap: number = 4;
  @Input() enableLoadingAnimation: boolean = false;

  @Input() action: (() => Promise<void>) | null = null;

  @Output() smartClick = new EventEmitter<MouseEvent>();

  @HostBinding('class.stretchHost') get stretchHost() { return this.stretch; }

  actionLoading$ = new BehaviorSubject<boolean>(false);

  // Click only if not disabled or loading
  async onClick(event: MouseEvent) {
    if (!this.disabled && !this.loading && !this.actionLoading$.getValue()) {

      if (this.action) {
        const action = this.action();
        this.actionLoading$.next(true);
        await action;
        this.actionLoading$.next(false);
      }

      this.smartClick.emit(event);
    }
  }

}
