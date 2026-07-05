import { Injectable, effect, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { OfflineQueueItem, QueueEntity } from '../models/offline-queue.model';
import { NetworkStatusService } from './network-status.service';
import { OfflineQueueService } from './offline-queue.service';
import { SupabaseService } from './supabase.service';

const MAX_RETRIES = 5;

const ENTITY_TABLES: Record<QueueEntity, string> = {
  time_entry: 'time_entries',
  time_segment: 'time_segments',
  damage_report: 'damage_reports',
};

/**
 * Drainiert die Offline-Queue nach Supabase, sobald Netz verfügbar ist (E-08).
 * Idempotenz über client_id-Upsert: doppelte Sends erzeugen keine Duplikate.
 * Items werden erst NACH Supabase-Bestätigung aus IndexedDB gelöscht.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly supabase = inject(SupabaseService);
  private readonly queue = inject(OfflineQueueService);
  private readonly network = inject(NetworkStatusService);
  private readonly snackBar = inject(MatSnackBar);

  private readonly _syncing = signal(false);
  readonly syncing = this._syncing.asReadonly();

  constructor() {
    effect(() => {
      if (this.network.isOnline()) {
        void this.syncNow();
      }
    });
  }

  /** Manueller Sync-Button als Fallback (US-19, iOS). */
  async syncNow(): Promise<void> {
    if (this._syncing()) {
      return;
    }
    this._syncing.set(true);
    try {
      const items = await this.queue.getPending();
      let synced = 0;
      for (const item of items) {
        const ok = await this.syncItem(item);
        if (!ok) {
          break; // Reihenfolge wahren: bei Fehler abbrechen, später erneut
        }
        synced++;
      }
      if (synced > 0 && this.queue.pendingCount() === 0) {
        this.snackBar.open('Alle Daten synchronisiert', undefined, { duration: 3000 });
      }
    } finally {
      this._syncing.set(false);
    }
  }

  private async syncItem(item: OfflineQueueItem): Promise<boolean> {
    await this.queue.setStatus(item.id, 'syncing');
    try {
      const table = ENTITY_TABLES[item.entity];
      const { error } = await this.supabase
        .from(table)
        .upsert({ ...item.payload, client_id: item.id }, { onConflict: 'client_id' });
      if (error) {
        throw new Error(error.message);
      }
      await this.queue.remove(item.id);
      return true;
    } catch (err) {
      const retries = item.retry_count + 1;
      const failed = retries >= MAX_RETRIES;
      await this.queue.setStatus(item.id, failed ? 'failed' : 'pending', retries);
      if (failed) {
        this.snackBar.open(
          `Synchronisation fehlgeschlagen: ${(err as Error).message}`,
          'OK',
          { duration: 6000 },
        );
      }
      this.network.reportConnectivity(navigator.onLine);
      return false;
    }
  }
}
