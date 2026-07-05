import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { endOfDay, startOfDay, startOfMonth } from 'date-fns';
import { TimeEntry } from '../../../core/models/time-entry.model';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';
import { LoadErrorComponent } from '../../../shared/components/load-error/load-error.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CommissionCodesService } from '../../commission-codes/commission-codes.service';
import { CustomersService } from '../../customers/customers.service';
import { FleetService } from '../../fleet/fleet.service';
import { OrdersService } from '../../orders/orders.service';
import { CorrectionDialogComponent } from '../correction-dialog/correction-dialog.component';
import { ReportsService } from '../reports.service';

/**
 * Admin-Auswertung (US-15): alle Zeiteinträge mit Filtern, Summen je
 * Mitarbeiter/Auftrag, laufende Stempelungen markiert — Grundlage für Rechnungen.
 */
@Component({
  selector: 'app-admin-report',
  imports: [
    DatePipe,
    DurationPipe,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    PageHeaderComponent,
    LoadErrorComponent,
  ],
  template: `
    <app-page-header title="Auswertung" subtitle="Alle Zeiteinträge — Grundlage für Rechnungen">
      <button matButton (click)="load()">
        <mat-icon>refresh</mat-icon>
        Aktualisieren
      </button>
    </app-page-header>

    <form [formGroup]="filter" class="filter-row">
      <mat-form-field appearance="outline">
        <mat-label>Zeitraum</mat-label>
        <mat-date-range-input [rangePicker]="picker">
          <input matStartDate formControlName="from" placeholder="Von" />
          <input matEndDate formControlName="to" placeholder="Bis" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-date-range-picker #picker />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Mitarbeiter</mat-label>
        <mat-select formControlName="userId">
          <mat-option [value]="null">Alle</mat-option>
          @for (p of reports.profiles(); track p.id) {
            <mat-option [value]="p.id">{{ p.full_name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Auftrag</mat-label>
        <mat-select formControlName="orderId">
          <mat-option [value]="null">Alle</mat-option>
          @for (o of orders.orders(); track o.id) {
            <mat-option [value]="o.id">{{ o.order_number }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Fahrzeug</mat-label>
        <mat-select formControlName="vehicleId">
          <mat-option [value]="null">Alle</mat-option>
          @for (v of fleet.vehicles(); track v.id) {
            <mat-option [value]="v.id">{{ v.plate }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Kommission</mat-label>
        <mat-select formControlName="commissionCodeId">
          <mat-option [value]="null">Alle</mat-option>
          @for (c of codes.codes(); track c.id) {
            <mat-option [value]="c.id">{{ c.code }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </form>

    <div class="sums">
      <mat-card class="sum-card">
        <span class="sum-value">{{ totalSeconds() | duration }}</span>
        <span>Gesamt im Zeitraum</span>
      </mat-card>
      @for (group of sumsByEmployee(); track group.key) {
        <mat-card class="sum-card">
          <span class="sum-value">{{ group.seconds | duration }}</span>
          <span>{{ group.label }}</span>
        </mat-card>
      }
    </div>

    @if (reports.entries().length > 0) {
      <div class="breakdowns">
        <mat-card class="breakdown">
          <span class="breakdown-title">Nach Kunde</span>
          @for (row of sumsByCustomer(); track row.key) {
            <div class="bar-row">
              <span class="bar-label" [title]="row.label">{{ row.label }}</span>
              <span class="bar-track"><span class="bar-fill" [style.width.%]="row.percent"></span></span>
              <span class="bar-value">{{ row.seconds | duration }}</span>
            </div>
          }
        </mat-card>
        <mat-card class="breakdown">
          <span class="breakdown-title">Nach Fahrzeug</span>
          @for (row of sumsByVehicle(); track row.key) {
            <div class="bar-row">
              <span class="bar-label" [title]="row.label">{{ row.label }}</span>
              <span class="bar-track"><span class="bar-fill" [style.width.%]="row.percent"></span></span>
              <span class="bar-value">{{ row.seconds | duration }}</span>
            </div>
          }
        </mat-card>
        <mat-card class="breakdown">
          <span class="breakdown-title">Nach Monat</span>
          @for (row of sumsByMonth(); track row.key) {
            <div class="bar-row">
              <span class="bar-label">{{ row.label }}</span>
              <span class="bar-track"><span class="bar-fill month" [style.width.%]="row.percent"></span></span>
              <span class="bar-value">{{ row.seconds | duration }}</span>
            </div>
          }
        </mat-card>
      </div>
    }

    @if (reports.loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @if (loadError()) {
      <app-load-error [message]="loadError()!" (retry)="load()" />
    }

    <div class="table-scroll">
    <table mat-table [dataSource]="reports.entries()" class="mat-elevation-z1">
      <ng-container matColumnDef="date">
        <th mat-header-cell *matHeaderCellDef>Datum</th>
        <td mat-cell *matCellDef="let e">{{ e.started_at | date: 'dd.MM.yyyy' }}</td>
      </ng-container>
      <ng-container matColumnDef="employee">
        <th mat-header-cell *matHeaderCellDef>Mitarbeiter</th>
        <td mat-cell *matCellDef="let e">{{ employeeName(e) }}</td>
      </ng-container>
      <ng-container matColumnDef="order">
        <th mat-header-cell *matHeaderCellDef>Auftrag</th>
        <td mat-cell *matCellDef="let e">{{ orderNumber(e) }}</td>
      </ng-container>
      <ng-container matColumnDef="vehicle">
        <th mat-header-cell *matHeaderCellDef>Fahrzeug</th>
        <td mat-cell *matCellDef="let e">{{ plate(e) }}</td>
      </ng-container>
      <ng-container matColumnDef="code">
        <th mat-header-cell *matHeaderCellDef>Kommission</th>
        <td mat-cell *matCellDef="let e">{{ codeLabel(e) }}</td>
      </ng-container>
      <ng-container matColumnDef="time">
        <th mat-header-cell *matHeaderCellDef>Zeit</th>
        <td mat-cell *matCellDef="let e">
          {{ e.started_at | date: 'HH:mm' }}–{{ e.stopped_at ? (e.stopped_at | date: 'HH:mm') : '' }}
          @if (e.status === 'open' || e.status === 'paused') {
            <span class="running">{{ e.status === 'open' ? 'läuft' : 'pausiert' }}</span>
          }
        </td>
      </ng-container>
      <ng-container matColumnDef="duration">
        <th mat-header-cell *matHeaderCellDef>Dauer</th>
        <td mat-cell *matCellDef="let e">{{ e.duration_seconds | duration }}</td>
      </ng-container>
      <ng-container matColumnDef="note">
        <th mat-header-cell *matHeaderCellDef></th>
        <td mat-cell *matCellDef="let e">
          @if (e.correction_note) {
            <mat-icon class="note-icon" [title]="'Korrigiert: ' + e.correction_note">history_edu</mat-icon>
          }
        </td>
      </ng-container>
      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef></th>
        <td mat-cell *matCellDef="let e" class="actions">
          <button matIconButton (click)="correct(e)" aria-label="Korrigieren">
            <mat-icon>edit</mat-icon>
          </button>
        </td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
    </table>
    </div>

    @if (!reports.loading() && !loadError() && reports.entries().length === 0) {
      <p class="empty">Keine Zeiteinträge für die gewählten Filter.</p>
    }
  `,
  styles: `
    .filter-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .filter-row > * {
      min-width: 180px;
    }
    .sums {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .sum-card {
      padding: 12px 20px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
      color: rgba(0, 0, 0, 0.6);
    }
    .sum-value {
      font-size: 22px;
      font-weight: 700;
      color: #4e944f;
    }
    .breakdowns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .breakdown {
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .breakdown-title {
      font-size: 13px;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.6);
      margin-bottom: 4px;
    }
    .bar-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .bar-label {
      width: 96px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bar-track {
      flex: 1;
      height: 12px;
      background: #eceff1;
      border-radius: 6px;
      overflow: hidden;
    }
    .bar-fill {
      display: block;
      height: 100%;
      background: #4e944f;
      border-radius: 6px;
    }
    .bar-fill.month {
      background: #8d775f;
    }
    .bar-value {
      width: 64px;
      text-align: right;
      font-size: 12px;
      font-weight: 600;
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      background: white;
    }
    .running {
      font-size: 11px;
      font-weight: 600;
      color: #e65100;
      background: #fff3e0;
      border-radius: 10px;
      padding: 1px 8px;
      margin-left: 6px;
    }
    .note-icon {
      color: #8d775f;
      font-size: 18px;
    }
    .actions {
      text-align: right;
    }
    .empty {
      text-align: center;
      color: rgba(0, 0, 0, 0.5);
      padding: 32px;
    }
  `,
})
export class AdminReportComponent {
  readonly reports = inject(ReportsService);
  readonly orders = inject(OrdersService);
  readonly fleet = inject(FleetService);
  readonly codes = inject(CommissionCodesService);
  private readonly customers = inject(CustomersService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly columns = ['date', 'employee', 'order', 'vehicle', 'code', 'time', 'duration', 'note', 'actions'];
  readonly loadError = signal<string | null>(null);

  readonly filter = this.fb.group({
    from: [startOfMonth(new Date())],
    to: [new Date()],
    userId: [null as string | null],
    orderId: [null as string | null],
    vehicleId: [null as string | null],
    commissionCodeId: [null as string | null],
  });

  readonly totalSeconds = computed(() =>
    this.reports.entries().reduce((sum, e) => sum + (e.duration_seconds ?? 0), 0),
  );

  /** Summen je Mitarbeiter (US-15). */
  readonly sumsByEmployee = computed(() => {
    const byUser = new Map<string, number>();
    for (const e of this.reports.entries()) {
      byUser.set(e.user_id, (byUser.get(e.user_id) ?? 0) + (e.duration_seconds ?? 0));
    }
    return [...byUser.entries()].map(([key, seconds]) => ({
      key,
      seconds,
      label: this.reports.profiles().find((p) => p.id === key)?.full_name ?? 'Unbekannt',
    }));
  });

  /** Aufschlüsselung je Kunde (über den Auftrag), als sortierte Balken. */
  readonly sumsByCustomer = computed(() =>
    this.groupBars((e) => {
      const order = this.orders.orders().find((o) => o.id === e.order_id);
      const customer = order
        ? this.customers.customers().find((c) => c.id === order.customer_id)
        : null;
      return customer?.company_name ?? 'Unbekannt';
    }),
  );

  /** Aufschlüsselung je Fahrzeug. */
  readonly sumsByVehicle = computed(() =>
    this.groupBars((e) => (e.vehicle_id ? (this.fleet.byId(e.vehicle_id)?.plate ?? '–') : 'Ohne Fahrzeug')),
  );

  /** Aufschlüsselung je Monat (chronologisch). */
  readonly sumsByMonth = computed(() =>
    this.groupBars(
      (e) => e.started_at.slice(0, 7),
      (a, b) => a.key.localeCompare(b.key),
    ).map((r) => ({ ...r, label: this.monthLabel(r.key) })),
  );

  /** Gruppiert die Einträge nach einem Schlüssel und liefert Balken-Daten. */
  private groupBars(
    keyOf: (e: TimeEntry) => string,
    sort: (a: { key: string; seconds: number }, b: { key: string; seconds: number }) => number = (
      a,
      b,
    ) => b.seconds - a.seconds,
  ): { key: string; label: string; seconds: number; percent: number }[] {
    const map = new Map<string, number>();
    for (const e of this.reports.entries()) {
      const k = keyOf(e);
      map.set(k, (map.get(k) ?? 0) + (e.duration_seconds ?? 0));
    }
    const rows = [...map.entries()].map(([key, seconds]) => ({ key, label: key, seconds }));
    rows.sort(sort);
    const max = rows.reduce((m, r) => Math.max(m, r.seconds), 0) || 1;
    return rows.map((r) => ({ ...r, percent: Math.round((r.seconds / max) * 100) }));
  }

  private monthLabel(ym: string): string {
    const [y, m] = ym.split('-');
    const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    return `${months[Number(m) - 1] ?? m} ${y}`;
  }

  constructor() {
    void this.reports.loadProfiles();
    void this.orders.load();
    void this.fleet.load();
    void this.codes.load();
    void this.customers.load();
    void this.load();
    this.filter.valueChanges.subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    const raw = this.filter.getRawValue();
    this.loadError.set(null);
    try {
      await this.reports.load({
        from: startOfDay(raw.from ?? new Date()),
        to: endOfDay(raw.to ?? new Date()),
        userId: raw.userId,
        orderId: raw.orderId,
        vehicleId: raw.vehicleId,
        commissionCodeId: raw.commissionCodeId,
      });
    } catch (err) {
      this.loadError.set('Auswertung konnte nicht geladen werden: ' + (err as Error).message);
    }
  }

  employeeName(e: TimeEntry): string {
    return this.reports.profiles().find((p) => p.id === e.user_id)?.full_name ?? '–';
  }

  orderNumber(e: TimeEntry): string {
    return this.orders.orders().find((o) => o.id === e.order_id)?.order_number ?? '–';
  }

  plate(e: TimeEntry): string {
    return e.vehicle_id ? (this.fleet.byId(e.vehicle_id)?.plate ?? '–') : '–';
  }

  codeLabel(e: TimeEntry): string {
    return this.codes.codes().find((c) => c.id === e.commission_code_id)?.code ?? '–';
  }

  correct(entry: TimeEntry): void {
    this.dialog
      .open(CorrectionDialogComponent, { data: entry })
      .afterClosed()
      .subscribe((changed) => {
        if (changed) {
          void this.load();
        }
      });
  }
}
