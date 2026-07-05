import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from 'auth';
import { STAMP_STATE_STORE, getFleetlyDb } from '../../../core/services/idb';
import { OfflineQueueService } from '../../../core/services/offline-queue.service';
import { SyncService } from '../../../core/services/sync.service';

export interface ActiveSegment {
  id: string;
  start: string;
  end: string | null;
}

/** Eine laufende oder pausierte Stempelung (US-10/US-11). */
export interface ActiveStamp {
  entryId: string;
  orderId: string;
  vehicleId: string | null;
  commissionCodeId: string;
  startedAt: string;
  segments: ActiveSegment[];
  status: 'open' | 'paused';
}

/** Gearbeitete Sekunden = Summe aktiver Segmente; offene Segmente zählen bis nowMs. */
export function sumSegmentSeconds(segments: ActiveSegment[], nowMs: number): number {
  return segments.reduce((sum, seg) => {
    const end = seg.end ? new Date(seg.end).getTime() : nowMs;
    return sum + Math.max(0, Math.floor((end - new Date(seg.start).getTime()) / 1000));
  }, 0);
}

/**
 * Stempel-Logik (E-05 + E-08):
 * - Timer ist timestamp-basiert (Segmente), nicht interval-basiert → überlebt
 *   Reload und Offline-Phasen.
 * - Jede Aktion schreibt zuerst in die Offline-Queue (IndexedDB); der
 *   SyncService überträgt idempotent per client_id-Upsert.
 * - Entry- und Segment-IDs werden clientseitig erzeugt, damit die
 *   FK-Beziehung auch offline konsistent ist.
 * - Mehrere parallele Stempelungen sind möglich (US-11: Auftrag pausiert,
 *   Fahrzeug läuft weiter — jede Stempelung ist unabhängig).
 */
@Injectable({ providedIn: 'root' })
export class StampService {
  private readonly queue = inject(OfflineQueueService);
  private readonly sync = inject(SyncService);
  private readonly auth = inject(AuthService);

  private readonly _stamps = signal<ActiveStamp[]>([]);
  readonly stamps = this._stamps.asReadonly();

  /** Tickt jede Sekunde für die Live-Anzeige. */
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 1000);
    void this.restore();
  }

  private async restore(): Promise<void> {
    const db = await getFleetlyDb();
    const stamps = (await db.getAll(STAMP_STATE_STORE)) as ActiveStamp[];
    this._stamps.set(stamps);
  }

  /** Gearbeitete Sekunden = Summe aktiver Segmente ohne Pausen (US-10). */
  elapsedSeconds(stamp: ActiveStamp, nowMs: number = this.now()): number {
    return sumSegmentSeconds(stamp.segments, nowMs);
  }

  async start(orderId: string, vehicleId: string | null, commissionCodeId: string): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      throw new Error('Nicht eingeloggt');
    }
    const now = new Date().toISOString();
    const stamp: ActiveStamp = {
      entryId: crypto.randomUUID(),
      orderId,
      vehicleId,
      commissionCodeId,
      startedAt: now,
      segments: [{ id: crypto.randomUUID(), start: now, end: null }],
      status: 'open',
    };
    await this.enqueueEntry(stamp, { status: 'open' });
    await this.enqueueSegment(stamp.entryId, stamp.segments[0]);
    await this.persist(stamp);
    this._stamps.update((list) => [...list, stamp]);
    void this.sync.syncNow();
  }

  async pause(entryId: string): Promise<void> {
    const stamp = this.byId(entryId);
    if (!stamp || stamp.status !== 'open') {
      return;
    }
    const now = new Date().toISOString();
    const current = stamp.segments[stamp.segments.length - 1];
    current.end = now;
    stamp.status = 'paused';
    await this.enqueueSegment(entryId, current);
    await this.enqueueEntry(stamp, { status: 'paused' });
    await this.persist(stamp);
    this._stamps.update((list) => list.map((s) => (s.entryId === entryId ? { ...stamp } : s)));
    void this.sync.syncNow();
  }

  async resume(entryId: string): Promise<void> {
    const stamp = this.byId(entryId);
    if (!stamp || stamp.status !== 'paused') {
      return;
    }
    const segment: ActiveSegment = { id: crypto.randomUUID(), start: new Date().toISOString(), end: null };
    stamp.segments.push(segment);
    stamp.status = 'open';
    await this.enqueueSegment(entryId, segment);
    await this.enqueueEntry(stamp, { status: 'open' });
    await this.persist(stamp);
    this._stamps.update((list) => list.map((s) => (s.entryId === entryId ? { ...stamp } : s)));
    void this.sync.syncNow();
  }

  async stop(entryId: string): Promise<void> {
    const stamp = this.byId(entryId);
    if (!stamp) {
      return;
    }
    const now = new Date().toISOString();
    const current = stamp.segments[stamp.segments.length - 1];
    if (!current.end) {
      current.end = now;
      await this.enqueueSegment(entryId, current);
    }
    const total = this.elapsedSeconds(stamp, new Date(now).getTime());
    await this.enqueueEntry(stamp, {
      status: 'closed',
      stopped_at: now,
      duration_seconds: total,
    });
    const db = await getFleetlyDb();
    await db.delete(STAMP_STATE_STORE, entryId);
    this._stamps.update((list) => list.filter((s) => s.entryId !== entryId));
    void this.sync.syncNow();
  }

  private byId(entryId: string): ActiveStamp | undefined {
    // Kopie, damit Mutationen nicht direkt am Signal-Wert passieren
    const found = this._stamps().find((s) => s.entryId === entryId);
    return found ? structuredClone(found) : undefined;
  }

  private async persist(stamp: ActiveStamp): Promise<void> {
    const db = await getFleetlyDb();
    await db.put(STAMP_STATE_STORE, stamp);
  }

  /** Voller Entry-Payload bei jedem Event — der Upsert braucht alle Pflichtfelder. */
  private async enqueueEntry(
    stamp: ActiveStamp,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.queue.enqueue(stamp.entryId, 'time_entry', 'update', {
      id: stamp.entryId,
      user_id: this.auth.user()!.id,
      order_id: stamp.orderId,
      vehicle_id: stamp.vehicleId,
      commission_code_id: stamp.commissionCodeId,
      started_at: stamp.startedAt,
      ...extra,
    });
  }

  private async enqueueSegment(entryId: string, segment: ActiveSegment): Promise<void> {
    const duration = segment.end
      ? Math.floor((new Date(segment.end).getTime() - new Date(segment.start).getTime()) / 1000)
      : null;
    await this.queue.enqueue(segment.id, 'time_segment', segment.end ? 'update' : 'create', {
      id: segment.id,
      time_entry_id: entryId,
      segment_start: segment.start,
      segment_end: segment.end,
      duration_seconds: duration,
    });
  }
}
