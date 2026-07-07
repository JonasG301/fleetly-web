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
  location: string | null;
  reporter_name: string;
  reported_by: string | null;
  damage_date: string;
  report_date: string;
  status: DamageStatus;
  /** Prozent-Koordinaten (0–100) auf der Fahrzeug-Silhouette, optional. */
  position_x: number | null;
  position_y: number | null;
  /** Perspektive, auf der position_x/position_y erfasst wurden (z. B. "front", "left"). */
  position_view: string | null;
  /** Idempotenz-Key für Offline-Sync */
  client_id: string | null;
  created_at: string;
}

export type DamageReportInsert = Omit<DamageReport, 'id' | 'report_date' | 'created_at'>;

export interface DamageReportPhoto {
  id: string;
  damage_report_id: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}
