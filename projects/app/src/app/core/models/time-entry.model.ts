export type TimeEntryStatus = 'open' | 'paused' | 'closed' | 'cancelled';

export interface TimeEntry {
  id: string;
  user_id: string;
  order_id: string;
  vehicle_id: string | null;
  commission_code_id: string;
  started_at: string;
  stopped_at: string | null;
  /** Summe aktiver Segmente in Sekunden (ohne Pausen) */
  duration_seconds: number | null;
  status: TimeEntryStatus;
  correction_note: string | null;
  /** Idempotenz-Key für Offline-Sync */
  client_id: string | null;
  created_at: string;
  updated_at: string;
}
