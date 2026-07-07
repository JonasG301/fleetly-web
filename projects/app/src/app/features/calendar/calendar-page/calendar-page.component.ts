import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  CalendarDatePipe,
  CalendarEvent,
  CalendarEventTitleFormatter,
  CalendarMonthViewComponent,
  CalendarMonthViewDay,
  CalendarNextViewDirective,
  CalendarPreviousViewDirective,
  CalendarTodayDirective,
  DateAdapter,
  provideCalendar,
} from 'angular-calendar';
import { format, isSameDay, isSameMonth } from 'date-fns';
import { de } from 'date-fns/locale';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';

/**
 * Der Zeitraum steht bereits im sichtbaren Label (siehe toOrderEvent/toEntryEvent) —
 * der Standard-Tooltip von angular-calendar reagiert nur auf Hover und liefert auf
 * Touch-Geräten (Handy/Tablet) keine zusätzliche Info, deshalb abgeschaltet.
 */
class NoHoverTooltipFormatter extends CalendarEventTitleFormatter {
  override monthTooltip(): string {
    return '';
  }
}
import { CalendarEntry } from '../../../core/models/calendar-entry.model';
import { ORDER_STATUS_LABELS } from '../../../core/models/order.model';
import { LoadErrorComponent } from '../../../shared/components/load-error/load-error.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CustomersService } from '../../customers/customers.service';
import { FleetService } from '../../fleet/fleet.service';
import { OrderFormComponent } from '../../orders/order-form/order-form.component';
import { OrderWithVehicles, OrdersService } from '../../orders/orders.service';
import { CalendarEntryFormComponent } from '../calendar-entry-form/calendar-entry-form.component';
import { CalendarEntriesService } from '../calendar-entries.service';

type CalEventMeta =
  | { kind: 'order'; order: OrderWithVehicles }
  | { kind: 'entry'; entry: CalendarEntry };

const STATUS_COLOR: Record<string, string> = {
  open: 'var(--hugo-status-unknown)',
  in_progress: 'var(--hugo-status-warn)',
  done: 'var(--hugo-status-ok)',
};

/** Monatskalender: Aufträge automatisch als Balken + manuell anlegbare freie Termine. */
@Component({
  selector: 'app-calendar-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    PageHeaderComponent,
    LoadErrorComponent,
    CalendarPreviousViewDirective,
    CalendarTodayDirective,
    CalendarNextViewDirective,
    CalendarMonthViewComponent,
    CalendarDatePipe,
  ],
  providers: [
    provideCalendar({
      provide: DateAdapter,
      useFactory: adapterFactory,
    }),
    { provide: CalendarEventTitleFormatter, useClass: NoHoverTooltipFormatter },
  ],
  template: `
    <app-page-header title="Kalender" subtitle="Aufträge und Termine im Überblick">
      <button matButton [matMenuTriggerFor]="addMenu">
        <mat-icon>add</mat-icon>
        Neu
      </button>
      <mat-menu #addMenu="matMenu">
        <button mat-menu-item (click)="openNewEntry()">
          <mat-icon>event</mat-icon>
          Freier Termin
        </button>
        <button mat-menu-item (click)="openNewOrder()">
          <mat-icon>assignment</mat-icon>
          Neuer Auftrag
        </button>
      </mat-menu>
    </app-page-header>

    @if (orders.loading() || entries.loading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (orders.loadError(); as err) {
      <app-load-error [message]="err" (retry)="orders.load()" />
    }
    @if (entries.loadError(); as err) {
      <app-load-error [message]="err" (retry)="entries.load()" />
    }

    <div class="toolbar">
      <div class="nav-group">
        <button matButton mwlCalendarPreviousView [view]="'month'" [(viewDate)]="viewDate">
          <mat-icon>chevron_left</mat-icon>
        </button>
        <button matButton mwlCalendarToday [(viewDate)]="viewDate">Heute</button>
        <button matButton mwlCalendarNextView [view]="'month'" [(viewDate)]="viewDate">
          <mat-icon>chevron_right</mat-icon>
        </button>
      </div>
      <h2>{{ viewDate | calendarDate: 'monthViewTitle' : 'de' }}</h2>
    </div>

    <div class="legend">
      @for (status of statusOrder; track status) {
        <span class="legend-item">
          <span class="dot" [style.background]="statusColor[status]"></span>
          {{ statusLabels[status] }}
        </span>
      }
      <span class="legend-item">
        <span class="dot" [style.background]="'var(--hugo-ink-muted)'"></span>
        Freier Termin
      </span>
    </div>

    <mwl-calendar-month-view
      [viewDate]="viewDate"
      [events]="events()"
      [locale]="'de'"
      [weekStartsOn]="1"
      [activeDayIsOpen]="activeDayIsOpen()"
      (eventClicked)="onEventClicked($event.event)"
      (dayClicked)="onDayClicked($event.day)"
    />
  `,
  styles: `
    .toolbar {
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 16px 0 8px;
    }
    .nav-group {
      display: flex;
      gap: 4px;
    }
    h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      text-transform: capitalize;
    }
    .legend {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      font-size: 13px;
      color: var(--hugo-ink-muted);
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
  `,
})
export class CalendarPageComponent {
  readonly orders = inject(OrdersService);
  readonly entries = inject(CalendarEntriesService);
  private readonly customers = inject(CustomersService);
  private readonly fleet = inject(FleetService);
  private readonly dialog = inject(MatDialog);

  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly statusColor = STATUS_COLOR;
  readonly statusOrder: Array<keyof typeof ORDER_STATUS_LABELS> = ['open', 'in_progress', 'done'];

  viewDate = new Date();
  readonly activeDayIsOpen = signal(false);

  readonly events = computed<CalendarEvent<CalEventMeta>[]>(() => {
    const orderEvents = this.orders
      .orders()
      .filter((o) => !!o.start_date)
      .map((o) => this.toOrderEvent(o));
    const entryEvents = this.entries.entries().map((e) => this.toEntryEvent(e));
    return [...orderEvents, ...entryEvents];
  });

  constructor() {
    void this.orders.load();
    void this.entries.load();
    void this.customers.load();
    void this.fleet.load();
  }

  private toOrderEvent(order: OrderWithVehicles): CalendarEvent<CalEventMeta> {
    const customerName =
      this.customers.customers().find((c) => c.id === order.customer_id)?.company_name ?? '–';
    const color = STATUS_COLOR[order.status];
    const start = new Date(order.start_date!);
    const end = new Date(order.end_date ?? order.start_date!);
    return {
      start,
      end,
      title: `${order.order_number} — ${customerName}${this.dateRangeSuffix(start, end)}`,
      allDay: true,
      color: { primary: color, secondary: color, secondaryText: 'var(--hugo-ink)' },
      meta: { kind: 'order', order },
    };
  }

  private toEntryEvent(entry: CalendarEntry): CalendarEvent<CalEventMeta> {
    const color = 'var(--hugo-ink-muted)';
    const vehiclePlate = entry.vehicle_id ? this.fleet.byId(entry.vehicle_id)?.plate : null;
    const start = new Date(entry.start_date);
    const end = new Date(entry.end_date);
    const base = vehiclePlate ? `${entry.title} (${vehiclePlate})` : entry.title;
    return {
      start,
      end,
      title: `${base}${this.dateRangeSuffix(start, end)}`,
      allDay: true,
      color: { primary: color, secondary: color, secondaryText: 'var(--hugo-ink)' },
      meta: { kind: 'entry', entry },
    };
  }

  /**
   * Zeitraum direkt im Label statt nur im (auf Touch-Geräten nutzlosen) Hover-Tooltip —
   * damit die Info auf PC und Handy gleichermaßen sichtbar ist.
   */
  private dateRangeSuffix(start: Date, end: Date): string {
    if (isSameDay(start, end)) {
      return '';
    }
    const fmt = (d: Date) => format(d, 'dd.MM.', { locale: de });
    return ` · ${fmt(start)}–${fmt(end)}`;
  }

  onEventClicked(event: CalendarEvent<CalEventMeta>): void {
    const meta = event.meta;
    if (!meta) {
      return;
    }
    if (meta.kind === 'order') {
      this.dialog.open(OrderFormComponent, { data: meta.order });
    } else {
      this.dialog.open(CalendarEntryFormComponent, { data: meta.entry });
    }
  }

  /**
   * Klick auf einen Tag ohne Termine öffnet direkt den Anlegen-Dialog mit
   * vorbelegtem Datum; ein Tag mit Termine klappt stattdessen die Tagesliste
   * auf/zu (Standardverhalten von angular-calendar).
   */
  onDayClicked(day: CalendarMonthViewDay<unknown>): void {
    if (!isSameMonth(day.date, this.viewDate)) {
      return;
    }
    if (day.events.length === 0) {
      this.openNewEntry(day.date);
      return;
    }
    if (isSameDay(this.viewDate, day.date) && this.activeDayIsOpen()) {
      this.activeDayIsOpen.set(false);
    } else {
      this.viewDate = day.date;
      this.activeDayIsOpen.set(true);
    }
  }

  openNewOrder(): void {
    this.dialog.open(OrderFormComponent, { data: null });
  }

  openNewEntry(date?: Date): void {
    this.dialog.open(CalendarEntryFormComponent, {
      data: date ? { start_date: this.toIsoDate(date) } : null,
    });
  }

  private toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
