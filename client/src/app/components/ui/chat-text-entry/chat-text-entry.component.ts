import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const MAX_CHARACTERS = 100;

@Component({
  selector: 'app-chat-text-entry',
  templateUrl: './chat-text-entry.component.html',
  styleUrls: ['./chat-text-entry.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatTextEntryComponent {
  @Input() disabledMessage?: string;
  @Input() placeholderText: string = 'Send a message...';
  @Output() sendMessage = new EventEmitter<string>();

  public message: string = "";
  public rows$ = new BehaviorSubject<number>(1);

  constructor(
    private elementRef: ElementRef
  ) {}

  public clickSubmitButton() {
      if (this.message) this.submitMessage(this.message);
    }
  
    public onChange(event: any) {
  
      let decreased = false;
  
      const textarea = this.elementRef.nativeElement.querySelector('textarea');
  
      try {
  
        // submit message if not empty message, and enter key was pressed
        if (event.inputType === 'insertLineBreak') {
          if (this.message) this.submitMessage(this.message);
          else textarea.value = "";
          return;
        }
  
        // If exceeds max chars, set to previous value
        if (event.target.value.length > MAX_CHARACTERS) {
          textarea.value = this.message;
          return;
        }
  
        if (this.message.length > event.target.value.length) {
          decreased = true;
        }
        this.message = event.target.value;
      } catch {
        return;
      }
  
      if (decreased) {
        this.rows$.next(1);
  
        setTimeout(() => {
          this.updateRowCount();
        }, 0);
  
      }
      else this.updateRowCount();
    }

  
    private updateRowCount() {
      const textarea = this.elementRef.nativeElement.querySelector('textarea');
      const scrollHeight = textarea.scrollHeight;
      const rowCount = Math.round(scrollHeight / 14);
      this.rows$.next(rowCount);
    }
  
    private submitMessage(message: string) {
      console.log('Sending message:', message);
  
      // Reset the message
      const textarea = this.elementRef.nativeElement.querySelector('textarea');
      textarea.value = "";
      this.rows$.next(1);
      this.message = "";
  
      // Emit the message
      this.sendMessage.emit(message);
    }

}
