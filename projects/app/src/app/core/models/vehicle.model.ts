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

/**
 * Fahrzeugkategorie — steuert u. a. welches Schadens-Diagramm (Silhouette
 * zum Markieren der Schadensposition) in der Schadensmeldung angezeigt wird.
 * Wird im freien `type`-Textfeld auf dem Fahrzeug gespeichert.
 */
export type VehicleCategory =
  | 'pkw'
  | 'traktor'
  | 'anhaenger'
  | 'lkw'
  | 'bagger'
  | 'radlader'
  | 'walze'
  | 'stapler'
  | 'teleskoplader'
  | 'sonstiges';

export const VEHICLE_CATEGORY_LABELS: Record<VehicleCategory, string> = {
  pkw: 'PKW',
  traktor: 'Traktor',
  anhaenger: 'Anhänger',
  lkw: 'LKW / Transporter',
  bagger: 'Bagger',
  radlader: 'Radlader',
  walze: 'Walze',
  stapler: 'Stapler',
  teleskoplader: 'Teleskoplader',
  sonstiges: 'Sonstiges',
};

export const VEHICLE_CATEGORIES = Object.keys(VEHICLE_CATEGORY_LABELS) as VehicleCategory[];

/**
 * Welche Felder je Kategorie erfasst werden und wie HU/UVV-Pflicht aussehen
 * (StVZO Anlage VIII bzw. DGUV Vorschrift 70 § 57). huBaseIntervalMonths ist
 * bei "lkw" null, weil das Intervall dort vom Gesamtgewicht abhängt (siehe
 * effectiveHuIntervalMonths in tuv.utils.ts). huNewVehicleBonus (Erstzulassung
 * < 3 Jahre → 36 statt 24 Monate) gilt bewusst nur bei PKW. Die UVV-Pflicht
 * nach DGUV Vorschrift 70 § 57 ("mindestens jedoch einmal jährlich") gilt für
 * alle gewerblich genutzten Fahrzeuge, daher uvvApplicable=true durchgehend.
 * requiresMaxSpeed markiert selbstfahrende Arbeitsmaschinen/Flurförderzeuge
 * (Bagger, Radlader, Walze, Stapler, Teleskoplader): die sind laut § 18 Abs. 4
 * StVZO nur kennzeichenpflichtig, wenn ihre Bauartgeschwindigkeit > 20 km/h
 * liegt — deshalb wird dort die Geschwindigkeit erfasst und die
 * Kennzeichenpflicht daraus abgeleitet (siehe requiresPlate()), statt sie
 * kategorieweit fest vorzugeben.
 */
export interface VehicleCategoryRules {
  requiresPlate: boolean;
  requiresMaxSpeed: boolean;
  requiresOperatingHours: boolean;
  requiresMileage: boolean;
  requiresFuelType: boolean;
  requiresMaxWeight: boolean;
  huApplicable: boolean;
  huBaseIntervalMonths: number | null;
  huNewVehicleBonus: boolean;
  uvvApplicable: boolean;
  uvvIntervalMonths: number | null;
}

export const VEHICLE_CATEGORY_RULES: Record<VehicleCategory, VehicleCategoryRules> = {
  pkw: {
    requiresPlate: true,
    requiresMaxSpeed: false,
    requiresOperatingHours: false,
    requiresMileage: true,
    requiresFuelType: true,
    requiresMaxWeight: false,
    huApplicable: true,
    huBaseIntervalMonths: 24,
    huNewVehicleBonus: true,
    uvvApplicable: true,
    uvvIntervalMonths: 12,
  },
  traktor: {
    requiresPlate: true,
    requiresMaxSpeed: false,
    requiresOperatingHours: true,
    requiresMileage: true,
    requiresFuelType: true,
    requiresMaxWeight: false,
    huApplicable: true,
    huBaseIntervalMonths: 24,
    huNewVehicleBonus: false,
    uvvApplicable: true,
    uvvIntervalMonths: 12,
  },
  anhaenger: {
    requiresPlate: true,
    requiresMaxSpeed: false,
    requiresOperatingHours: false,
    requiresMileage: false,
    requiresFuelType: false,
    requiresMaxWeight: false,
    huApplicable: true,
    huBaseIntervalMonths: 24,
    huNewVehicleBonus: false,
    uvvApplicable: true,
    uvvIntervalMonths: 12,
  },
  lkw: {
    requiresPlate: true,
    requiresMaxSpeed: false,
    requiresOperatingHours: false,
    requiresMileage: true,
    requiresFuelType: true,
    requiresMaxWeight: true,
    huApplicable: true,
    huBaseIntervalMonths: null,
    huNewVehicleBonus: false,
    uvvApplicable: true,
    uvvIntervalMonths: 12,
  },
  bagger: {
    requiresPlate: false,
    requiresMaxSpeed: true,
    requiresOperatingHours: true,
    requiresMileage: false,
    requiresFuelType: true,
    requiresMaxWeight: false,
    huApplicable: true,
    huBaseIntervalMonths: 24,
    huNewVehicleBonus: false,
    uvvApplicable: true,
    uvvIntervalMonths: 12,
  },
  radlader: {
    requiresPlate: false,
    requiresMaxSpeed: true,
    requiresOperatingHours: true,
    requiresMileage: false,
    requiresFuelType: true,
    requiresMaxWeight: false,
    huApplicable: true,
    huBaseIntervalMonths: 24,
    huNewVehicleBonus: false,
    uvvApplicable: true,
    uvvIntervalMonths: 12,
  },
  walze: {
    requiresPlate: false,
    requiresMaxSpeed: true,
    requiresOperatingHours: true,
    requiresMileage: false,
    requiresFuelType: true,
    requiresMaxWeight: false,
    huApplicable: true,
    huBaseIntervalMonths: 24,
    huNewVehicleBonus: false,
    uvvApplicable: true,
    uvvIntervalMonths: 12,
  },
  stapler: {
    requiresPlate: false,
    requiresMaxSpeed: true,
    requiresOperatingHours: true,
    requiresMileage: false,
    requiresFuelType: true,
    requiresMaxWeight: false,
    huApplicable: false,
    huBaseIntervalMonths: null,
    huNewVehicleBonus: false,
    uvvApplicable: true,
    uvvIntervalMonths: 12,
  },
  teleskoplader: {
    requiresPlate: false,
    requiresMaxSpeed: true,
    requiresOperatingHours: true,
    requiresMileage: false,
    requiresFuelType: true,
    requiresMaxWeight: false,
    huApplicable: true,
    huBaseIntervalMonths: 24,
    huNewVehicleBonus: false,
    uvvApplicable: true,
    uvvIntervalMonths: 12,
  },
  sonstiges: {
    requiresPlate: true,
    requiresMaxSpeed: false,
    requiresOperatingHours: true,
    requiresMileage: true,
    requiresFuelType: true,
    requiresMaxWeight: false,
    huApplicable: true,
    huBaseIntervalMonths: 24,
    huNewVehicleBonus: false,
    uvvApplicable: true,
    uvvIntervalMonths: 12,
  },
};

const MAX_WEIGHT_HU_THRESHOLD_KG = 3500;
/** Schwelle § 18 Abs. 4 StVZO: selbstfahrende Arbeitsmaschinen sind erst darüber kennzeichenpflichtig. */
export const MAX_SPEED_PLATE_THRESHOLD_KMH = 20;

/**
 * Kennzeichenpflicht: bei fest zugeordneten Kategorien (PKW, Traktor,
 * Anhänger, LKW, Sonstiges) immer Pflicht. Bei selbstfahrenden
 * Arbeitsmaschinen/Flurförderzeugen hängt sie von der Bauartgeschwindigkeit
 * ab (§ 18 Abs. 4 StVZO, Schwelle 20 km/h). Ist die Geschwindigkeit noch nicht
 * erfasst, wird das Kennzeichen NICHT verlangt — die Bauartgeschwindigkeit ist
 * für diese Kategorien ohnehin ein Pflichtfeld (siehe VEHICLE_CATEGORY_RULES),
 * ein "required"-Default hier würde also nur den Schritt blockieren, in dem
 * genau dieses Feld erfasst wird.
 */
export function requiresPlate(category: VehicleCategory, maxSpeedKmh: number | null): boolean {
  const rules = VEHICLE_CATEGORY_RULES[category];
  if (!rules.requiresMaxSpeed) {
    return rules.requiresPlate;
  }
  return maxSpeedKmh != null && maxSpeedKmh > MAX_SPEED_PLATE_THRESHOLD_KMH;
}

/** HU-Intervall in Monaten für die Kategorie, oder null wenn keine HU-Pflicht besteht (z. B. Stapler). */
export function huIntervalMonths(
  category: VehicleCategory,
  maxWeightKg: number | null,
): number | null {
  const rules = VEHICLE_CATEGORY_RULES[category];
  if (!rules.huApplicable) {
    return null;
  }
  if (category === 'lkw') {
    return maxWeightKg != null && maxWeightKg <= MAX_WEIGHT_HU_THRESHOLD_KG ? 24 : 12;
  }
  return rules.huBaseIntervalMonths;
}

/** Neuwagen = Erstzulassung liegt weniger als 3 Jahre zurück. */
export function isNeuwagen(
  firstRegistration: string | Date | null,
  today: Date = new Date(),
): boolean {
  if (!firstRegistration) {
    return false;
  }
  const fr = typeof firstRegistration === 'string' ? new Date(firstRegistration) : firstRegistration;
  const threeYearsAfter = new Date(fr.getFullYear() + 3, fr.getMonth(), fr.getDate());
  return today < threeYearsAfter;
}

/** Effektives HU-Intervall inkl. Neuwagen-Bonus (nur PKW), oder null wenn keine HU-Pflicht besteht. */
export function effectiveHuIntervalMonths(
  category: VehicleCategory,
  firstRegistration: string | Date | null,
  maxWeightKg: number | null,
  today: Date = new Date(),
): number | null {
  const rules = VEHICLE_CATEGORY_RULES[category];
  if (!rules.huApplicable) {
    return null;
  }
  if (rules.huNewVehicleBonus && isNeuwagen(firstRegistration, today)) {
    return 36;
  }
  return huIntervalMonths(category, maxWeightKg);
}

/** Deutsches Kennzeichen, z. B. "S-AB 1234" (aus der Flutter-App übernommen). */
export const LICENSE_PLATE_PATTERN = /^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2} \d{1,4}$/;

export interface Vehicle {
  id: string;
  /** null = eigener Fuhrpark, gesetzt = Kundenfahrzeug */
  customer_id: string | null;
  /** null bei selbstfahrenden Arbeitsmaschinen/Flurförderzeugen ohne Kennzeichenpflicht (siehe requiresPlate()). */
  plate: string | null;
  type: string | null;
  make: string;
  model: string;
  internal_name: string | null;
  is_active: boolean;
  /** Historisches Feld, nicht mehr für die HU-Intervallberechnung genutzt (siehe VEHICLE_CATEGORY_RULES). */
  is_faster_than_40kmh: boolean;
  operating_hours: number | null;
  vin: string | null;
  first_registration: string | null;
  construction_year: number | null;
  /** Nur für Kategorie "lkw" relevant: entscheidet über 12- vs. 24-Monats-HU-Intervall (Schwelle 3.500 kg). */
  max_weight_kg: number | null;
  /** Bauartgeschwindigkeit (km/h) — bei selbstfahrenden Arbeitsmaschinen/Flurförderzeugen entscheidet sie über die Kennzeichenpflicht (Schwelle 20 km/h, siehe requiresPlate()). */
  max_speed_kmh: number | null;
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
