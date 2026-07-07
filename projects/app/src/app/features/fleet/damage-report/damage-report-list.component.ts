import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from 'auth';
import {
  DAMAGE_STATUS_LABELS,
  DamageReport,
  DamageStatus,
} from '../../../core/models/damage-report.model';
import { LoadErrorComponent } from '../../../shared/components/load-error/load-error.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { FleetService } from '../fleet.service';
import { DamageReportPhotosDialogComponent } from './damage-report-photos-dialog.component';
import { DamageReportService } from './damage-report.service';

@Component({
  selector: 'app-damage-report-list',
  imports: [
    DatePipe,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    PageHeaderComponent,
    LoadErrorComponent,
  ],
  template: `
    <app-page-header title="Schadensmeldungen" subtitle="Gemeldete Schäden am Fuhrpark">
      <button matButton="filled" routerLink="/schaeden/neu">
        <mat-icon>add</mat-icon>
        Schaden melden
      </button>
    </app-page-header>

    <div class="stats">
      <mat-card class="stat open">
        <span class="count">{{ stats().open }}</span>
        <span>Offen</span>
      </mat-card>
      <mat-card class="stat in_repair">
        <span class="count">{{ stats().in_repair }}</span>
        <span>In Reparatur</span>
      </mat-card>
      <mat-card class="stat resolved">
        <span class="count">{{ stats().resolved }}</span>
        <span>Erledigt</span>
      </mat-card>
      <mat-card class="stat total">
        <span class="count">{{ stats().total }}</span>
        <span>Gesamt</span>
      </mat-card>
    </div>

    @if (topVehicles().length > 0) {
      <mat-card class="by-vehicle">
        <span class="by-vehicle-title">Meiste Schäden je Fahrzeug</span>
        @for (row of topVehicles(); track row.plate) {
          <div class="bar-row">
            <span class="bar-label">{{ row.plate }}</span>
            <span class="bar-track">
              <span class="bar-fill" [style.width.%]="row.percent"></span>
            </span>
            <span class="bar-value">{{ row.count }}</span>
          </div>
        }
      </mat-card>
    }

    <mat-button-toggle-group
      [value]="statusFilter()"
      (change)="statusFilter.set($event.value)"
      aria-label="Statusfilter"
    >
      <mat-button-toggle value="open">Offen</mat-button-toggle>
      <mat-button-toggle value="in_repair">In Reparatur</mat-button-toggle>
      <mat-button-toggle value="resolved">Erledigt</mat-button-toggle>
      <mat-button-toggle value="all">Alle</mat-button-toggle>
    </mat-button-toggle-group>

    @if (service.loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @if (loadError()) {
      <app-load-error [message]="loadError()!" (retry)="load()" />
    }

    <div class="table-scroll">
    <table mat-table [dataSource]="filtered()" class="mat-elevation-z1">
      <ng-container matColumnDef="damage_date">
        <th mat-header-cell *matHeaderCellDef>Datum</th>
        <td mat-cell *matCellDef="let d">{{ d.damage_date | date: 'dd.MM.yyyy' }}</td>
      </ng-container>
      <ng-container matColumnDef="vehicle">
        <th mat-header-cell *matHeaderCellDef>Fahrzeug</th>
        <td mat-cell *matCellDef="let d">{{ plateOf(d) }}</td>
      </ng-container>
      <ng-container matColumnDef="description">
        <th mat-header-cell *matHeaderCellDef>Beschreibung</th>
        <td mat-cell *matCellDef="let d">{{ d.description }}</td>
      </ng-container>
      <ng-container matColumnDef="location">
        <th mat-header-cell *matHeaderCellDef>Ort</th>
        <td mat-cell *matCellDef="let d">{{ d.location || '–' }}</td>
      </ng-container>
      <ng-container matColumnDef="reporter">
        <th mat-header-cell *matHeaderCellDef>Gemeldet von</th>
        <td mat-cell *matCellDef="let d">{{ d.reporter_name }}</td>
      </ng-container>
      <ng-container matColumnDef="status">
        <th mat-header-cell *matHeaderCellDef>Status</th>
        <td mat-cell *matCellDef="let d">
          @if (auth.isAdmin()) {
            <button matButton [matMenuTriggerFor]="statusMenu" class="status-btn">
              {{ statusLabel(d) }}
              <mat-icon>arrow_drop_down</mat-icon>
            </button>
            <mat-menu #statusMenu="matMenu">
              @for (s of statuses; track s) {
                <button mat-menu-item (click)="service.setStatus(d.id, s)">
                  {{ statusLabels[s] }}
                </button>
              }
            </mat-menu>
          } @else {
            {{ statusLabel(d) }}
          }
        </td>
      </ng-container>
      <ng-container matColumnDef="photos">
        <th mat-header-cell *matHeaderCellDef>Fotos</th>
        <td mat-cell *matCellDef="let d">
          <button matIconButton type="button" (click)="openPhotos(d)" aria-label="Fotos ansehen">
            <mat-icon>photo_camera</mat-icon>
          </button>
        </td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
    </table>
    </div>

    @if (!service.loading() && !loadError() && filtered().length === 0) {
      <p class="empty">Keine Schadensmeldungen in dieser Ansicht.</p>
    }
  `,
  styles: `
    .stats {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin: 16px 0;
    }
    .stat {
      padding: 12px 20px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
      color: var(--hugo-ink-muted);
      min-width: 110px;
    }
    .stat .count {
      font-size: 24px;
      font-weight: 700;
    }
    .stat.open .count { color: var(--hugo-status-critical); }
    .stat.in_repair .count { color: var(--hugo-status-warn); }
    .stat.resolved .count { color: var(--hugo-status-ok); }
    .stat.total .count { color: var(--hugo-ink); }
    .by-vehicle {
      padding: 16px 20px;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .by-vehicle-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--hugo-ink-muted);
      margin-bottom: 4px;
    }
    .bar-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .bar-label {
      width: 110px;
      font-size: 13px;
      font-weight: 600;
    }
    .bar-track {
      flex: 1;
      height: 14px;
      background: color-mix(in srgb, var(--hugo-ink) 8%, var(--hugo-paper));
      border-radius: 7px;
      overflow: hidden;
    }
    .bar-fill {
      display: block;
      height: 100%;
      background: var(--hugo-status-critical);
      border-radius: 7px;
    }
    .bar-value {
      width: 28px;
      text-align: right;
      font-size: 13px;
      font-weight: 600;
    }
    .table-scroll {
      overflow-x: auto;
      margin-top: 16px;
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
    .status-btn {
      font-size: 13px;
    }
  `,
})
export class DamageReportListComponent {
  readonly service = inject(DamageReportService);
  readonly auth = inject(AuthService);
  private readonly fleet = inject(FleetService);
  private readonly dialog = inject(MatDialog);

  readonly columns = [
    'damage_date',
    'vehicle',
    'description',
    'location',
    'reporter',
    'status',
    'photos',
  ];
  readonly statuses: DamageStatus[] = ['open', 'in_repair', 'resolved'];
  readonly statusLabels = DAMAGE_STATUS_LABELS;
  readonly statusFilter = signal<DamageStatus | 'all'>('open');
  readonly loadError = signal<string | null>(null);

  readonly filtered = computed(() => {
    const f = this.statusFilter();
    const all = this.service.reports();
    return f === 'all' ? all : all.filter((d) => d.status === f);
  });

  /** Zähler je Status für die Statistik-Karten. */
  readonly stats = computed(() => {
    const all = this.service.reports();
    return {
      open: all.filter((d) => d.status === 'open').length,
      in_repair: all.filter((d) => d.status === 'in_repair').length,
      resolved: all.filter((d) => d.status === 'resolved').length,
      total: all.length,
    };
  });

  /** Fahrzeuge mit den meisten Schäden (Top 5), für die Balkenansicht. */
  readonly topVehicles = computed(() => {
    const counts = new Map<string, number>();
    for (const d of this.service.reports()) {
      const plate = this.fleet.byId(d.vehicle_id)?.plate ?? 'Unbekannt';
      counts.set(plate, (counts.get(plate) ?? 0) + 1);
    }
    const rows = [...counts.entries()].map(([plate, count]) => ({ plate, count }));
    rows.sort((a, b) => b.count - a.count);
    const max = rows.length ? rows[0].count : 1;
    return rows.slice(0, 5).map((r) => ({ ...r, percent: Math.round((r.count / max) * 100) }));
  });

  constructor() {
    void this.load();
    void this.fleet.load();
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.service.load();
    } catch (err) {
      this.loadError.set(
        'Schadensmeldungen konnten nicht geladen werden: ' + (err as Error).message,
      );
    }
  }

  plateOf(d: DamageReport): string {
    return this.fleet.byId(d.vehicle_id)?.plate ?? '–';
  }

  statusLabel(d: DamageReport): string {
    return DAMAGE_STATUS_LABELS[d.status];
  }

  openPhotos(d: DamageReport): void {
    this.dialog.open(DamageReportPhotosDialogComponent, { data: d });
  }
}
