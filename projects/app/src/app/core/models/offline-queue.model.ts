/** Lokales Queue-Item in IndexedDB — wird erst nach Supabase-Bestätigung gelöscht (E-08). */

export type QueueEntity = 'time_entry' | 'time_segment' | 'damage_report';
export type QueueEventType = 'start' | 'pause' | 'resume' | 'stop' | 'create' | 'update';
export type QueueStatus = 'pending' | 'syncing' | 'failed';

export interface OfflineQueueItem {
  /** = client_id des Datensatzes (Idempotenz beim Upsert) */
  id: string;
  entity: QueueEntity;
  event_type: QueueEventType;
  payload: Record<string, unknown>;
  created_at: string;
  status: QueueStatus;
  retry_count: number;
}
