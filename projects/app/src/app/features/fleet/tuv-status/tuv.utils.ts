import { addMonths, differenceInCalendarDays, endOfMonth, format } from 'date-fns';
import {
  effectiveHuIntervalMonths,
  Vehicle,
  VehicleCategory,
} from '../../../core/models/vehicle.model';

/**
 * TÜV-Statusberechnung:
 * - Nächste HU = letzte HU + Kategorie-Intervall (siehe effectiveHuIntervalMonths)
 * - Fälligkeitsmonat = Monat der nächsten HU; gültig bis Monatsende
 * - Überfällig ab dem 1. des FOLGEmonats
 * - Warnschwellen: 30 / 7 / 1 Tage vor Monatsende
 */

export type TuvStatus = 'expired' | 'due_7' | 'due_30' | 'valid' | 'unknown';

export interface TuvInfo {
  status: TuvStatus;
  /** Rechnerische nächste HU (tuv_date + Intervall) */
  nextDue: Date | null;
  /** Letzter gültiger Tag (Ende des Fälligkeitsmonats) */
  dueMonthEnd: Date | null;
  /** Tage bis Monatsende; negativ = überfällig */
  daysRemaining: number | null;
  /** Fälligkeitsmonat als "MM/JJJJ" */
  dueMonthLabel: string | null;
}

export function calcTuvInfo(
  tuvDate: string | Date | null | undefined,
  intervalMonths: number | null,
  today: Date = new Date(),
): TuvInfo {
  if (!tuvDate || intervalMonths == null) {
    return { status: 'unknown', nextDue: null, dueMonthEnd: null, daysRemaining: null, dueMonthLabel: null };
  }
  const last = typeof tuvDate === 'string' ? new Date(tuvDate) : tuvDate;
  const nextDue = addMonths(last, intervalMonths);
  const dueMonthEnd = endOfMonth(nextDue);
  const daysRemaining = differenceInCalendarDays(dueMonthEnd, today);
  const dueMonthLabel = format(nextDue, 'MM/yyyy');

  let status: TuvStatus;
  if (daysRemaining < 0) {
    status = 'expired';
  } else if (daysRemaining <= 7) {
    status = 'due_7';
  } else if (daysRemaining <= 30) {
    status = 'due_30';
  } else {
    status = 'valid';
  }
  return { status, nextDue, dueMonthEnd, daysRemaining, dueMonthLabel };
}

/** Ermittelt das HU-Intervall eines Fahrzeugs (Kategorie-Regeln) und berechnet direkt den Status. */
export function tuvInfoForVehicle(
  vehicle: Pick<Vehicle, 'tuv_date' | 'type' | 'first_registration' | 'max_weight_kg'>,
  today: Date = new Date(),
): TuvInfo {
  const category = (vehicle.type as VehicleCategory | null) ?? 'sonstiges';
  const intervalMonths = effectiveHuIntervalMonths(
    category,
    vehicle.first_registration,
    vehicle.max_weight_kg,
    today,
  );
  return calcTuvInfo(vehicle.tuv_date, intervalMonths, today);
}

export const TUV_STATUS_LABELS: Record<TuvStatus, string> = {
  expired: 'Abgelaufen',
  due_7: 'Dringend fällig',
  due_30: 'Bald fällig',
  valid: 'Gültig',
  unknown: 'Kein Datum',
};

/** Ampel-Ebene über HUGO-Statustokens (--hugo-status-*), siehe styles.scss. */
export const TUV_STATUS_TOKENS: Record<TuvStatus, string> = {
  expired: '--hugo-status-critical',
  due_7: '--hugo-status-critical',
  due_30: '--hugo-status-warn',
  valid: '--hugo-status-ok',
  unknown: '--hugo-status-unknown',
};

/** Sortierschlüssel: Abgelaufene zuerst, dann nach Restlaufzeit. */
export function tuvSortKey(info: TuvInfo): number {
  return info.daysRemaining ?? Number.MAX_SAFE_INTEGER;
}
