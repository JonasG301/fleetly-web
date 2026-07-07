import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'auth';
import { DAMAGE_STATUS_LABELS, DamageReport } from '../../../core/models/damage-report.model';
import { FUEL_TYPE_LABELS } from '../../../core/models/vehicle.model';
import { ORDER_STATUS_LABELS } from '../../../core/models/order.model';
import { ServiceEntry } from '../../../core/models/service-entry.model';
import { confirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LicensePlateComponent } from '../../../shared/components/license-plate/license-plate.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TuvStatusChipComponent } from '../../../shared/components/status-chip/tuv-status-chip.component';
import { CustomersService } from '../../customers/customers.service';
import { OrdersService } from '../../orders/orders.service';
import { DamageReportPhotosDialogComponent } from '../damage-report/damage-report-photos-dialog.component';
import { DamageReportService } from '../damage-report/damage-report.service';
import { VehicleDamageOverviewComponent } from '../damage-report/vehicle-damage-overview.component';
import { FleetService } from '../fleet.service';
import { ServiceEntryDialogComponent } from '../service-history/service-entry-dialog.component';
import { calcTuvInfo } from '../tuv-status/tuv.utils';

/** Fahrzeug-Detail: Stammdaten, TÜV-Karte, Service-Historie, Schäden. */
@Component({
  selector: 'app-vehicle-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSlideToggleModule,
    PageHeaderComponent,
    TuvStatusChipComponent,
    LicensePlateComponent,
    VehicleDamageOverviewComponent,
  ],
  template: `
    @if (vehicle(); as v) {
      <header class="plate-header">
        <app-license-plate [plate]="v.plate" size="lg" />
      </header>
      <app-page-header [title]="v.make + ' ' + v.model" [subtitle]="v.internal_name ?? undefined">
        @if (auth.isAdmin()) {
          <mat-slide-toggle
            [checked]="v.is_active"
            (change)="fleet.setActive(v.id, $event.checked)"
          >
            Aktiv
          </mat-slide-toggle>
          <button matButton="filled" [routerLink]="['/fuhrpark', v.id, 'bearbeiten']">
            <mat-icon>edit</mat-icon>
            Bearbeiten
          </button>
        }
      </app-page-header>

      <div class="detail-grid">
        <mat-card>
          <mat-card-header>
            <mat-card-title>HU & Prüfungen</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <app-tuv-status-chip [info]="tuvInfo()" />
            <dl>
              <dt>Letzte HU</dt>
              <dd>{{ v.tuv_date ? (v.tuv_date | date: 'dd.MM.yyyy') : '–' }}</dd>
              <dt>Nächste HU fällig</dt>
              <dd>{{ tuvInfo().dueMonthLabel ?? '–' }}</dd>
              <dt>Intervall</dt>
              <dd>{{ v.is_faster_than_40kmh ? '1 Jahr (> 40 km/h)' : '2 Jahre (≤ 40 km/h)' }}</dd>
              <dt>Letzte UVV</dt>
              <dd>{{ v.uvv_date ? (v.uvv_date | date: 'dd.MM.yyyy') : '–' }}</dd>
            </dl>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Stammdaten</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <dl>
              <dt>Zuordnung</dt>
              <dd>{{ customerName() ?? 'Eigener Fuhrpark' }}</dd>
              <dt>Interne Bezeichnung</dt>
              <dd>{{ v.internal_name ?? '–' }}</dd>
              <dt>Baujahr</dt>
              <dd>{{ v.construction_year ?? '–' }}</dd>
              <dt>Betriebsstunden</dt>
              <dd>{{ v.operating_hours !== null ? (v.operating_hours | number) + ' h' : '–' }}</dd>
              <dt>Kilometerstand</dt>
              <dd>{{ v.mileage !== null ? (v.mileage | number) + ' km' : '–' }}</dd>
              <dt>Kraftstoff</dt>
              <dd>{{ v.fuel_type ? fuelLabels[v.fuel_type] : '–' }}</dd>
              <dt>FIN</dt>
              <dd>{{ v.vin ?? '–' }}</dd>
              <dt>Kostenstelle</dt>
              <dd>{{ v.cost_center ?? '–' }}</dd>
              <dt>Leasing-Ende</dt>
              <dd>{{ v.leasing_end ? (v.leasing_end | date: 'dd.MM.yyyy') : '–' }}</dd>
            </dl>
            @if (v.notes) {
              <p class="notes">{{ v.notes }}</p>
            }
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Service-Historie</mat-card-title>
            <button matIconButton (click)="addServiceEntry()" aria-label="Service-Eintrag hinzufügen">
              <mat-icon>add</mat-icon>
            </button>
          </mat-card-header>
          <mat-card-content>
            @if (serviceEntries().length === 0) {
              <p class="empty">Noch keine Service-Einträge.</p>
            }
            <mat-list>
              @for (entry of serviceEntries(); track entry.id) {
                <mat-list-item lines="3">
                  <mat-icon matListItemIcon>build</mat-icon>
                  <span matListItemTitle>
                    {{ entry.service_date | date: 'dd.MM.yyyy' }} — {{ entry.description }}
                  </span>
                  <span matListItemLine>
                    {{ entry.workshop ?? 'Werkstatt unbekannt' }}
                    @if (entry.mileage !== null) {
                      · {{ entry.mileage | number }} km
                    }
                    @if (entry.cost !== null) {
                      · {{ entry.cost | number: '1.2-2' }} €
                    }
                  </span>
                  @if (auth.isAdmin()) {
                    <button
                      matIconButton
                      matListItemMeta
                      (click)="deleteServiceEntry(entry)"
                      aria-label="Service-Eintrag löschen"
                    >
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                </mat-list-item>
              }
            </mat-list>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Aufträge</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (orders().length === 0) {
              <p class="empty">Keine Aufträge für dieses Fahrzeug.</p>
            }
            <mat-list>
              @for (o of orders(); track o.id) {
                <a [routerLink]="['/auftraege', o.id]" class="order-row">
                  <mat-list-item lines="3">
                    <mat-icon matListItemIcon>assignment</mat-icon>
                    <span matListItemTitle>{{ o.order_number }} — {{ o.description ?? '–' }}</span>
                    <span matListItemLine>
                      {{ o.start_date ? (o.start_date | date: 'dd.MM.yy') : '–' }} –
                      {{ o.end_date ? (o.end_date | date: 'dd.MM.yy') : 'offen' }}
                      · <span class="status-badge" [class]="'status-' + o.status">{{
                        orderStatusLabels[o.status]
                      }}</span>
                    </span>
                  </mat-list-item>
                </a>
              }
            </mat-list>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Schadensmeldungen</mat-card-title>
            <button matIconButton routerLink="/schaeden/neu" [queryParams]="{ fahrzeug: v.id }" aria-label="Schaden melden">
              <mat-icon>add</mat-icon>
            </button>
          </mat-card-header>
          <mat-card-content>
            @if (damages().length === 0) {
              <p class="empty">Keine Schadensmeldungen.</p>
            } @else {
              <app-vehicle-damage-overview
                [damages]="damages()"
                [category]="v.type"
                (damageSelect)="openDamagePhotos($event)"
              />
            }
            <mat-list>
              @for (d of damages(); track d.id) {
                <mat-list-item lines="3">
                  <mat-icon matListItemIcon>report_problem</mat-icon>
                  <span matListItemTitle>{{ d.damage_date | date: 'dd.MM.yyyy' }} — {{ d.description }}</span>
                  <span matListItemLine>
                    @if (d.location) {
                      {{ d.location }} ·
                    }
                    gemeldet von {{ d.reporter_name }} · {{ statusLabels[d.status] }}
                  </span>
                  <button
                    matIconButton
                    matListItemMeta
                    type="button"
                    (click)="openDamagePhotos(d)"
                    aria-label="Fotos ansehen"
                  >
                    <mat-icon>photo_library</mat-icon>
                  </button>
                </mat-list-item>
              }
            </mat-list>
          </mat-card-content>
        </mat-card>
      </div>
    }
  `,
  styles: `
    .plate-header {
      margin-bottom: 12px;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      align-items: start;
    }
    mat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
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
    .notes {
      margin-top: 12px;
      white-space: pre-wrap;
      color: var(--hugo-ink-muted);
    }
    .empty {
      color: var(--hugo-ink-muted);
      font-size: 13px;
    }
    .order-row {
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
  `,
})
export class VehicleDetailComponent {
  readonly fleet = inject(FleetService);
  readonly auth = inject(AuthService);
  private readonly customersService = inject(CustomersService);
  private readonly damageService = inject(DamageReportService);
  private readonly ordersService = inject(OrdersService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly id = input.required<string>();

  readonly fuelLabels = FUEL_TYPE_LABELS;
  readonly statusLabels = DAMAGE_STATUS_LABELS;
  readonly orderStatusLabels = ORDER_STATUS_LABELS;
  readonly serviceEntries = signal<ServiceEntry[]>([]);

  readonly vehicle = computed(() => this.fleet.byId(this.id()));
  readonly tuvInfo = computed(() => {
    const v = this.vehicle();
    return calcTuvInfo(v?.tuv_date ?? null, v?.is_faster_than_40kmh ?? true);
  });
  readonly customerName = computed(() => {
    const cid = this.vehicle()?.customer_id;
    if (!cid) {
      return null;
    }
    return this.customersService.customers().find((c) => c.id === cid)?.company_name ?? null;
  });
  readonly damages = computed<DamageReport[]>(() =>
    this.damageService.reports().filter((d) => d.vehicle_id === this.id()),
  );
  readonly orders = computed(() =>
    this.ordersService.orders().filter((o) => o.vehicle_ids.includes(this.id())),
  );

  constructor() {
    void this.fleet.load();
    void this.customersService.load();
    void this.damageService.load();
    void this.ordersService.load();
    void this.reloadServiceEntries();
  }

  private async reloadServiceEntries(): Promise<void> {
    this.serviceEntries.set(await this.fleet.loadServiceEntries(this.id()));
  }

  openDamagePhotos(d: DamageReport): void {
    this.dialog.open(DamageReportPhotosDialogComponent, { data: d });
  }

  addServiceEntry(): void {
    this.dialog
      .open(ServiceEntryDialogComponent, { data: this.id() })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          void this.reloadServiceEntries();
        }
      });
  }

  async deleteServiceEntry(entry: ServiceEntry): Promise<void> {
    const ok = await confirmDialog(this.dialog, {
      title: 'Service-Eintrag löschen?',
      message: `Eintrag vom ${new Date(entry.service_date).toLocaleDateString('de-DE')} wirklich löschen?`,
      confirmLabel: 'Löschen',
      destructive: true,
    });
    if (!ok) {
      return;
    }
    try {
      await this.fleet.deleteServiceEntry(entry.id);
      await this.reloadServiceEntries();
      this.snackBar.open('Service-Eintrag gelöscht.', undefined, { duration: 3000 });
    } catch (err) {
      this.snackBar.open('Löschen fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 5000,
      });
    }
  }
}
