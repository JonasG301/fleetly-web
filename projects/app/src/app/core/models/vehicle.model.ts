/** Vereinigtes Fahrzeugmodell: TimeStamp (Kundenfahrzeug) + Fleetly (Fuhrpark/TÜV). */

export type FuelType =
  | 'diesel'
  | 'petrol'
  | 'electric'
  | 'hybrid'
  | 'plugin_hybrid'
  | 'lpg'
  | 'cng'
  | 'hydrogen';

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  diesel: 'Diesel',
  petrol: 'Benzin',
  electric: 'Elektro',
  hybrid: 'Hybrid',
  plugin_hybrid: 'Plug-in-Hybrid',
  lpg: 'Autogas (LPG)',
  cng: 'Erdgas (CNG)',
  hydrogen: 'Wasserstoff',
};

/** Deutsches Kennzeichen, z. B. "S-AB 1234" (aus der Flutter-App übernommen). */
export const LICENSE_PLATE_PATTERN = /^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2} \d{1,4}$/;

export interface Vehicle {
  id: string;
  /** null = eigener Fuhrpark, gesetzt = Kundenfahrzeug */
  customer_id: string | null;
  plate: string;
  type: string | null;
  make: string;
  model: string;
  internal_name: string | null;
  is_active: boolean;
  /** Bestimmt das TÜV-Intervall: true → 1 Jahr, false → 2 Jahre */
  is_faster_than_40kmh: boolean;
  operating_hours: number | null;
  vin: string | null;
  first_registration: string | null;
  construction_year: number | null;
  color: string | null;
  fuel_type: FuelType | null;
  transmission: string | null;
  /** Datum der letzten HU */
  tuv_date: string | null;
  uvv_date: string | null;
  mileage: number | null;
  next_service_date: string | null;
  service_interval: number | null;
  insurance_company: string | null;
  insurance_number: string | null;
  insurance_expiry_date: string | null;
  yearly_tax: number | null;
  leasing_rate: number | null;
  leasing_end: string | null;
  leasing_mileage: number | null;
  cost_center: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type VehicleInsert = Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>;
