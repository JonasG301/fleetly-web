import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from 'auth';
import { differenceInCalendarDays, isThisWeek, startOfMonth } from 'date-fns';
import { SupabaseService } from '../../core/services/supabase.service';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DamageReportService } from '../fleet/damage-report/damage-report.service';
import { FleetService } from '../fleet/fleet.service';
import { calcTuvInfo } from '../fleet/tuv-status/tuv.utils';
import { OrdersService } from '../orders/orders.service';
import {
  DashboardPreferencesService,
  WidgetPref,
} from './dashboard-preferences.service';

interface DashboardCard {
  label: string;
  icon: string;
  route: string;
  adminOnly?: boolean;
}

interface KpiDef {
  id: string;
  label: string;
  icon: string;
  route: string;
  kind: 'bar' | 'duration';
}

/** Ein Segment einer Ampel-Statusleiste (kritisch/warnung/ok/unbekannt). */
interface BarSegment {
  count: number;
  token: string;
  title: string;
}

/** Zusammengefasster Gesundheitsstatus einer Kategorie als Ampel-Balken. */
interface HealthBar {
  total: number;
  segments: BarSegment[];
  emptyLabel: string;
}

/** Ein anstehender Termin für die Mini-Kalenderliste im Dashboard. */
interface UpcomingEvent {
  date: Date;
  label: string;
  sub: string;
  route: string;
  icon: string;
}

/** Horizont für die Mini-Kalenderliste: überfällige + Termine der nächsten 30 Tage. */
const EVENT_HORIZON_DAYS = 30;

/** Einstiegsseite — Navigationsliste im Systematik-Stil (Hairlines statt bunter Kacheln). */
const CARDS: DashboardCard[] = [
  { label: 'Zeit stempeln', icon: 'timer', route: '/zeiterfassung' },
  { label: 'Fuhrpark', icon: 'agriculture', route: '/fuhrpark' },
  { label: 'HU-Status', icon: 'verified', route: '/fuhrpark/tuv' },
  { label: 'Schaden melden', icon: 'report_problem', route: '/schaeden/neu' },
  { label: 'Meine Zeiten', icon: 'history', route: '/meine-zeiten' },
  { label: 'Aufträge', icon: 'assignment', route: '/auftraege' },
  { label: 'Kunden', icon: 'business', route: '/kunden', adminOnly: true },
  { label: 'Auswertung', icon: 'bar_chart', route: '/auswertung', adminOnly: true },
];

const KPIS: KpiDef[] = [
  { id: 'tuv', label: 'HU-Status', icon: 'verified', route: '/fuhrpark/tuv', kind: 'bar' },
  { id: 'damages', label: 'Schäden', icon: 'report_problem', route: '/schaeden', kind: 'bar' },
  { id: 'orders', label: 'Aufträge', icon: 'assignment', route: '/auftraege', kind: 'bar' },
  { id: 'leasingEnding', label: 'Leasing', icon: 'directions_car', route: '/fuhrpark', kind: 'bar' },
  { id: 'hours', label: 'Meine Stunden (Monat)', icon: 'schedule', route: '/meine-zeiten', kind: 'duration' },
];

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    DurationPipe,
    DatePipe,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      title="Willkommen bei HUGO"
      [subtitle]="'Hallo ' + (auth.user()?.fullName ?? '') + ' – was möchtest du tun?'"
    >
      @if (editMode()) {
        <button mat-button (click)="resetLayout()">
          <mat-icon>restart_alt</mat-icon>
          Zurücksetzen
        </button>
      }
      <button mat-stroked-button (click)="toggleEditMode()">
        <mat-icon>{{ editMode() ? 'check' : 'tune' }}</mat-icon>
        {{ editMode() ? 'Fertig' : 'Anpassen' }}
      </button>
    </app-page-header>

    @if (editMode()) {
      <p class="edit-hint">
        Kacheln per Drag &amp; Drop anordnen, mit dem Auge ein-/ausblenden.
      </p>
    }

    <div
      class="kpi-row"
      cdkDropList
      cdkDropListOrientation="mixed"
      [cdkDropListDisabled]="!editMode()"
      (cdkDropListDropped)="dropKpi($event)"
    >
      @for (w of kpiWidgets(); track w.def.id) {
        <a
          class="kpi"
          [class.kpi-bar]="w.def.kind === 'bar'"
          cdkDrag
          [class.editing]="editMode()"
          [class.hidden-widget]="w.hidden"
          [routerLink]="editMode() ? null : w.def.route"
        >
          @if (editMode()) {
            <button
              class="hide-btn"
              type="button"
              [attr.aria-label]="w.hidden ? 'Einblenden' : 'Ausblenden'"
              (click)="toggleHidden('kpis', w.def.id)"
            >
              <mat-icon>{{ w.hidden ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          }
          @if (w.def.kind === 'duration') {
            <span class="kpi-value hugo-stat">{{ hoursThisMonth() | duration }}</span>
            <span class="kpi-label">{{ w.def.label }}</span>
          } @else {
            @let bar = healthBar(w.def.id);
            <div class="bar-header">
              <span class="kpi-label">{{ w.def.label }}</span>
              <span class="bar-total">{{ bar.total }}</span>
            </div>
            @if (bar.total > 0) {
              <div class="bar-track">
                @for (seg of bar.segments; track seg.token) {
                  @if (seg.count > 0) {
                    <span
                      class="bar-seg"
                      [style.width.%]="(seg.count / bar.total) * 100"
                      [style.background]="'var(' + seg.token + ')'"
                    ></span>
                  }
                }
              </div>
              <div class="bar-legend">
                @for (seg of bar.segments; track seg.token) {
                  @if (seg.count > 0) {
                    <span class="legend-item">
                      <i [style.background]="'var(' + seg.token + ')'"></i>
                      {{ seg.count }} {{ seg.title }}
                    </span>
                  }
                }
              </div>
            } @else {
              <div class="bar-track bar-track-empty"></div>
              <span class="bar-empty">{{ bar.emptyLabel }}</span>
            }
          }
        </a>
      }
    </div>

    @if (upcomingEvents().length > 0) {
      <h2 class="section-title">Nächste Termine</h2>
      <div class="events-list">
        @for (e of upcomingEvents(); track e.label + e.sub) {
          <a class="event-row" [routerLink]="e.route">
            <mat-icon class="event-icon">{{ e.icon }}</mat-icon>
            <span class="event-label">{{ e.label }}</span>
            <span class="event-sub">{{ e.sub }}</span>
            <span class="event-date" [class.overdue]="e.date < today">{{
              e.date | date: 'dd.MM.yyyy'
            }}</span>
          </a>
        }
      </div>
    }

    <div
      class="nav-list"
      cdkDropList
      cdkDropListOrientation="mixed"
      [cdkDropListDisabled]="!editMode()"
      (cdkDropListDropped)="dropCard($event)"
    >
      @for (w of cardWidgets(); track w.def.route) {
        <a
          class="nav-row"
          cdkDrag
          [class.editing]="editMode()"
          [class.hidden-widget]="w.hidden"
          [routerLink]="editMode() ? null : w.def.route"
        >
          <mat-icon class="nav-icon">{{ w.def.icon }}</mat-icon>
          <span class="nav-label">{{ w.def.label }}</span>
          @if (editMode()) {
            <button
              class="hide-btn"
              type="button"
              [attr.aria-label]="w.hidden ? 'Einblenden' : 'Ausblenden'"
              (click)="toggleHidden('cards', w.def.route)"
            >
              <mat-icon>{{ w.hidden ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          } @else {
            <mat-icon class="chevron">chevron_right</mat-icon>
          }
        </a>
      }
    </div>
  `,
  styles: `
    .edit-hint {
      margin: -8px 0 16px;
      font-size: 13px;
      color: var(--hugo-ink-muted);
    }

    /* ── Kennzahlen: Ampel-Balken statt reiner Zahlen ────────────────── */
    .kpi-row {
      display: flex;
      flex-wrap: wrap;
      gap: 32px;
      margin: 4px 0 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--hugo-hairline);
    }
    .kpi {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 2px;
      text-decoration: none;
      color: inherit;
      min-width: 120px;
    }
    .kpi-bar {
      min-width: 180px;
      flex: 1 1 180px;
      max-width: 260px;
      gap: 6px;
    }
    .kpi-label {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--hugo-ink-muted);
    }
    .bar-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .bar-total {
      font-size: 13px;
      font-weight: 700;
      color: var(--hugo-ink);
    }
    .bar-track {
      display: flex;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      background: var(--hugo-hairline);
    }
    .bar-track-empty {
      background: var(--hugo-status-ok);
      opacity: 0.35;
    }
    .bar-seg {
      height: 100%;
    }
    .bar-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      color: var(--hugo-ink-muted);
    }
    .legend-item i {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .bar-empty {
      font-size: 12px;
      color: var(--hugo-ink-muted);
    }

    /* ── Nächste Termine: kompakte Mini-Kalenderliste ────────────────── */
    .section-title {
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--hugo-ink-muted);
    }
    .events-list {
      display: flex;
      flex-direction: column;
      border-top: 1px solid var(--hugo-hairline);
      max-width: 560px;
      margin-bottom: 28px;
    }
    .event-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 4px;
      border-bottom: 1px solid var(--hugo-hairline);
      text-decoration: none;
      color: var(--hugo-ink);
    }
    .event-row:hover {
      background: color-mix(in srgb, var(--hugo-accent) 6%, transparent);
    }
    .event-icon {
      color: var(--hugo-ink-muted);
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .event-label {
      font-weight: 600;
    }
    .event-sub {
      flex: 1;
      color: var(--hugo-ink-muted);
      font-size: 13px;
    }
    .event-date {
      font-size: 13px;
      color: var(--hugo-ink-muted);
    }
    .event-date.overdue {
      color: var(--hugo-status-critical);
      font-weight: 600;
    }

    /* ── Navigation: dichte Hairline-Liste statt bunter Kacheln ──────── */
    .nav-list {
      display: flex;
      flex-direction: column;
      border-top: 1px solid var(--hugo-hairline);
      max-width: 560px;
    }
    .nav-row {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 4px;
      border-bottom: 1px solid var(--hugo-hairline);
      text-decoration: none;
      color: var(--hugo-ink);
      font-weight: 600;
      transition: background-color 0.1s ease;
    }
    .nav-row:hover {
      background: color-mix(in srgb, var(--hugo-accent) 6%, transparent);
    }
    .nav-icon {
      color: var(--hugo-ink-muted);
      font-size: 22px;
      width: 22px;
      height: 22px;
    }
    .nav-label {
      flex: 1;
    }
    .chevron {
      color: var(--hugo-ink-muted);
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    /* ── Bearbeiten-Modus ─────────────────────────────────────────────── */
    .editing {
      cursor: grab;
    }
    .editing:active {
      cursor: grabbing;
    }
    .hidden-widget {
      opacity: 0.4;
    }
    .hide-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      border: none;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
      color: var(--hugo-ink-muted);
    }
    .hide-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: inherit;
    }
    .cdk-drag-preview {
      box-shadow: 0 8px 24px color-mix(in srgb, var(--hugo-ink) 25%, transparent);
      opacity: 0.9;
      background: var(--hugo-paper);
    }
    .cdk-drag-placeholder {
      opacity: 0.25;
    }
    .cdk-drag-animating {
      transition: transform 200ms ease;
    }
  `,
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  private readonly fleet = inject(FleetService);
  private readonly damages = inject(DamageReportService);
  private readonly orders = inject(OrdersService);
  private readonly supabase = inject(SupabaseService);
  private readonly prefs = inject(DashboardPreferencesService);

  private readonly monthSeconds = signal(0);

  readonly editMode = signal(false);
  readonly today = new Date();

  /** HU-Status aller aktiven Fahrzeuge als Ampel-Balken. */
  readonly tuvBar = computed<HealthBar>(() => {
    const vehicles = this.fleet.vehicles().filter((v) => v.is_active);
    let critical = 0;
    let warn = 0;
    let ok = 0;
    let unknown = 0;
    for (const v of vehicles) {
      switch (calcTuvInfo(v.tuv_date, v.is_faster_than_40kmh).status) {
        case 'expired':
        case 'due_7':
          critical++;
          break;
        case 'due_30':
          warn++;
          break;
        case 'valid':
          ok++;
          break;
        default:
          unknown++;
      }
    }
    return {
      total: vehicles.length,
      emptyLabel: 'Keine Fahrzeuge im Fuhrpark',
      segments: [
        { count: critical, token: '--hugo-status-critical', title: 'fällig/überfällig' },
        { count: warn, token: '--hugo-status-warn', title: 'bald fällig' },
        { count: ok, token: '--hugo-status-ok', title: 'gültig' },
        { count: unknown, token: '--hugo-status-unknown', title: 'ohne Datum' },
      ],
    };
  });

  /** Offene Schadensfälle nach Bearbeitungsstand als Ampel-Balken. */
  readonly damagesBar = computed<HealthBar>(() => {
    const reports = this.damages.reports().filter((d) => d.status !== 'resolved');
    const open = reports.filter((d) => d.status === 'open').length;
    const inRepair = reports.length - open;
    return {
      total: reports.length,
      emptyLabel: 'Keine offenen Schäden',
      segments: [
        { count: open, token: '--hugo-status-critical', title: 'offen' },
        { count: inRepair, token: '--hugo-status-warn', title: 'in Reparatur' },
      ],
    };
  });

  /** Nicht abgeschlossene Aufträge nach Dringlichkeit als Ampel-Balken. */
  readonly ordersBar = computed<HealthBar>(() => {
    const open = this.orders.orders().filter((o) => o.status !== 'done');
    let overdue = 0;
    let dueThisWeek = 0;
    let onTrack = 0;
    for (const o of open) {
      if (!o.end_date) {
        onTrack++;
        continue;
      }
      const end = new Date(o.end_date);
      if (differenceInCalendarDays(end, new Date()) < 0) {
        overdue++;
      } else if (isThisWeek(end, { weekStartsOn: 1 })) {
        dueThisWeek++;
      } else {
        onTrack++;
      }
    }
    return {
      total: open.length,
      emptyLabel: 'Keine offenen Aufträge',
      segments: [
        { count: overdue, token: '--hugo-status-critical', title: 'überfällig' },
        { count: dueThisWeek, token: '--hugo-status-warn', title: 'diese Woche fällig' },
        { count: onTrack, token: '--hugo-status-ok', title: 'im Plan' },
      ],
    };
  });

  /** Aktive Fahrzeuge mit Leasing nach Restlaufzeit als Ampel-Balken. */
  readonly leasingBar = computed<HealthBar>(() => {
    const leased = this.fleet.vehicles().filter((v) => v.is_active && v.leasing_end);
    let expired = 0;
    let endingSoon = 0;
    let ok = 0;
    for (const v of leased) {
      const days = differenceInCalendarDays(new Date(v.leasing_end!), new Date());
      if (days < 0) {
        expired++;
      } else if (days <= 90) {
        endingSoon++;
      } else {
        ok++;
      }
    }
    return {
      total: leased.length,
      emptyLabel: 'Kein Leasing hinterlegt',
      segments: [
        { count: expired, token: '--hugo-status-critical', title: 'abgelaufen' },
        { count: endingSoon, token: '--hugo-status-warn', title: 'läuft aus (≤90 Tage)' },
        { count: ok, token: '--hugo-status-ok', title: 'läuft weiter' },
      ],
    };
  });

  readonly hoursThisMonth = this.monthSeconds.asReadonly();

  /** Mini-Kalender: überfällige + kommende Termine (HU, Service, Leasing, Aufträge). */
  readonly upcomingEvents = computed<UpcomingEvent[]>(() => {
    const today = new Date();
    const events: UpcomingEvent[] = [];

    for (const v of this.fleet.vehicles().filter((v) => v.is_active)) {
      const tuv = calcTuvInfo(v.tuv_date, v.is_faster_than_40kmh, today);
      if (tuv.dueMonthEnd && (tuv.daysRemaining ?? Infinity) <= EVENT_HORIZON_DAYS) {
        events.push({
          date: tuv.dueMonthEnd,
          label: 'HU fällig',
          sub: v.plate,
          route: '/fuhrpark/tuv',
          icon: 'verified',
        });
      }
      if (
        v.next_service_date &&
        differenceInCalendarDays(new Date(v.next_service_date), today) <= EVENT_HORIZON_DAYS
      ) {
        events.push({
          date: new Date(v.next_service_date),
          label: 'Service fällig',
          sub: v.plate,
          route: `/fuhrpark/${v.id}`,
          icon: 'build_circle',
        });
      }
      if (
        v.leasing_end &&
        differenceInCalendarDays(new Date(v.leasing_end), today) <= EVENT_HORIZON_DAYS
      ) {
        events.push({
          date: new Date(v.leasing_end),
          label: 'Leasing-Ende',
          sub: v.plate,
          route: `/fuhrpark/${v.id}`,
          icon: 'directions_car',
        });
      }
    }

    for (const o of this.orders.orders().filter((o) => o.status !== 'done' && o.end_date)) {
      if (differenceInCalendarDays(new Date(o.end_date!), today) <= EVENT_HORIZON_DAYS) {
        events.push({
          date: new Date(o.end_date!),
          label: 'Auftrag fällig',
          sub: o.order_number,
          route: '/auftraege',
          icon: 'assignment',
        });
      }
    }

    return events.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 6);
  });

  /** Gespeicherte Reihenfolge + neue Widgets angehängt, entfernte bereinigt. */
  private readonly kpiPrefs = computed(() =>
    mergeLayout(
      KPIS.map((k) => k.id),
      this.prefs.layout().kpis,
    ),
  );

  private readonly cardPrefs = computed(() =>
    mergeLayout(
      CARDS.filter((c) => !c.adminOnly || this.auth.isAdmin()).map((c) => c.route),
      this.prefs.layout().cards,
    ),
  );

  /** Anzeige-Liste: im Bearbeiten-Modus auch ausgeblendete (gedimmt). */
  readonly kpiWidgets = computed(() =>
    this.kpiPrefs()
      .filter((w) => this.editMode() || !w.hidden)
      .map((w) => ({ def: KPIS.find((k) => k.id === w.id)!, hidden: !!w.hidden })),
  );

  readonly cardWidgets = computed(() =>
    this.cardPrefs()
      .filter((w) => this.editMode() || !w.hidden)
      .map((w) => ({ def: CARDS.find((c) => c.route === w.id)!, hidden: !!w.hidden })),
  );

  constructor() {
    void this.fleet.load();
    void this.damages.load();
    void this.orders.load();
    void this.loadMonthHours();
    void this.prefs.load();
  }

  healthBar(id: string): HealthBar {
    switch (id) {
      case 'tuv':
        return this.tuvBar();
      case 'damages':
        return this.damagesBar();
      case 'orders':
        return this.ordersBar();
      case 'leasingEnding':
        return this.leasingBar();
      default:
        return { total: 0, emptyLabel: '', segments: [] };
    }
  }

  toggleEditMode(): void {
    this.editMode.update((v) => !v);
  }

  // Drop-Indizes beziehen sich auf die gerenderte Liste; im Bearbeiten-Modus
  // (nur dort ist Drag aktiv) werden alle Widgets gerendert → 1:1 zu kpiPrefs.
  dropKpi(event: CdkDragDrop<unknown>): void {
    const list = [...this.kpiPrefs()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    void this.saveLayout(list, this.cardPrefs());
  }

  dropCard(event: CdkDragDrop<unknown>): void {
    const list = [...this.cardPrefs()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    void this.saveLayout(this.kpiPrefs(), list);
  }

  toggleHidden(section: 'kpis' | 'cards', id: string): void {
    const flip = (list: WidgetPref[]) =>
      list.map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w));
    if (section === 'kpis') {
      void this.saveLayout(flip(this.kpiPrefs()), this.cardPrefs());
    } else {
      void this.saveLayout(this.kpiPrefs(), flip(this.cardPrefs()));
    }
  }

  resetLayout(): void {
    void this.prefs.save({ version: 1, kpis: [], cards: [] });
  }

  private saveLayout(kpis: WidgetPref[], cards: WidgetPref[]): Promise<void> {
    return this.prefs.save({ version: 1, kpis, cards });
  }

  private async loadMonthHours(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      return;
    }
    const { data } = await this.supabase
      .from('time_entries')
      .select('duration_seconds')
      .eq('user_id', userId)
      .gte('started_at', startOfMonth(new Date()).toISOString());
    const total = (data ?? []).reduce(
      (sum, e) => sum + ((e as { duration_seconds: number | null }).duration_seconds ?? 0),
      0,
    );
    this.monthSeconds.set(total);
  }
}

/**
 * Vereinigt gespeicherte Reihenfolge mit den aktuellen Defaults:
 * unbekannte (entfernte) Widgets fliegen raus, neue kommen hinten dran.
 */
function mergeLayout(defaultIds: string[], saved: WidgetPref[]): WidgetPref[] {
  const known = new Set(defaultIds);
  const result = saved.filter((w) => known.has(w.id));
  for (const id of defaultIds) {
    if (!result.some((w) => w.id === id)) {
      result.push({ id });
    }
  }
  return result;
}
