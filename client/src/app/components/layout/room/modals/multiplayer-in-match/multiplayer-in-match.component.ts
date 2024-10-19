import { Component, HostListener, Input } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonColor } from 'src/app/components/ui/solid-button/solid-button.component';
import { FetchService, Method } from 'src/app/services/fetch.service';
import { WebsocketService } from 'src/app/services/websocket.service';
import { getMatchScore, MultiplayerData, MultiplayerPlayerMode, MultiplayerRoomMode, PlayerRole } from 'src/app/shared/models/multiplayer';
import { isPlayer, Role } from 'src/app/shared/models/room-info';

@Component({
  selector: 'app-multiplayer-in-match',
  templateUrl: './multiplayer-in-match.component.html',
  styleUrls: ['./multiplayer-in-match.component.scss']
})
export class MultiplayerInMatchComponent {
  @Input() data!: MultiplayerData;
  @Input() myRole?: Role;

  readonly ButtonColor = ButtonColor;
  readonly players: PlayerRole[] = [Role.PLAYER_1, Role.PLAYER_2];
  readonly MultiplayerRoomMode = MultiplayerRoomMode;

  constructor(
    private fetchService: FetchService,
    private readonly websocket: WebsocketService,
    private readonly router: Router
  ) { }

  async toggleReady(color: string) {
    // Only the blue player can toggle ready status
    if (color !== 'blue') return;
    if (!this.myRole || !isPlayer(this.myRole)) throw new Error('Internal error: myRole is not a player');

    const sessionID = this.websocket.getSessionID();
    if (!sessionID) throw new Error('Internal error: sessionID is not set');

    let ready: string;
    if (this.data.state.players[this.myRole as PlayerRole].mode === MultiplayerPlayerMode.NOT_READY) {
      ready = "true";
    } else if (this.data.state.players[this.myRole as PlayerRole].mode === MultiplayerPlayerMode.READY) {
      ready = "false";
    } else {
      return;
    }

    // Send the request to the server to toggle the ready status
    await this.fetchService.fetch(Method.POST, `/api/v2/multiplayer/set-readiness/${sessionID}/${ready}`);
  }

  // When space or enter is pressed, toggle the ready status
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.toggleReady('blue');
    }
  }

  getPlayer(color: string): PlayerRole {

    if (!this.myRole || !isPlayer(this.myRole)) throw new Error('Internal error: myRole is not a player');

    if (color === 'blue') return this.myRole as PlayerRole;
    else if (color === 'red') return this.myRole === Role.PLAYER_1 ? Role.PLAYER_2 : Role.PLAYER_1;
    else throw new Error(`Invalid color: ${color}`);

  }

  getPlayerScore(data: MultiplayerData, role: PlayerRole): number {
    const score = getMatchScore(data.match);
    return score[role];
  }

  getPlayerStatus(data: MultiplayerData, role: PlayerRole): string {
    const mode = data.state.players[role].mode;
    switch (mode) {
      case MultiplayerPlayerMode.NOT_IN_ROOM: return "Not in room";
      case MultiplayerPlayerMode.DEAD: // Fall through
      case MultiplayerPlayerMode.NOT_READY: return "Not Ready";
      case MultiplayerPlayerMode.READY: return "Ready!";
      case MultiplayerPlayerMode.IN_GAME: return "Playing";
    }
  }

  getPlayerMessage(data: MultiplayerData, role: PlayerRole): string {

    if (!this.myRole || !isPlayer(this.myRole)) {
      return "Internal error: myRole is not a player";
    }

    if (data.state.mode === MultiplayerRoomMode.COUNTDOWN) {
      return "Game is starting...";
    }

    // At this point, we know that the room is in WAITING mode
    if (data.state.mode !== MultiplayerRoomMode.WAITING) {
      throw new Error(`Internal error: modal should not be displayed for mode ${data.state.mode}`);
    }

    const mode = data.state.players[role].mode;
    switch (mode) {
      case MultiplayerPlayerMode.NOT_IN_ROOM: return "Waiting for player to rejoin...";
      case MultiplayerPlayerMode.DEAD: // Fall through
      case MultiplayerPlayerMode.NOT_READY: 
        return this.myRole === role ? "Click here when you’re ready!" : "Waiting for opponent...";
      case MultiplayerPlayerMode.READY:
        return this.myRole === role ? "Click again if you’re not ready" : "Opponent is waiting for you";
      case MultiplayerPlayerMode.IN_GAME: return "Started game";
    }
  }

  getLevelClasses(data: MultiplayerData, level: number): string[] {
    const classes = [data.state.levelPicker === this.myRole ? 'blue' : 'red'];
    if (data.state.startLevel !== level) classes.push('not-selected');
    return classes;
  }

  async selectLevel(level: number) {

    // Only the blue player can select the level
    if (this.data.state.levelPicker !== this.myRole) return;

    // Send the request to the server to select the level
    await this.fetchService.fetch(Method.POST, `/api/v2/multiplayer/select-level/${this.websocket.getSessionID()}/${level}`);
  }

  leaveMatch() {
    this.router.navigate(['/']);
  }
}
