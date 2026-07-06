import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { OfflineQueueService } from '../../../core/services/offline-queue.service';
import { SyncService } from '../../../core/services/sync.service';

/** Online/Offline-Badge mit Anzahl ausstehender Events und manuellem Sync (US-19). */
@Component({
  selector: 'app-sync-indicator',
  imports: [MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    @if (network.isOnline()) {
      @if (queue.pendingCount() > 0) {
        <button
          matButton
          class="indicator pending"
          (click)="sync.syncNow()"
          matTooltip="Jetzt synchronisieren"
        >
          <mat-icon>sync</mat-icon>
          {{ queue.pendingCount() }} ausstehend
        </button>
      } @else {
        <span class="indicator online" matTooltip="Alle Daten synchronisiert">
          <mat-icon>cloud_done</mat-icon>
          Online
        </span>
      }
    } @else {
      <span class="indicator offline">
        <mat-icon>cloud_off</mat-icon>
        Offline – {{ queue.pendingCount() }} ausstehend
      </span>
    }
  `,
  styles: `
    .indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      padding: 4px 10px;
      border-radius: 16px;
    }
    .online {
      color: var(--hugo-status-ok);
      background: color-mix(in srgb, var(--hugo-status-ok) 12%, var(--hugo-paper));
    }
    .pending,
    .offline {
      color: var(--hugo-status-warn);
      background: color-mix(in srgb, var(--hugo-status-warn) 12%, var(--hugo-paper));
    }
    mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `,
})
export class SyncIndicatorComponent {
  readonly network = inject(NetworkStatusService);
  readonly queue = inject(OfflineQueueService);
  readonly sync = inject(SyncService);
}
