import { Directive, ElementRef, HostListener, Input, OnDestroy } from '@angular/core';
import { TooltipService } from '../services/tooltip.service';

@Directive({
  selector: '[tooltip]'
})
export class TooltipDirective implements OnDestroy {

  @Input('tooltip') tooltipText: string = '';

  constructor(private el: ElementRef, private tooltipManager: TooltipService) {}

  @HostListener('mouseenter', ['$event']) onMouseEnter(event: MouseEvent) {

    console.log("Mouse enter event triggered", this.tooltipText);

    // If there is no tooltip text, don't show the tooltip
    if (!this.tooltipText || this.tooltipText === "") return;

    this.tooltipManager.show(this.tooltipText, event.clientX, event.clientY);
  }

  @HostListener('mousemove', ['$event']) onMouseMove(event: MouseEvent) {
    this.tooltipManager.setPosition(event.clientX, event.clientY);
  }

  @HostListener('mouseleave') onMouseLeave() {
    this.tooltipManager.hide();
  }

  // This method gets called when the directive/component is destroyed
  ngOnDestroy() {
    this.tooltipManager.hide();
  }

}
