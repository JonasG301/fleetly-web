import { ActiveSegment, sumSegmentSeconds } from './stamp.service';

describe('sumSegmentSeconds', () => {
  const t = (iso: string) => new Date(iso).getTime();

  it('summiert ein abgeschlossenes Segment', () => {
    const segments: ActiveSegment[] = [
      { id: '1', start: '2026-07-03T08:00:00Z', end: '2026-07-03T10:30:00Z' },
    ];
    expect(sumSegmentSeconds(segments, t('2026-07-03T12:00:00Z'))).toBe(2.5 * 3600);
  });

  it('zählt offene Segmente bis jetzt (timestamp-basiert, US-17)', () => {
    const segments: ActiveSegment[] = [
      { id: '1', start: '2026-07-03T08:00:00Z', end: null },
    ];
    expect(sumSegmentSeconds(segments, t('2026-07-03T09:00:00Z'))).toBe(3600);
  });

  it('Pausen zählen nicht: Summe = nur aktive Segmente (US-10)', () => {
    // 08:00–09:00 Arbeit, 09:00–09:30 Pause, 09:30–10:00 Arbeit
    const segments: ActiveSegment[] = [
      { id: '1', start: '2026-07-03T08:00:00Z', end: '2026-07-03T09:00:00Z' },
      { id: '2', start: '2026-07-03T09:30:00Z', end: '2026-07-03T10:00:00Z' },
    ];
    expect(sumSegmentSeconds(segments, t('2026-07-03T10:00:00Z'))).toBe(1.5 * 3600);
  });

  it('mehrfache Unterbrechung ist möglich (US-10)', () => {
    const segments: ActiveSegment[] = [
      { id: '1', start: '2026-07-03T08:00:00Z', end: '2026-07-03T08:10:00Z' },
      { id: '2', start: '2026-07-03T08:20:00Z', end: '2026-07-03T08:30:00Z' },
      { id: '3', start: '2026-07-03T08:40:00Z', end: null },
    ];
    expect(sumSegmentSeconds(segments, t('2026-07-03T08:50:00Z'))).toBe(30 * 60);
  });

  it('liefert nie negative Werte bei Uhr-Anomalien', () => {
    const segments: ActiveSegment[] = [
      { id: '1', start: '2026-07-03T10:00:00Z', end: null },
    ];
    expect(sumSegmentSeconds(segments, t('2026-07-03T09:00:00Z'))).toBe(0);
  });
});
