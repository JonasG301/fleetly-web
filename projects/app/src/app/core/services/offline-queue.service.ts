import { Injectable, signal } from '@angular/core';
import {
  OfflineQueueItem,
  QueueEntity,
  QueueEventType,
  QueueStatus,
} from '../models/offline-queue.model';
import { QUEUE_STORE, getFleetlyDb } from './idb';

/**
 * Lokaler Puffer für Stempel-Events und Schadensmeldungen (E-08).
 * Items werden erst nach Supabase-Bestätigung durch den SyncService gelöscht.
 * enqueue() mit gleicher ID überschreibt das pending-Item (Payload wird vollständiger).
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly _pendingCount = signal(0);
  readonly pendingCount = this._pendingCount.asReadonly();

  constructor() {
    void this.refreshCount();
  }

  async enqueue(
    id: string,
    entity: QueueEntity,
    eventType: QueueEventType,
    payload: Record<string, unknown>,
  ): Promise<OfflineQueueItem> {
    const db = await getFleetlyDb();
    const existing = (await db.get(QUEUE_STORE, id)) as OfflineQueueItem | undefined;
    const item: OfflineQueueItem = {
      id,
      entity,
      event_type: eventType,
      payload,
      created_at: existing?.created_at ?? new Date().toISOString(),
      status: 'pending',
      retry_count: 0,
    };
    await db.put(QUEUE_STORE, item);
    await this.refreshCount();
    return item;
  }

  /** Alle unerledigten Items in Einfüge-Reihenfolge (FIFO). */
  async getPending(): Promise<OfflineQueueItem[]> {
    const db = await getFleetlyDb();
    const all = (await db.getAll(QUEUE_STORE)) as OfflineQueueItem[];
    return all
      .filter((i) => i.status !== 'syncing')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async setStatus(id: string, status: QueueStatus, retryCount?: number): Promise<void> {
    const db = await getFleetlyDb();
    const item = (await db.get(QUEUE_STORE, id)) as OfflineQueueItem | undefined;
    if (!item) {
      return;
    }
    item.status = status;
    if (retryCount !== undefined) {
      item.retry_count = retryCount;
    }
    await db.put(QUEUE_STORE, item);
    await this.refreshCount();
  }

  /** Nach bestätigtem Sync: Item endgültig entfernen. */
  async remove(id: string): Promise<void> {
    const db = await getFleetlyDb();
    await db.delete(QUEUE_STORE, id);
    await this.refreshCount();
  }

  private async refreshCount(): Promise<void> {
    const db = await getFleetlyDb();
    this._pendingCount.set(await db.count(QUEUE_STORE));
  }
}
