export interface CalendarEntry {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  /** HH:mm:ss, oder null bei ganztägigem Termin. */
  start_time: string | null;
  end_time: string | null;
  vehicle_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CalendarEntryInsert = Omit<CalendarEntry, 'id' | 'created_at' | 'updated_at'>;
