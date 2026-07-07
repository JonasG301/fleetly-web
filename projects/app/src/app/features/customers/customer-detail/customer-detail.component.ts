import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { ORDER_STATUS_LABELS } from '../../../core/models/order.model';
import { LicensePlateComponent } from '../../../shared/components/license-plate/license-plate.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { FleetService } from '../../fleet/fleet.service';
import { OrdersService } from '../../orders/orders.service';
import { CustomerFormComponent } from '../customer-form/customer-form.component';
import { CustomersService } from '../customers.service';

/** Kunden-Detail: Kontakt, Fuhrpark und Aufträge (optional je Fahrzeug filterbar). */
@Component({
  selector: 'app-customer-detail',
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatFormFieldModule,
    MatSelectModule,
    PageHeaderComponent,
    LicensePlateComponent,
  ],
  template: `
    @if (customer(); as c) {
      <app-page-header [title]="c.company_name" [subtitle]="c.is_active ? undefined : 'Inaktiv'">
        <button matButton="filled" (click)="edit()">
          <mat-icon>edit</mat-icon>
          Bearbeiten
        </button>
      </app-page-header>

      <div class="detail-grid">
        <mat-card>
          <mat-card-header>
            <mat-card-title>Kontakt</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <dl>
              <dt>Ansprechpartner</dt>
              <dd>{{ c.contact_name ?? '–' }}</dd>
              <dt>Telefon</dt>
              <dd>{{ c.phone ?? '–' }}</dd>
              <dt>E-Mail</dt>
              <dd>{{ c.email ?? '–' }}</dd>
              <dt>Adresse</dt>
              <dd>{{ c.address ?? '–' }}</dd>
            </dl>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Fuhrpark ({{ vehicles().length }})</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (vehicles().length === 0) {
              <p class="empty">Kein Fuhrpark hinterlegt.</p>
            }
            <mat-list>
              @for (v of vehicles(); track v.id) {
                <a [routerLink]="['/fuhrpark', v.id]" class="vehicle-row">
                  <mat-list-item lines="2">
                    <app-license-plate matListItemIcon [plate]="v.plate" size="sm" />
                    <span matListItemTitle>{{ v.make }} {{ v.model }}</span>
                    <span matListItemLine>{{ v.internal_name ?? '–' }}</span>
                  </mat-list-item>
                </a>
              }
            </mat-list>
          </mat-card-content>
        </mat-card>

        <mat-card class="orders-card">
          <mat-card-header>
            <mat-card-title>Aufträge ({{ filteredOrders().length }})</mat-card-title>
            @if (vehicles().length > 0) {
              <mat-form-field appearance="outline" class="vehicle-filter">
                <mat-label>Fahrzeug</mat-label>
                <mat-select [value]="vehicleFilter()" (valueChange)="vehicleFilter.set($event)">
                  <mat-option [value]="null">Alle</mat-option>
                  @for (v of vehicles(); track v.id) {
                    <mat-option [value]="v.id">{{ v.plate }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
          </mat-card-header>
          <mat-card-content>
            @if (filteredOrders().length === 0) {
              <p class="empty">Keine Aufträge gefunden.</p>
            }
            <mat-list>
              @for (o of filteredOrders(); track o.id) {
                <a [routerLink]="['/auftraege', o.id]" class="row-link">
                  <mat-list-item lines="3">
                    <mat-icon matListItemIcon>assignment</mat-icon>
                    <span matListItemTitle>{{ o.order_number }} — {{ o.description ?? '–' }}</span>
                    <span matListItemLine>
                      {{ o.start_date ? (o.start_date | date: 'dd.MM.yy') : '–' }} –
                      {{ o.end_date ? (o.end_date | date: 'dd.MM.yy') : 'offen' }}
                      @if (plates(o)) {
                        · {{ plates(o) }}
                      }
                      · <span class="status-badge" [class]="'status-' + o.status">{{
                        statusLabels[o.status]
                      }}</span>
                    </span>
                  </mat-list-item>
                </a>
              }
            </mat-list>
          </mat-card-content>
        </mat-card>
      </div>
    }
  `,
  styles: `
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .orders-card {
      grid-column: 1 / -1;
    }
    mat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .vehicle-filter {
      min-width: 160px;
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 16px;
      margin: 12px 0 0;
    }
    dt {
      color: var(--hugo-ink-muted);
      font-size: 13px;
    }
    dd {
      margin: 0;
      font-size: 14px;
    }
    .vehicle-row,
    .row-link {
      color: inherit;
      text-decoration: none;
    }
    .status-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 1px 8px;
      border-radius: 10px;
    }
    .status-open {
      background: color-mix(in srgb, var(--hugo-status-unknown) 18%, var(--hugo-paper));
      color: var(--hugo-status-unknown);
    }
    .status-in_progress {
      background: color-mix(in srgb, var(--hugo-status-warn) 18%, var(--hugo-paper));
      color: var(--hugo-status-warn);
    }
    .status-done {
      background: color-mix(in srgb, var(--hugo-status-ok) 18%, var(--hugo-paper));
      color: var(--hugo-status-ok);
    }
    .empty {
      color: var(--hugo-ink-muted);
      font-size: 13px;
    }
  `,
})
export class CustomerDetailComponent {
  private readonly customersService = inject(CustomersService);
  private readonly fleet = inject(FleetService);
  private readonly ordersService = inject(OrdersService);
  private readonly dialog = inject(MatDialog);

  readonly id = input.required<string>();

  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly vehicleFilter = signal<string | null>(null);

  readonly customer = computed(() => this.customersService.byId(this.id()));
  readonly vehicles = computed(() =>
    this.fleet.vehicles().filter((v) => v.customer_id === this.id()),
  );
  readonly orders = computed(() =>
    this.ordersService.orders().filter((o) => o.customer_id === this.id()),
  );
  readonly filteredOrders = computed(() => {
    const vehicleId = this.vehicleFilter();
    if (!vehicleId) {
      return this.orders();
    }
    return this.orders().filter((o) => o.vehicle_ids.includes(vehicleId));
  });

  constructor() {
    void this.customersService.load();
    void this.fleet.load();
    void this.ordersService.load();
  }

  plates(o: { vehicle_ids: string[] }): string {
    return o.vehicle_ids.map((id) => this.fleet.byId(id)?.plate ?? '?').join(', ');
  }

  edit(): void {
    const c = this.customer();
    if (!c) {
      return;
    }
    this.dialog.open(CustomerFormComponent, { data: c, disableClose: true });
  }
}
