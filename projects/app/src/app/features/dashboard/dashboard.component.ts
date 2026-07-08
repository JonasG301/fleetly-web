import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { GridsterComponent, GridsterItemComponent, GridsterConfig, GridsterItem } from 'angular-gridster2';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from 'auth';
import {
  CalendarDateFormatter,
  CalendarEvent,
  CalendarDayViewComponent,
  CalendarEventTitleFormatter,
  CalendarMonthViewComponent,
  DateAdapter,
  DateFormatterParams,
  provideCalendar,
} from 'angular-calendar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';
import {
  differenceInCalendarDays,
  format,
  isThisWeek,
  startOfMonth,
  addMonths,
  subMonths,
  addDays,
  subDays,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { SupabaseService } from '../../core/services/supabase.service';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { CalendarEntriesService } from '../calendar/calendar-entries.service';
import { DamageReportService } from '../fleet/damage-report/damage-report.service';
import { FleetService } from '../fleet/fleet.service';
import { calcTuvInfo } from '../fleet/tuv-status/tuv.utils';
import { OrdersService } from '../orders/orders.service';
import { DashboardPreferencesService, GridWidgetPref, WidgetPref } from './dashboard-preferences.service';

/**
 * Standard-Tooltip von angular-calendar reagiert nur auf Hover und liefert auf
 * Touch-Geräten (Handy/Tablet) keine zusätzliche Info — im kompakten Widget
 * ohnehin nur Auftrags-/Termintitel, deshalb abgeschaltet (wie in CalendarPageComponent).
 */
class NoHoverTooltipFormatter extends CalendarEventTitleFormatter {
  override monthTooltip(): string {
    return '';
  }
}

/** Default-Formatter rendert Stundenbeschriftungen fest mit 12h-Format/AM-PM — hier
 *  auf deutsche 24h-Zeit umgestellt (siehe CalendarPageComponent). */
class GermanDateFormatter extends CalendarDateFormatter {
  override dayViewHour({ date }: DateFormatterParams): string {
    return format(date, 'HH:mm', { locale: de });
  }

  override weekViewHour({ date }: DateFormatterParams): string {
    return format(date, 'HH:mm', { locale: de });
  }
}

const CAL_STATUS_COLOR: Record<string, string> = {
  open: 'var(--hugo-status-unknown)',
  in_progress: 'var(--hugo-status-warn)',
  done: 'var(--hugo-status-ok)',
};

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

type WidgetKind = 'kpi' | 'events' | 'calendar' | 'nav';

/** Statische Definition eines Grid-Widgets: Art, Titel und Default-Position/-Größe. */
interface WidgetDef {
  id: string;
  kind: WidgetKind;
  title: string;
  kpiId?: string;
  defaultItem: GridsterItem;
}

/** Default-Anordnung auf einem 12-Spalten-Grid — Nutzer können frei umsortieren. */
const WIDGET_DEFS: WidgetDef[] = [
  { id: 'kpi:tuv', kind: 'kpi', kpiId: 'tuv', title: 'HU-Status', defaultItem: gridItem(0, 0, 3, 2) },
  { id: 'kpi:damages', kind: 'kpi', kpiId: 'damages', title: 'Schäden', defaultItem: gridItem(3, 0, 3, 2) },
  { id: 'kpi:orders', kind: 'kpi', kpiId: 'orders', title: 'Aufträge', defaultItem: gridItem(6, 0, 3, 2) },
  {
    id: 'kpi:leasingEnding',
    kind: 'kpi',
    kpiId: 'leasingEnding',
    title: 'Leasing',
    defaultItem: gridItem(9, 0, 3, 2),
  },
  {
    id: 'kpi:hours',
    kind: 'kpi',
    kpiId: 'hours',
    title: 'Meine Stunden (Monat)',
    defaultItem: gridItem(0, 2, 3, 2),
  },
  { id: 'events', kind: 'events', title: 'Nächste Termine', defaultItem: gridItem(3, 2, 5, 4, 3, 3) },
  { id: 'calendar', kind: 'calendar', title: 'Kalender', defaultItem: gridItem(8, 2, 4, 6, 3, 3) },
  { id: 'nav', kind: 'nav', title: 'Links', defaultItem: gridItem(0, 6, 8, 6, 3, 3) },
];

function gridItem(
  x: number,
  y: number,
  cols: number,
  rows: number,
  minItemCols = 2,
  minItemRows = 2,
): GridsterItem {
  return { x, y, cols, rows, minItemCols, minItemRows };
}

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    DragDropModule,
    GridsterComponent,
    GridsterItemComponent,
    MatButtonModule,
    MatIconModule,
    DurationPipe,
    DatePipe,
    PageHeaderComponent,
    CalendarMonthViewComponent,
    CalendarDayViewComponent,
  ],
  providers: [
    provideCalendar({
      provide: DateAdapter,
      useFactory: adapterFactory,
    }),
    { provide: CalendarEventTitleFormatter, useClass: NoHoverTooltipFormatter },
    { provide: CalendarDateFormatter, useClass: GermanDateFormatter },
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
        Kacheln am Titel per Drag &amp; Drop frei anordnen, an der Ecke unten rechts in der
        Größe ziehen, mit dem Auge ein-/ausblenden.
      </p>
    }

    <gridster [options]="gridOptions()" class="dashboard-grid">
      @for (w of visibleWidgets(); track w.def.id) {
        <gridster-item [item]="w.item" [class.hidden-widget]="w.hidden">
          <div class="widget" [class.editing]="editMode()">
            <div class="widget-header" [class.widget-drag-handle]="editMode()">
              <span class="widget-title">{{ w.def.title }}</span>
              @if (w.def.kind === 'calendar') {
                <div class="cal-nav">
                  <button
                    mat-icon-button
                    type="button"
                    (click)="prevCalendarPeriod()"
                    aria-label="Zurück"
                  >
                    <mat-icon>chevron_left</mat-icon>
                  </button>
                  <span class="cal-month-label">{{ calendarPeriodLabel() }}</span>
                  <button
                    mat-icon-button
                    type="button"
                    (click)="nextCalendarPeriod()"
                    aria-label="Weiter"
                  >
                    <mat-icon>chevron_right</mat-icon>
                  </button>
                  <button
                    class="cal-view-btn"
                    type="button"
                    [class.active]="calendarView() === 'month'"
                    (click)="setCalendarView('month')"
                  >
                    Monat
                  </button>
                  <button
                    class="cal-view-btn"
                    type="button"
                    [class.active]="calendarView() === 'day'"
                    (click)="setCalendarView('day')"
                  >
                    Tag
                  </button>
                  <a mat-button routerLink="/kalender" class="cal-open-link">Öffnen</a>
                </div>
              }
              @if (editMode()) {
                <button
                  class="hide-btn"
                  type="button"
                  [attr.aria-label]="w.hidden ? 'Einblenden' : 'Ausblenden'"
                  (click)="toggleWidgetHidden(w.def.id)"
                >
                  <mat-icon>{{ w.hidden ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              }
            </div>

            <div class="widget-body">
              @switch (w.def.kind) {
                @case ('kpi') {
                  @let kpi = kpiDef(w.def.kpiId!);
                  <a class="kpi-body" [routerLink]="editMode() ? null : kpi.route">
                    @if (kpi.kind === 'duration') {
                      <span class="kpi-value hugo-stat">{{ hoursThisMonth() | duration }}</span>
                    } @else {
                      @let bar = healthBar(kpi.id);
                      <div class="bar-header">
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
                @case ('events') {
                  @if (upcomingEvents().length > 0) {
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
                  } @else {
                    <p class="widget-empty">Keine anstehenden Termine</p>
                  }
                }
                @case ('calendar') {
                  <div class="calendar-widget">
                    @if (calendarView() === 'month') {
                      <mwl-calendar-month-view
                        [viewDate]="calendarViewDate()"
                        [events]="calendarEvents()"
                        [locale]="'de'"
                        [weekStartsOn]="1"
                        [activeDayIsOpen]="false"
                        (dayClicked)="goToCalendar()"
                        (eventClicked)="goToCalendar()"
                      />
                    } @else {
                      <mwl-calendar-day-view
                        [viewDate]="calendarViewDate()"
                        [events]="calendarEvents()"
                        [locale]="'de'"
                        (eventClicked)="goToCalendar()"
                      />
                    }
                  </div>
                }
                @case ('nav') {
                  <div
                    class="nav-list"
                    cdkDropList
                    cdkDropListOrientation="mixed"
                    [cdkDropListDisabled]="!editMode()"
                    (cdkDropListDropped)="dropCard($event)"
                  >
                    @for (c of cardWidgets(); track c.def.route) {
                      <a
                        class="nav-row"
                        cdkDrag
                        [class.editing]="editMode()"
                        [class.hidden-widget]="c.hidden"
                        [routerLink]="editMode() ? null : c.def.route"
                      >
                        <mat-icon class="nav-icon">{{ c.def.icon }}</mat-icon>
                        <span class="nav-label">{{ c.def.label }}</span>
                        @if (editMode()) {
                          <button
                            class="hide-btn"
                            type="button"
                            [attr.aria-label]="c.hidden ? 'Einblenden' : 'Ausblenden'"
                            (click)="toggleCardHidden(c.def.route)"
                          >
                            <mat-icon>{{ c.hidden ? 'visibility_off' : 'visibility' }}</mat-icon>
                          </button>
                        } @else {
                          <mat-icon class="chevron">chevron_right</mat-icon>
                        }
                      </a>
                    }
                  </div>
                }
              }
            </div>
          </div>
        </gridster-item>
      }
    </gridster>
  `,
  styles: `
    .edit-hint {
      margin: -8px 0 16px;
      font-size: 13px;
      color: var(--hugo-ink-muted);
    }

    /* ── Grid-Widgets ─────────────────────────────────────────────────── */
    /* angular-gridster2 setzt selbst eine graue Default-Hintergrundfarbe und
       eigene Höhe/Breite per Inline-Style (gridType 'verticalFixed' wächst
       automatisch mit der Zeilenzahl) — hier nur auf HUGO-Papierfarbe umfärben,
       keine eigene Höhe erzwingen. */
    .dashboard-grid {
      background: var(--hugo-paper) !important;
      margin-bottom: 24px;
    }
    .widget {
      display: flex;
      flex-direction: column;
      height: 100%;
      border: 1px solid var(--hugo-hairline);
      border-radius: var(--hugo-radius-control);
      background: var(--hugo-paper);
      overflow: hidden;
    }
    .widget-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 8px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--hugo-hairline);
    }
    .widget.editing .widget-header.widget-drag-handle {
      cursor: grab;
    }
    .widget.editing .widget-header.widget-drag-handle:active {
      cursor: grabbing;
    }
    .widget-title {
      flex: 1;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--hugo-ink-muted);
    }
    .widget-body {
      flex: 1;
      min-height: 0;
      padding: 10px;
      overflow: auto;
    }
    .widget-empty {
      margin: 0;
      font-size: 12px;
      color: var(--hugo-ink-muted);
    }
    /* gridster-item bringt selbst einen eckigen, weißen Hintergrund mit (eigenes
       Encapsulated-CSS der Bibliothek) — unser .widget-Div legt zwar abgerundete
       Ecken darüber, aber an den Ecken blitzt sonst das weiße Rechteck durch. */
    gridster-item {
      background: transparent !important;
      border-radius: var(--hugo-radius-control);
    }
    gridster-item.hidden-widget {
      opacity: 0.4;
    }

    /* ── Kennzahlen: Ampel-Balken statt reiner Zahlen ────────────────── */
    .kpi-body {
      display: flex;
      flex-direction: column;
      gap: 6px;
      height: 100%;
      text-decoration: none;
      color: inherit;
    }
    .bar-header {
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
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

    /* ── Nächste Termine ──────────────────────────────────────────────── */
    .events-list {
      display: flex;
      flex-direction: column;
    }
    .event-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 2px;
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

    /* ── Kalender ─────────────────────────────────────────────────────── */
    .cal-nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px;
    }
    .cal-month-label {
      min-width: 70px;
      text-align: center;
      font-size: 13px;
      font-weight: 600;
      text-transform: capitalize;
    }
    .cal-view-btn {
      border: none;
      background: transparent;
      border-radius: var(--hugo-radius-control);
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--hugo-ink-muted);
      cursor: pointer;
    }
    .cal-view-btn.active {
      background: color-mix(in srgb, var(--hugo-accent) 12%, transparent);
      color: var(--hugo-accent);
    }
    .cal-open-link {
      margin-left: 4px;
      color: var(--hugo-ink-muted);
    }
    .calendar-widget {
      height: 100%;
    }
    .calendar-widget ::ng-deep .cal-month-view .cal-day-cell {
      min-height: 44px;
    }
    .calendar-widget ::ng-deep .cal-month-view .cal-event {
      cursor: pointer;
    }
    .calendar-widget ::ng-deep .cal-month-view .cal-event-title {
      font-size: 11px;
    }
    .calendar-widget ::ng-deep .cal-month-view .cal-header .cal-cell {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 11px;
      padding: 0 2px;
    }

    /* ── Navigation: dichte Hairline-Liste statt bunter Kacheln ──────── */
    .nav-list {
      display: flex;
      flex-direction: column;
    }
    .nav-row {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 4px;
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
  private readonly calendarEntries = inject(CalendarEntriesService);
  private readonly supabase = inject(SupabaseService);
  private readonly prefs = inject(DashboardPreferencesService);
  private readonly router = inject(Router);

  private readonly monthSeconds = signal(0);

  readonly editMode = signal(false);
  readonly today = new Date();

  /** Grid-Konfiguration für angular-gridster2 — Drag/Resize nur im Bearbeiten-Modus. */
  readonly gridOptions = computed<GridsterConfig>(() => {
    const editing = this.editMode();
    return {
      gridType: 'verticalFixed',
      setGridSize: true,
      fixedRowHeight: 54,
      minCols: 12,
      maxCols: 12,
      minRows: 4,
      margin: 16,
      outerMargin: false,
      mobileBreakpoint: 720,
      compactType: 'none',
      pushItems: true,
      swap: false,
      displayGrid: editing ? 'always' : 'none',
      draggable: {
        enabled: editing,
        dragHandleClass: 'widget-drag-handle',
        // gridster committet die finale Position erst NACH Auflösen dieses stop-Promises
        // (makeDrag() läuft als .then()-Microtask danach) — mit setTimeout einen Tick
        // warten, sonst persistieren wir die Position von VOR dem Drop.
        stop: () => void setTimeout(() => this.persistGridLayout()),
      },
      resizable: {
        enabled: editing,
        stop: () => void setTimeout(() => this.persistGridLayout()),
      },
    };
  });

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

    for (const c of this.calendarEntries.entries()) {
      const start = new Date(c.start_date);
      if (differenceInCalendarDays(start, today) <= EVENT_HORIZON_DAYS) {
        events.push({
          date: start,
          label: c.title,
          sub: c.vehicle_id ? (this.fleet.byId(c.vehicle_id)?.plate ?? '') : 'Termin',
          route: '/kalender',
          icon: 'event',
        });
      }
    }

    return events.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 6);
  });

  /** Kompakte Monats-/Tagesansicht: gleiche Datenquelle wie die Kalender-Seite. */
  readonly calendarViewDate = signal(new Date());
  readonly calendarView = signal<'month' | 'day'>('month');

  readonly calendarPeriodLabel = computed(() =>
    this.calendarView() === 'day'
      ? format(this.calendarViewDate(), 'EEE, d. MMM', { locale: de })
      : format(this.calendarViewDate(), 'MMMM yyyy', { locale: de }),
  );

  readonly calendarEvents = computed<CalendarEvent[]>(() => {
    const orderEvents = this.orders
      .orders()
      .filter((o) => !!o.start_date)
      .map((o): CalendarEvent => {
        const color = CAL_STATUS_COLOR[o.status];
        return {
          start: new Date(o.start_date!),
          end: new Date(o.end_date ?? o.start_date!),
          title: o.order_number,
          allDay: true,
          color: { primary: color, secondary: color, secondaryText: 'var(--hugo-ink)' },
        };
      });
    const entryEvents = this.calendarEntries.entries().map((e): CalendarEvent => {
      const color = 'var(--hugo-ink-muted)';
      const start = e.start_time ? new Date(`${e.start_date}T${e.start_time}`) : new Date(e.start_date);
      const end = e.end_time ? new Date(`${e.end_date}T${e.end_time}`) : new Date(e.end_date);
      return {
        start,
        end,
        title: e.title,
        allDay: !e.start_time,
        color: { primary: color, secondary: color, secondaryText: 'var(--hugo-ink)' },
      };
    });
    return [...orderEvents, ...entryEvents];
  });

  /**
   * Grid-Widgets: gespeicherte Position/Größe + neue Widgets defaultmäßig
   * angehängt, entfernte bereinigt. Die item-Objekte sind mutable — gridster
   * schreibt x/y/cols/rows während Drag/Resize direkt hinein — und bleiben
   * über die Editier-Session stabil, solange sich `prefs.layout()` nicht
   * ändert (nur beim Speichern nach Drag/Resize-Ende).
   */
  private readonly widgetPrefs = computed(() => mergeGridLayout(this.prefs.layout().items));

  readonly visibleWidgets = computed(() =>
    this.widgetPrefs().filter((w) => this.editMode() || !w.hidden),
  );

  /** Gespeicherte Reihenfolge der Links im "Links"-Widget. */
  private readonly cardPrefs = computed(() =>
    mergeCardLayout(
      CARDS.filter((c) => !c.adminOnly || this.auth.isAdmin()).map((c) => c.route),
      this.prefs.layout().cards,
    ),
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
    void this.calendarEntries.load();
    void this.loadMonthHours();
    void this.prefs.load();
  }

  kpiDef(id: string): KpiDef {
    return KPIS.find((k) => k.id === id)!;
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

  toggleWidgetHidden(id: string): void {
    const items = this.widgetPrefs().map((w) =>
      w.def.id === id
        ? { id: w.def.id, x: w.item.x, y: w.item.y, cols: w.item.cols, rows: w.item.rows, hidden: !w.hidden }
        : toGridWidgetPref(w),
    );
    void this.prefs.save({ version: 2, items, cards: this.cardPrefs() });
  }

  dropCard(event: CdkDragDrop<unknown>): void {
    const list = [...this.cardPrefs()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    void this.prefs.save({
      version: 2,
      items: this.widgetPrefs().map(toGridWidgetPref),
      cards: list,
    });
  }

  toggleCardHidden(id: string): void {
    const cards = this.cardPrefs().map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w));
    void this.prefs.save({ version: 2, items: this.widgetPrefs().map(toGridWidgetPref), cards });
  }

  resetLayout(): void {
    void this.prefs.save({ version: 2, items: [], cards: [] });
  }

  setCalendarView(view: 'month' | 'day'): void {
    this.calendarView.set(view);
  }

  prevCalendarPeriod(): void {
    this.calendarViewDate.update((d) => (this.calendarView() === 'day' ? subDays(d, 1) : subMonths(d, 1)));
  }

  nextCalendarPeriod(): void {
    this.calendarViewDate.update((d) => (this.calendarView() === 'day' ? addDays(d, 1) : addMonths(d, 1)));
  }

  goToCalendar(): void {
    void this.router.navigate(['/kalender']);
  }

  /** Wird nach Drag- oder Resize-Ende eines Grid-Widgets aufgerufen — persistiert die
   *  aktuellen (von gridster direkt in die item-Objekte geschriebenen) Positionen. */
  private persistGridLayout(): void {
    void this.prefs.save({
      version: 2,
      items: this.widgetPrefs().map(toGridWidgetPref),
      cards: this.cardPrefs(),
    });
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

interface GridWidgetInstance {
  def: WidgetDef;
  item: GridsterItem;
  hidden: boolean;
}

function toGridWidgetPref(w: GridWidgetInstance): GridWidgetPref {
  return { id: w.def.id, x: w.item.x, y: w.item.y, cols: w.item.cols, rows: w.item.rows, hidden: w.hidden };
}

/**
 * Vereinigt gespeicherte Grid-Positionen mit den Default-Widgets: unbekannte
 * (entfernte) Widgets fliegen raus, neue werden unterhalb der gespeicherten
 * Widgets angehängt (Kollisionen löst gridster beim Rendern automatisch auf).
 */
function mergeGridLayout(saved: GridWidgetPref[]): GridWidgetInstance[] {
  const savedById = new Map(saved.filter((s) => WIDGET_DEFS.some((d) => d.id === s.id)).map((s) => [s.id, s]));
  const yOffset =
    savedById.size > 0 ? Math.max(0, ...[...savedById.values()].map((s) => s.y + s.rows)) : 0;

  return WIDGET_DEFS.map((def) => {
    const s = savedById.get(def.id);
    if (s) {
      return {
        def,
        hidden: !!s.hidden,
        item: gridItem(s.x, s.y, s.cols, s.rows, def.defaultItem.minItemCols, def.defaultItem.minItemRows),
      };
    }
    return {
      def,
      hidden: false,
      item: gridItem(
        def.defaultItem.x,
        def.defaultItem.y + yOffset,
        def.defaultItem.cols,
        def.defaultItem.rows,
        def.defaultItem.minItemCols,
        def.defaultItem.minItemRows,
      ),
    };
  });
}

/** Vereinigt gespeicherte Reihenfolge mit den aktuellen Default-Links. */
function mergeCardLayout(defaultIds: string[], saved: WidgetPref[]): WidgetPref[] {
  const known = new Set(defaultIds);
  const result = saved.filter((w) => known.has(w.id));
  for (const id of defaultIds) {
    if (!result.some((w) => w.id === id)) {
      result.push({ id });
    }
  }
  return result;
}
