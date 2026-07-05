import { calcTuvInfo, tuvIntervalYears } from './tuv.utils';

describe('tuv.utils', () => {
  describe('tuvIntervalYears', () => {
    it('ist 1 Jahr für Fahrzeuge schneller als 40 km/h', () => {
      expect(tuvIntervalYears(true)).toBe(1);
    });
    it('ist 2 Jahre für Fahrzeuge bis 40 km/h', () => {
      expect(tuvIntervalYears(false)).toBe(2);
    });
  });

  describe('calcTuvInfo', () => {
    it('liefert unknown ohne TÜV-Datum', () => {
      const info = calcTuvInfo(null, true);
      expect(info.status).toBe('unknown');
      expect(info.nextDue).toBeNull();
      expect(info.daysRemaining).toBeNull();
    });

    it('berechnet nächste HU mit 1-Jahres-Intervall (>40 km/h)', () => {
      const info = calcTuvInfo('2025-11-15', true, new Date('2026-01-01'));
      expect(info.nextDue).toEqual(new Date('2026-11-15'));
      expect(info.dueMonthLabel).toBe('11/2026');
      expect(info.status).toBe('valid');
    });

    it('berechnet nächste HU mit 2-Jahres-Intervall (≤40 km/h)', () => {
      const info = calcTuvInfo('2025-11-15', false, new Date('2026-01-01'));
      expect(info.nextDue).toEqual(new Date('2027-11-15'));
      expect(info.dueMonthLabel).toBe('11/2027');
    });

    it('ist bis zum letzten Tag des Fälligkeitsmonats NICHT abgelaufen', () => {
      // HU 15.03.2025 + 1 Jahr = 15.03.2026 → gültig bis 31.03.2026
      const info = calcTuvInfo('2025-03-15', true, new Date('2026-03-31'));
      expect(info.status).not.toBe('expired');
      expect(info.daysRemaining).toBe(0);
      expect(info.status).toBe('due_7');
    });

    it('ist ab dem 1. des Folgemonats abgelaufen', () => {
      const info = calcTuvInfo('2025-03-15', true, new Date('2026-04-01'));
      expect(info.status).toBe('expired');
      expect(info.daysRemaining).toBe(-1);
    });

    it('warnt bei ≤ 7 Tagen vor Monatsende (orange)', () => {
      const info = calcTuvInfo('2025-03-15', true, new Date('2026-03-24'));
      expect(info.daysRemaining).toBe(7);
      expect(info.status).toBe('due_7');
    });

    it('warnt bei ≤ 30 Tagen vor Monatsende (amber)', () => {
      const info = calcTuvInfo('2025-03-15', true, new Date('2026-03-01'));
      expect(info.daysRemaining).toBe(30);
      expect(info.status).toBe('due_30');
    });

    it('ist gültig bei > 30 Tagen Rest', () => {
      const info = calcTuvInfo('2025-03-15', true, new Date('2026-02-28'));
      expect(info.daysRemaining).toBe(31);
      expect(info.status).toBe('valid');
    });

    it('behandelt Schaltjahr-Februar korrekt', () => {
      // HU 10.02.2027 + 1 Jahr = 10.02.2028 (Schaltjahr) → gültig bis 29.02.2028
      const info = calcTuvInfo('2027-02-10', true, new Date('2028-02-29'));
      expect(info.daysRemaining).toBe(0);
      expect(info.status).not.toBe('expired');
      const expired = calcTuvInfo('2027-02-10', true, new Date('2028-03-01'));
      expect(expired.status).toBe('expired');
    });

    it('Umschalten der 40-km/h-Kategorie ändert das Intervall', () => {
      const fast = calcTuvInfo('2025-06-01', true, new Date('2026-01-01'));
      const slow = calcTuvInfo('2025-06-01', false, new Date('2026-01-01'));
      expect(fast.nextDue!.getFullYear()).toBe(2026);
      expect(slow.nextDue!.getFullYear()).toBe(2027);
    });
  });
});
