import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { Vehicle } from '../../../core/models/vehicle.model';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TuvStatusChipComponent } from '../../../shared/components/status-chip/tuv-status-chip.component';
import { FleetService } from '../fleet.service';
import { TuvInfo, calcTuvInfo, tuvSortKey } from './tuv.utils';

interface TuvRow {
  vehicle: Vehicle;
  info: TuvInfo;
}

/** TÜV-Übersicht: alle aktiven Fahrzeuge nach Fälligkeit sortiert, mit Ampel-Statistik. */
@Component({
  selector: 'app-tuv-status',
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatProgressBarModule,
    PageHeaderComponent,
    TuvStatusChipComponent,
  ],
  template: `
    <app-page-header title="TÜV-Status" subtitle="Hauptuntersuchungen aller aktiven Fahrzeuge" />

    <div class="stats">
      <mat-card class="stat expired">
        <span class="count">{{ stats().expired }}</span>
        <span>Abgelaufen</span>
      </mat-card>
      <mat-card class="stat due7">
        <span class="count">{{ stats().due7 }}</span>
        <span>≤ 7 Tage</span>
      </mat-card>
      <mat-card class="stat due30">
        <span class="count">{{ stats().due30 }}</span>
        <span>≤ 30 Tage</span>
      </mat-card>
      <mat-card class="stat valid">
        <span class="count">{{ stats().valid }}</span>
        <span>Gültig</span>
      </mat-card>
    </div>

    @if (fleet.loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <table mat-table [dataSource]="rows()" class="mat-elevation-z1">
      <ng-container matColumnDef="status">
        <th mat-header-cell *matHeaderCellDef>Status</th>
        <td mat-cell *matCellDef="let r">
          <app-tuv-status-chip [info]="r.info" />
        </td>
      </ng-container>
      <ng-container matColumnDef="plate">
        <th mat-header-cell *matHeaderCellDef>Kennzeichen</th>
        <td mat-cell *matCellDef="let r">
          <a [routerLink]="['/fuhrpark', r.vehicle.id]" class="plate-link">{{ r.vehicle.plate }}</a>
        </td>
      </ng-container>
      <ng-container matColumnDef="vehicle">
        <th mat-header-cell *matHeaderCellDef>Fahrzeug</th>
        <td mat-cell *matCellDef="let r">{{ r.vehicle.make }} {{ r.vehicle.model }}</td>
      </ng-container>
      <ng-container matColumnDef="lastTuv">
        <th mat-header-cell *matHeaderCellDef>Letzte HU</th>
        <td mat-cell *matCellDef="let r">
          {{ r.vehicle.tuv_date ? (r.vehicle.tuv_date | date: 'dd.MM.yyyy') : '–' }}
        </td>
      </ng-container>
      <ng-container matColumnDef="interval">
        <th mat-header-cell *matHeaderCellDef>Intervall</th>
        <td mat-cell *matCellDef="let r">
          {{ r.vehicle.is_faster_than_40kmh ? '1 Jahr' : '2 Jahre' }}
        </td>
      </ng-container>
      <ng-container matColumnDef="dueMonth">
        <th mat-header-cell *matHeaderCellDef>Fälligkeitsmonat</th>
        <td mat-cell *matCellDef="let r">{{ r.info.dueMonthLabel ?? '–' }}</td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
    </table>
  `,
  styles: `
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
      gap: 4px;
    }
    .count {
      font-size: 32px;
      font-weight: 700;
    }
    .expired .count { color: #c62828; }
    .due7 .count { color: #e65100; }
    .due30 .count { color: #f9a825; }
    .valid .count { color: #2e7d32; }
    table {
      width: 100%;
      background: white;
    }
    .plate-link {
      font-weight: 600;
      color: #35683a;
      text-decoration: none;
    }
  `,
})
export class TuvStatusComponent {
  readonly fleet = inject(FleetService);

  readonly columns = ['status', 'plate', 'vehicle', 'lastTuv', 'interval', 'dueMonth'];

  readonly rows = computed<TuvRow[]>(() =>
    this.fleet
      .vehicles()
      .filter((v) => v.is_active)
      .map((vehicle) => ({
        vehicle,
        info: calcTuvInfo(vehicle.tuv_date, vehicle.is_faster_than_40kmh),
      }))
      .sort((a, b) => tuvSortKey(a.info) - tuvSortKey(b.info)),
  );

  readonly stats = computed(() => {
    const rows = this.rows();
    return {
      expired: rows.filter((r) => r.info.status === 'expired').length,
      due7: rows.filter((r) => r.info.status === 'due_7').length,
      due30: rows.filter((r) => r.info.status === 'due_30').length,
      valid: rows.filter((r) => r.info.status === 'valid').length,
    };
  });

  constructor() {
    void this.fleet.load();
  }
}
