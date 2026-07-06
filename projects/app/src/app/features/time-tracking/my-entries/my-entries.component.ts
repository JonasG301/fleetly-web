import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AuthService } from 'auth';
import { endOfDay, startOfDay, startOfWeek } from 'date-fns';
import { TimeEntry } from '../../../core/models/time-entry.model';
import { SupabaseService } from '../../../core/services/supabase.service';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';
import { LoadErrorComponent } from '../../../shared/components/load-error/load-error.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CommissionCodesService } from '../../commission-codes/commission-codes.service';
import { FleetService } from '../../fleet/fleet.service';
import { OrdersService } from '../../orders/orders.service';

/** Eigene Zeiteinträge mit Zeitraum-Filter und Summen (US-14). */
@Component({
  selector: 'app-my-entries',
  imports: [
    DatePipe,
    DurationPipe,
    RouterLink,
    ReactiveFormsModule,
    MatFormFieldModule,
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
    <app-page-header title="Meine Zeiten" subtitle="Erfasste Arbeitszeiten einsehen" />

    <div class="filter-row">
      <mat-form-field appearance="outline">
        <mat-label>Zeitraum</mat-label>
        <mat-date-range-input [formGroup]="range" [rangePicker]="picker">
          <input matStartDate formControlName="from" placeholder="Von" />
          <input matEndDate formControlName="to" placeholder="Bis" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-date-range-picker #picker />
      </mat-form-field>
      <button matButton (click)="load()">
        <mat-icon>refresh</mat-icon>
        Aktualisieren
      </button>
      <button matButton="filled" routerLink="/meine-zeiten/neu">
        <mat-icon>add</mat-icon>
        Zeit nacherfassen
      </button>
      <span class="total">
        Gesamt: <strong>{{ totalSeconds() | duration }}</strong>
      </span>
    </div>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @if (loadError()) {
      <app-load-error [message]="loadError()!" (retry)="load()" />
    }

    <div class="table-scroll">
    <table mat-table [dataSource]="entries()" class="mat-elevation-z1">
      <ng-container matColumnDef="date">
        <th mat-header-cell *matHeaderCellDef>Datum</th>
        <td mat-cell *matCellDef="let e">{{ e.started_at | date: 'dd.MM.yyyy' }}</td>
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
      <ng-container matColumnDef="start">
        <th mat-header-cell *matHeaderCellDef>Start</th>
        <td mat-cell *matCellDef="let e">{{ e.started_at | date: 'HH:mm' }}</td>
      </ng-container>
      <ng-container matColumnDef="end">
        <th mat-header-cell *matHeaderCellDef>Ende</th>
        <td mat-cell *matCellDef="let e">
          {{ e.stopped_at ? (e.stopped_at | date: 'HH:mm') : 'läuft' }}
        </td>
      </ng-container>
      <ng-container matColumnDef="duration">
        <th mat-header-cell *matHeaderCellDef>Dauer (ohne Pausen)</th>
        <td mat-cell *matCellDef="let e">{{ e.duration_seconds | duration }}</td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
    </table>
    </div>

    @if (!loading() && !loadError() && entries().length === 0) {
      <p class="empty">Keine Zeiteinträge im gewählten Zeitraum.</p>
    }
  `,
  styles: `
    .filter-row {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .total {
      margin-left: auto;
      font-size: 14px;
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      background: transparent;
    }
    .empty {
      text-align: center;
      color: var(--hugo-ink-muted);
      padding: 32px;
    }
  `,
})
export class MyEntriesComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrdersService);
  private readonly fleet = inject(FleetService);
  private readonly codes = inject(CommissionCodesService);
  private readonly fb = inject(FormBuilder);

  readonly columns = ['date', 'order', 'vehicle', 'code', 'start', 'end', 'duration'];
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly entries = signal<TimeEntry[]>([]);

  readonly range = this.fb.group({
    from: [startOfWeek(new Date(), { weekStartsOn: 1 })],
    to: [new Date()],
  });

  readonly totalSeconds = computed(() =>
    this.entries().reduce((sum, e) => sum + (e.duration_seconds ?? 0), 0),
  );

  constructor() {
    void this.orders.load();
    void this.fleet.load();
    void this.codes.load();
    void this.load();
  }

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      return;
    }
    const { from, to } = this.range.getRawValue();
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const { data, error } = await this.supabase
        .from('time_entries')
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'cancelled')
        .gte('started_at', startOfDay(from ?? new Date()).toISOString())
        .lte('started_at', endOfDay(to ?? new Date()).toISOString())
        .order('started_at', { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      this.entries.set((data ?? []) as TimeEntry[]);
    } catch (err) {
      this.loadError.set('Zeiteinträge konnten nicht geladen werden: ' + (err as Error).message);
    } finally {
      this.loading.set(false);
    }
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
}
