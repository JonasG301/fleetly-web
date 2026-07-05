import { addYears, differenceInCalendarDays, endOfMonth, format } from 'date-fns';

/**
 * TÜV-Statusberechnung — Businessregel aus der Fleetly-Flutter-App:
 * - Nächste HU = letzte HU + (schneller als 40 km/h ? 1 Jahr : 2 Jahre)
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

export function tuvIntervalYears(isFasterThan40Kmh: boolean): number {
  return isFasterThan40Kmh ? 1 : 2;
}

export function calcTuvInfo(
  tuvDate: string | Date | null | undefined,
  isFasterThan40Kmh: boolean,
  today: Date = new Date(),
): TuvInfo {
  if (!tuvDate) {
    return { status: 'unknown', nextDue: null, dueMonthEnd: null, daysRemaining: null, dueMonthLabel: null };
  }
  const last = typeof tuvDate === 'string' ? new Date(tuvDate) : tuvDate;
  const nextDue = addYears(last, tuvIntervalYears(isFasterThan40Kmh));
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

export const TUV_STATUS_LABELS: Record<TuvStatus, string> = {
  expired: 'Abgelaufen',
  due_7: 'Dringend fällig',
  due_30: 'Bald fällig',
  valid: 'Gültig',
  unknown: 'Kein Datum',
};

/** Farbwelt analog Flutter: rot / orange / amber / grün / grau */
export const TUV_STATUS_COLORS: Record<TuvStatus, string> = {
  expired: '#c62828',
  due_7: '#e65100',
  due_30: '#f9a825',
  valid: '#2e7d32',
  unknown: '#9e9e9e',
};

/** Sortierschlüssel: Abgelaufene zuerst, dann nach Restlaufzeit. */
export function tuvSortKey(info: TuvInfo): number {
  return info.daysRemaining ?? Number.MAX_SAFE_INTEGER;
}
