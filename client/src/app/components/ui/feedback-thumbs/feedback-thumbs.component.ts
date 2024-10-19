import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FetchService, Method } from 'src/app/services/fetch.service';
import { WebsocketService } from 'src/app/services/websocket.service';
import { PuzzleFeedback } from 'src/app/shared/puzzles/puzzle-feedback';

@Component({
  selector: 'app-feedback-thumbs',
  templateUrl: './feedback-thumbs.component.html',
  styleUrls: ['./feedback-thumbs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedbackThumbsComponent {
  @Input() puzzleID!: string;

  public feedback$ = new BehaviorSubject<PuzzleFeedback>(PuzzleFeedback.NONE);

  readonly PuzzleFeedback = PuzzleFeedback;

  constructor(
    private fetchService: FetchService,
    private websocketService: WebsocketService,
  ) {}

  async setFeedback(feedback: PuzzleFeedback) {

    const userid = this.websocketService.getUserID();

    if (!userid) {
      console.error("No userid found");
      return;
    }

    const body = {
      id: this.puzzleID,
      userid: userid,
      feedback: feedback,
    };

    const response = await this.fetchService.fetch(Method.POST, `/api/v2/set-feedback`, body);
    console.log("Feedback response:", response);

    this.feedback$.next(feedback);
  }

}
