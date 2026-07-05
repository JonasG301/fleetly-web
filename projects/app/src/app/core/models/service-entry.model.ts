export interface ServiceEntry {
  id: string;
  vehicle_id: string;
  service_date: string;
  mileage: number | null;
  description: string;
  cost: number | null;
  workshop: string | null;
  created_at: string;
}

export type ServiceEntryInsert = Omit<ServiceEntry, 'id' | 'created_at'>;
