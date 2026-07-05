/** Ein aktives Arbeitssegment; Pausen sind die Lücken zwischen Segmenten. */
export interface TimeSegment {
  id: string;
  time_entry_id: string;
  segment_start: string;
  segment_end: string | null;
  duration_seconds: number | null;
  client_id: string | null;
  created_at: string;
}
