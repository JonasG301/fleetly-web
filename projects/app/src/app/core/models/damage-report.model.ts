export type DamageStatus = 'open' | 'in_repair' | 'resolved';

export const DAMAGE_STATUS_LABELS: Record<DamageStatus, string> = {
  open: 'Offen',
  in_repair: 'In Reparatur',
  resolved: 'Erledigt',
};

export interface DamageReport {
  id: string;
  vehicle_id: string;
  description: string;
  location: string;
  reporter_name: string;
  reported_by: string | null;
  damage_date: string;
  report_date: string;
  status: DamageStatus;
  /** Idempotenz-Key für Offline-Sync */
  client_id: string | null;
  created_at: string;
}

export type DamageReportInsert = Omit<DamageReport, 'id' | 'report_date' | 'created_at'>;
