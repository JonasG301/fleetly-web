import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from 'auth';
import { ORDER_STATUS_LABELS, OrderStatus } from '../../../core/models/order.model';
import { confirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LoadErrorComponent } from '../../../shared/components/load-error/load-error.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CustomersService } from '../../customers/customers.service';
import { FleetService } from '../../fleet/fleet.service';
import { OrderWithVehicles, OrdersService } from '../orders.service';
import { OrderFormComponent } from '../order-form/order-form.component';
import { OrderPipelineComponent } from '../order-pipeline/order-pipeline.component';

<<<<<<< HEAD
const VIEW_STORAGE_KEY = 'fleetly.orders.view';

=======
>>>>>>> origin/master
/** Auftragsübersicht mit Filtern nach Kunde/Status und Suche (US-09). */
@Component({
  selector: 'app-order-list',
  imports: [
    DatePipe,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatMenuModule,
    MatProgressBarModule,
    MatButtonToggleModule,
    PageHeaderComponent,
    LoadErrorComponent,
    OrderPipelineComponent,
  ],
  template: `
    <app-page-header title="Auftragsverwaltung" subtitle="Aufträge je Kunde und Fahrzeug">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="view()"
        (change)="setView($event.value)"
        aria-label="Ansicht"
      >
        <mat-button-toggle value="table" aria-label="Tabelle">
          <mat-icon>table_rows</mat-icon>
        </mat-button-toggle>
        <mat-button-toggle value="pipeline" aria-label="Pipeline">
          <mat-icon>view_kanban</mat-icon>
        </mat-button-toggle>
      </mat-button-toggle-group>
      @if (auth.isAdmin()) {
        <button matButton="filled" (click)="openForm(null)">
          <mat-icon>add</mat-icon>
          Neuer Auftrag
        </button>
      }
    </app-page-header>

    <div class="filter-row">
      <mat-form-field appearance="outline">
        <mat-label>Suche (Nummer oder Beschreibung)</mat-label>
        <input matInput [value]="search()" (input)="search.set($any($event.target).value)" />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Kunde</mat-label>
        <mat-select [value]="customerFilter()" (valueChange)="customerFilter.set($event)">
          <mat-option [value]="null">Alle</mat-option>
          @for (c of customers.customers(); track c.id) {
            <mat-option [value]="c.id">{{ c.company_name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Status</mat-label>
        <mat-select [value]="statusFilter()" (valueChange)="statusFilter.set($event)">
          <mat-option [value]="null">Alle</mat-option>
          @for (s of statuses; track s) {
            <mat-option [value]="s">{{ statusLabels[s] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (service.loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @if (loadError()) {
      <app-load-error [message]="loadError()!" (retry)="load()" />
    }

    @if (view() === 'pipeline') {
      <app-order-pipeline [orders]="filtered()" (cardClick)="onCardClick($event)" />
    } @else {
    <div class="table-scroll">
    <table mat-table [dataSource]="filtered()" class="mat-elevation-z1">
      <ng-container matColumnDef="order_number">
        <th mat-header-cell *matHeaderCellDef>Nummer</th>
        <td mat-cell *matCellDef="let o" class="order-number">{{ o.order_number }}</td>
      </ng-container>
      <ng-container matColumnDef="customer">
        <th mat-header-cell *matHeaderCellDef>Kunde</th>
        <td mat-cell *matCellDef="let o">{{ customerName(o) }}</td>
      </ng-container>
      <ng-container matColumnDef="description">
        <th mat-header-cell *matHeaderCellDef>Beschreibung</th>
        <td mat-cell *matCellDef="let o">{{ o.description ?? '–' }}</td>
      </ng-container>
      <ng-container matColumnDef="vehicles">
        <th mat-header-cell *matHeaderCellDef>Fahrzeuge</th>
        <td mat-cell *matCellDef="let o">{{ plates(o) }}</td>
      </ng-container>
      <ng-container matColumnDef="dates">
        <th mat-header-cell *matHeaderCellDef>Zeitraum</th>
        <td mat-cell *matCellDef="let o">
          {{ o.start_date ? (o.start_date | date: 'dd.MM.yy') : '–' }} –
          {{ o.end_date ? (o.end_date | date: 'dd.MM.yy') : 'offen' }}
        </td>
      </ng-container>
      <ng-container matColumnDef="status">
        <th mat-header-cell *matHeaderCellDef>Status</th>
        <td mat-cell *matCellDef="let o">
          <span class="status-badge" [class]="'status-' + o.status">{{ statusLabel(o) }}</span>
        </td>
      </ng-container>
      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef></th>
        <td mat-cell *matCellDef="let o" class="actions">
          @if (auth.isAdmin()) {
            <button matIconButton (click)="edit(o)" aria-label="Bearbeiten">
              <mat-icon>edit</mat-icon>
            </button>
          }
        </td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
    </table>
    </div>
    }

    @if (!service.loading() && !loadError() && filtered().length === 0) {
      <p class="empty">Keine Aufträge gefunden.</p>
    }
  `,
  styles: `
    .filter-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .filter-row > * {
      min-width: 200px;
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      background: white;
    }
    .order-number {
      font-weight: 600;
    }
    .status-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: 12px;
    }
    .status-open {
      background: #e3f2fd;
      color: #1565c0;
    }
    .status-in_progress {
      background: #fff3e0;
      color: #e65100;
    }
    .status-done {
      background: #e8f5e9;
      color: #2e7d32;
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
export class OrderListComponent {
  readonly service = inject(OrdersService);
  readonly customers = inject(CustomersService);
  readonly auth = inject(AuthService);
  private readonly fleet = inject(FleetService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly columns = ['order_number', 'customer', 'description', 'vehicles', 'dates', 'status', 'actions'];
  readonly statuses: OrderStatus[] = ['open', 'in_progress', 'done'];
  readonly statusLabels = ORDER_STATUS_LABELS;

  readonly search = signal('');
  readonly customerFilter = signal<string | null>(null);
  readonly statusFilter = signal<OrderStatus | null>(null);
  readonly loadError = signal<string | null>(null);

<<<<<<< HEAD
  /** Ansicht (Tabelle oder Pipeline), Wahl überlebt den Reload (US-09). */
  readonly view = signal<'table' | 'pipeline'>(
    localStorage.getItem(VIEW_STORAGE_KEY) === 'pipeline' ? 'pipeline' : 'table',
  );

=======
>>>>>>> origin/master
  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const customer = this.customerFilter();
    const status = this.statusFilter();
    return this.service
      .orders()
      .filter((o) => !customer || o.customer_id === customer)
      .filter((o) => !status || o.status === status)
      .filter(
        (o) =>
          !term ||
          o.order_number.toLowerCase().includes(term) ||
          (o.description ?? '').toLowerCase().includes(term),
      );
  });

  constructor() {
    void this.load();
    void this.customers.load();
    void this.fleet.load();
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.service.load();
    } catch (err) {
      this.loadError.set('Aufträge konnten nicht geladen werden: ' + (err as Error).message);
    }
  }

  customerName(o: OrderWithVehicles): string {
    return (
      this.customers.customers().find((c) => c.id === o.customer_id)?.company_name ?? '–'
    );
  }

  plates(o: OrderWithVehicles): string {
    return o.vehicle_ids
      .map((id) => this.fleet.byId(id)?.plate ?? '?')
      .join(', ');
  }

  statusLabel(o: OrderWithVehicles): string {
    return ORDER_STATUS_LABELS[o.status];
  }

  /** Abgeschlossene Aufträge sind schreibgeschützt — Admin kann entsperren (US-09). */
  async edit(order: OrderWithVehicles): Promise<void> {
    if (order.status === 'done') {
      const unlock = await confirmDialog(this.dialog, {
        title: 'Auftrag abgeschlossen',
        message: `Auftrag ${order.order_number} ist abgeschlossen und schreibgeschützt. Zum Bearbeiten entsperren?`,
        confirmLabel: 'Entsperren',
      });
      if (!unlock) {
        return;
      }
      await this.service.setStatus(order.id, 'in_progress');
      this.snackBar.open('Auftrag entsperrt (Status: In Bearbeitung)', undefined, {
        duration: 3000,
      });
      const reloaded = this.service.byId(order.id);
      this.dialog.open(OrderFormComponent, { data: reloaded ?? order });
      return;
    }
    this.openForm(order);
  }

<<<<<<< HEAD
  setView(view: 'table' | 'pipeline'): void {
    this.view.set(view);
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }

  onCardClick(order: OrderWithVehicles): void {
    if (this.auth.isAdmin()) {
      void this.edit(order);
    }
  }

=======
>>>>>>> origin/master
  openForm(order: OrderWithVehicles | null): void {
    this.dialog.open(OrderFormComponent, { data: order });
  }
}
