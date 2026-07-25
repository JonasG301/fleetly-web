import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { AuthService } from 'auth';
import { Customer } from '../../../core/models/customer.model';
import { Vehicle } from '../../../core/models/vehicle.model';
import { LoadErrorComponent } from '../../../shared/components/load-error/load-error.component';
import { LicensePlateComponent } from '../../../shared/components/license-plate/license-plate.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TuvStatusChipComponent } from '../../../shared/components/status-chip/tuv-status-chip.component';
import { CustomersService } from '../../customers/customers.service';
import { TuvInfo, tuvInfoForVehicle } from '../tuv-status/tuv.utils';
import { FleetService } from '../fleet.service';

interface VehicleRow extends Vehicle {
  tuvInfo: TuvInfo;
  customerName: string | null;
}

/** Fahrzeugliste mit Tabs „Eigener Fuhrpark | Kundenfahrzeuge" und HU-Spalte (US-06, US-07). */
@Component({
  selector: 'app-vehicle-list',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    PageHeaderComponent,
    TuvStatusChipComponent,
    LicensePlateComponent,
    LoadErrorComponent,
  ],
  template: `
    <app-page-header title="Fuhrpark" subtitle="Fahrzeuge verwalten und HU im Blick behalten">
      <button matButton routerLink="/fuhrpark/tuv">
        <mat-icon>verified</mat-icon>
        HU-Status
      </button>
      @if (auth.isAdmin()) {
        <button matButton="filled" routerLink="/fuhrpark/neu">
          <mat-icon>add</mat-icon>
          Neues Fahrzeug
        </button>
      }
    </app-page-header>

    <div class="stat-row">
      <div class="stat">
        <span class="stat-value hugo-stat">{{ ownRows().length }}</span>
        <span class="stat-label">Eigener Fuhrpark</span>
      </div>
      <div class="stat">
        <span class="stat-value hugo-stat">{{ customerRows().length }}</span>
        <span class="stat-label">Kundenfahrzeuge</span>
      </div>
      <div class="stat" [class.alert]="dueCount() > 0">
        <span class="stat-value hugo-stat">{{ dueCount() }}</span>
        <span class="stat-label">HU fällig (≤30 Tage)</span>
      </div>
    </div>

    <div class="filter-row">
      <mat-form-field appearance="outline" class="search">
        <mat-label>Suche (Kennzeichen oder Bezeichnung)</mat-label>
        <input matInput [value]="search()" (input)="search.set($any($event.target).value)" />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>
      <mat-button-toggle-group
        [value]="statusFilter()"
        (change)="statusFilter.set($event.value)"
        aria-label="Statusfilter"
      >
        <mat-button-toggle value="active">Aktiv</mat-button-toggle>
        <mat-button-toggle value="inactive">Inaktiv</mat-button-toggle>
        <mat-button-toggle value="all">Alle</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    @if (fleet.loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @if (loadError()) {
      <app-load-error [message]="loadError()!" (retry)="load()" />
    }

    <mat-tab-group [selectedIndex]="tabIndex()" (selectedIndexChange)="tabIndex.set($event)">
      <mat-tab label="Eigener Fuhrpark ({{ ownRows().length }})">
        <ng-container *ngTemplateOutlet="table; context: { rows: ownRows(), showCustomer: false }" />
      </mat-tab>
      <mat-tab label="Kundenfahrzeuge ({{ customerRows().length }})">
        <ng-container *ngTemplateOutlet="table; context: { rows: customerRows(), showCustomer: true }" />
      </mat-tab>
    </mat-tab-group>

    <ng-template #table let-rows="rows" let-showCustomer="showCustomer">
      <div class="table-scroll">
      <table mat-table [dataSource]="rows" class="mat-elevation-z1">
        <ng-container matColumnDef="plate">
          <th mat-header-cell *matHeaderCellDef>Kennzeichen</th>
          <td mat-cell *matCellDef="let v">
            <a [routerLink]="['/fuhrpark', v.id]" class="plate-link">
              <app-license-plate [plate]="v.plate" size="sm" />
            </a>
            @if (!v.is_active) {
              <span class="inactive">inaktiv</span>
            }
          </td>
        </ng-container>
        <ng-container matColumnDef="vehicle">
          <th mat-header-cell *matHeaderCellDef>Fahrzeug</th>
          <td mat-cell *matCellDef="let v">
            {{ v.make }} {{ v.model }}
            @if (v.internal_name) {
              <span class="internal">({{ v.internal_name }})</span>
            }
          </td>
        </ng-container>
        <ng-container matColumnDef="customer">
          <th mat-header-cell *matHeaderCellDef>Kunde</th>
          <td mat-cell *matCellDef="let v">{{ v.customerName ?? '–' }}</td>
        </ng-container>
        <ng-container matColumnDef="tuv">
          <th mat-header-cell *matHeaderCellDef>HU</th>
          <td mat-cell *matCellDef="let v">
            <app-tuv-status-chip [info]="v.tuvInfo" />
          </td>
        </ng-container>
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let v" class="actions">
            @if (auth.isAdmin()) {
              <button matIconButton [routerLink]="['/fuhrpark', v.id, 'bearbeiten']" aria-label="Bearbeiten">
                <mat-icon>edit</mat-icon>
              </button>
            }
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="showCustomer ? columnsWithCustomer : columns"></tr>
        <tr mat-row *matRowDef="let row; columns: showCustomer ? columnsWithCustomer : columns"></tr>
      </table>
      </div>
      @if (rows.length === 0 && !fleet.loading() && !loadError()) {
        <p class="empty">Keine Fahrzeuge gefunden.</p>
      }
    </ng-template>
  `,
  styles: `
    .stat-row {
      display: flex;
      gap: 32px;
      flex-wrap: wrap;
      margin: 4px 0 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--hugo-hairline);
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .stat-label {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: var(--hugo-ink-muted);
    }
    .stat.alert .stat-value {
      color: var(--hugo-status-critical);
    }
    .filter-row {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .search {
      width: 100%;
      max-width: 360px;
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      background: transparent;
    }
    ::ng-deep table .mat-mdc-header-row,
    ::ng-deep table .mat-mdc-row {
      border-bottom-color: var(--hugo-hairline);
    }
    .plate-link {
      display: inline-flex;
      text-decoration: none;
    }
    .internal {
      color: var(--hugo-ink-muted);
      font-size: 13px;
    }
    .inactive {
      font-size: 11px;
      color: var(--hugo-ink-muted);
      border: 1px solid var(--hugo-hairline);
      border-radius: var(--hugo-radius-control);
      padding: 1px 6px;
      margin-left: 6px;
    }
    .actions {
      text-align: right;
    }
    .empty {
      text-align: center;
      color: var(--hugo-ink-muted);
      padding: 32px;
    }
  `,
})
export class VehicleListComponent {
  readonly fleet = inject(FleetService);
  readonly auth = inject(AuthService);
  private readonly customersService = inject(CustomersService);

  readonly columns = ['plate', 'vehicle', 'tuv', 'actions'];
  readonly columnsWithCustomer = ['plate', 'vehicle', 'customer', 'tuv', 'actions'];

  readonly search = signal('');
  readonly statusFilter = signal<'active' | 'inactive' | 'all'>('active');
  readonly tabIndex = signal(0);
  readonly loadError = signal<string | null>(null);

  private readonly customersById = computed(() => {
    const map = new Map<string, Customer>();
    for (const c of this.customersService.customers()) {
      map.set(c.id, c);
    }
    return map;
  });

  readonly ownRows = computed(() => this.toRows(this.fleet.ownFleet()));
  readonly customerRows = computed(() => this.toRows(this.fleet.customerVehicles()));
  readonly dueCount = computed(
    () =>
      [...this.ownRows(), ...this.customerRows()].filter((v) =>
        v.tuvInfo.status === 'expired' || v.tuvInfo.status === 'due_7' || v.tuvInfo.status === 'due_30',
      ).length,
  );

  constructor() {
    void this.load();
    void this.customersService.load();
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.fleet.load();
    } catch (err) {
      this.loadError.set('Fahrzeuge konnten nicht geladen werden: ' + (err as Error).message);
    }
  }

  private toRows(vehicles: Vehicle[]): VehicleRow[] {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    return vehicles
      .filter((v) => status === 'all' || v.is_active === (status === 'active'))
      .filter(
        (v) =>
          !term ||
          (v.plate ?? '').toLowerCase().includes(term) ||
          (v.internal_name ?? '').toLowerCase().includes(term) ||
          `${v.make} ${v.model}`.toLowerCase().includes(term),
      )
      .map((v) => ({
        ...v,
        tuvInfo: tuvInfoForVehicle(v),
        customerName: v.customer_id
          ? (this.customersById().get(v.customer_id)?.company_name ?? null)
          : null,
      }));
  }
}
