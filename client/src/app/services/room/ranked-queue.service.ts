import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { WebsocketService } from '../websocket.service';
import { FoundOpponentMessage, JsonMessageType, NumQueuingPlayersMessage } from 'src/app/shared/network/json-message';
import { FetchService, HTTPError, Method } from '../fetch.service';
import { NotificationService } from '../notification.service';
import { NotificationType } from 'src/app/shared/models/notifications';
import { Router } from '@angular/router';
import { PlatformInterfaceService } from '../platform-interface.service';
import { VideoCaptureService } from '../ocr/video-capture.service';
import { RoomService } from './room.service';
import { AnalyticsService } from '../analytics.service';

@Injectable({
  providedIn: 'root'
})
export class RankedQueueService {

  // The number of players currently in the queue
  private numQueuingPlayers$ = new BehaviorSubject<number>(0);
  private foundOpponent$ = new Subject<FoundOpponentMessage>();

  private isInQueue = false;

  constructor(
    private websocketService: WebsocketService,
    private fetchService: FetchService,
    private notifier: NotificationService,
    private platform: PlatformInterfaceService,
    private videoCapture: VideoCaptureService,
    private roomService: RoomService,
    private analytics: AnalyticsService,
    private router: Router
  ) {

    // Listen for the number of players in the queue
    this.websocketService.onEvent<NumQueuingPlayersMessage>(JsonMessageType.NUM_QUEUING_PLAYERS).subscribe(
      (message) => this.numQueuingPlayers$.next(message.count)
    );

    // Listen for when an opponent is found
    this.websocketService.onEvent<FoundOpponentMessage>(JsonMessageType.FOUND_OPPONENT).subscribe(
      (message) => this.foundOpponent$.next(message)
    );

    // Capture disconnect triggers leaving queue
    this.videoCapture.captureDisconnected$.subscribe(() => {
      this.leaveQueue();
      this.router.navigate(['/']);
    });

  }

  // Get the number of players currently in the queue
  public getNumQueuingPlayers$(): Observable<number> {
    return this.numQueuingPlayers$.asObservable();
  }

  // Subscribe to when an opponent is found
  public getFoundOpponent$(): Observable<FoundOpponentMessage> {
    return this.foundOpponent$.asObservable();
  }

  /**
   * Join the ranked queue. If successful, set isInQueue to true. If not, notify the user.
   * @returns Whether the user successfully joined the queue
   */
  public async joinQueue(): Promise<boolean> {

    // If already in queue, do nothing
    if (this.isInQueue) return true;

    // Leave any existing room
    this.roomService.leaveRoom();

    // Send a request to join the queue
    const sessionID = this.websocketService.getSessionID();
    try {
      await this.fetchService.fetch(Method.POST, `/api/v2/enter-ranked-queue/${sessionID}`);

      // If successful, set isInQueue to true
      this.isInQueue = true;

      // if not already in the ranked queue, navigate to the ranked queue
      if (this.router.url !== '/online/ranked') {
        this.router.navigate(['/online/ranked']);
      }

      this.analytics.sendEvent("join-queue");

      return true;

    } catch (error) {

      // If there was an error joining the queue, notify the user
      if (error instanceof HTTPError) {
        console.error(error);
        this.notifier.notify(NotificationType.ERROR, error.statusText);
      }

      return false;
    }
  }

  /**
   * Leave the ranked queue server-side
   */
  public async leaveQueue() {

    // If not in queue, do nothing
    if (!this.isInQueue) return;

    // Send a request to leave the queue
    await this.fetchService.fetch(Method.POST, '/api/v2/leave-ranked-queue');

    // If successful, set isInQueue to false
    this.isInQueue = false;
  }

}