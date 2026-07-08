import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { AuthService } from 'auth';
import { OrderMaterial } from '../../../core/models/material.model';
import { ORDER_STATUS_LABELS } from '../../../core/models/order.model';
import { confirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LicensePlateComponent } from '../../../shared/components/license-plate/license-plate.component';
import { LoadErrorComponent } from '../../../shared/components/load-error/load-error.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';
import { CustomersService } from '../../customers/customers.service';
import { FleetService } from '../../fleet/fleet.service';
import { ReportsService } from '../../reports/reports.service';
import { OrderFormComponent } from '../order-form/order-form.component';
import { OrderMaterialsService } from '../order-materials.service';
import { OrderWithVehicles, OrdersService } from '../orders.service';
import { OrderMaterialDialogComponent } from './order-material-dialog.component';

/** Auftrags-Detail: Kunde, Fahrzeuge, Zeiterfassung je Mitarbeiter. */
@Component({
  selector: 'app-order-detail',
  imports: [
    CurrencyPipe,
    DatePipe,
    DurationPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    PageHeaderComponent,
    LicensePlateComponent,
    LoadErrorComponent,
  ],
  template: `
    @if (order(); as o) {
      <app-page-header [title]="o.order_number" [subtitle]="statusLabels[o.status]">
        @if (auth.isAdmin()) {
          <button matButton="filled" (click)="edit(o)">
            <mat-icon>edit</mat-icon>
            Bearbeiten
          </button>
        }
      </app-page-header>

      <div class="detail-grid">
        <mat-card>
          <mat-card-header>
            <mat-card-title>Auftragsdaten</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <dl>
              <dt>Beschreibung</dt>
              <dd>{{ o.description ?? '–' }}</dd>
              <dt>Zeitraum</dt>
              <dd>
                {{ o.start_date ? (o.start_date | date: 'dd.MM.yyyy') : '–' }} –
                {{ o.end_date ? (o.end_date | date: 'dd.MM.yyyy') : 'offen' }}
              </dd>
              <dt>Status</dt>
              <dd>
                <span class="status-badge" [class]="'status-' + o.status">{{
                  statusLabels[o.status]
                }}</span>
              </dd>
              <dt>Erstellt von</dt>
              <dd>{{ createdByName() ?? '–' }}</dd>
              <dt>Erstellt am</dt>
              <dd>{{ o.created_at | date: 'dd.MM.yyyy HH:mm' }}</dd>
            </dl>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Kunde</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (customer(); as c) {
              <dl>
                <dt>Firma</dt>
                <dd><a [routerLink]="['/kunden', c.id]">{{ c.company_name }}</a></dd>
                <dt>Ansprechpartner</dt>
                <dd>{{ c.contact_name ?? '–' }}</dd>
                <dt>Telefon</dt>
                <dd>{{ c.phone ?? '–' }}</dd>
                <dt>E-Mail</dt>
                <dd>{{ c.email ?? '–' }}</dd>
              </dl>
            }
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Fahrzeuge ({{ vehicles().length }})</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (vehicles().length === 0) {
              <p class="empty">Keine Fahrzeuge zugeordnet.</p>
            }
            <div class="vehicle-list">
              @for (v of vehicles(); track v.id) {
                <a [routerLink]="['/fuhrpark', v.id]" class="vehicle-row row-link">
                  <app-license-plate [plate]="v.plate" size="sm" />
                  <span class="vehicle-info">
                    <span class="vehicle-title">{{ v.make }} {{ v.model }}</span>
                    <span class="vehicle-sub">{{ v.internal_name ?? '–' }}</span>
                  </span>
                </a>
              }
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="time-card">
          <mat-card-header>
            <mat-card-title>Zeiterfassung</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (timeLoadError()) {
              <app-load-error [message]="timeLoadError()!" (retry)="loadTimeEntries(id())" />
            } @else if (orderEntries().length === 0) {
              <p class="empty">Keine Zeiten gestempelt.</p>
            } @else {
              <div class="sum-row">
                @for (s of sumsByEmployee(); track s.userId) {
                  <div class="sum-card">
                    <span class="sum-value">{{ s.seconds | duration }}</span>
                    <span>{{ s.name }}</span>
                  </div>
                }
              </div>
              <mat-list>
                @for (e of orderEntries(); track e.id) {
                  <mat-list-item lines="2">
                    <mat-icon matListItemIcon>schedule</mat-icon>
                    <span matListItemTitle>{{ employeeName(e.user_id) }}</span>
                    <span matListItemLine>
                      {{ e.started_at | date: 'dd.MM.yy HH:mm' }} –
                      {{ e.stopped_at ? (e.stopped_at | date: 'HH:mm') : 'läuft' }}
                      · {{ e.duration_seconds | duration }}
                    </span>
                  </mat-list-item>
                }
              </mat-list>
            }
          </mat-card-content>
        </mat-card>

        <mat-card class="material-card">
          <mat-card-header>
            <mat-card-title>Material</mat-card-title>
            @if (o.status !== 'done') {
              <button matButton="filled" (click)="addMaterial()">
                <mat-icon>add</mat-icon>
                Material buchen
              </button>
            }
          </mat-card-header>
          <mat-card-content>
            @if (materialEntries().length === 0) {
              <p class="empty">Kein Material gebucht.</p>
            } @else {
              <div class="sum-row">
                <div class="sum-card">
                  <span class="sum-value">
                    {{ materialTotal() | currency: 'EUR' : 'symbol' : '1.2-2' : 'de' }}
                  </span>
                  <span>Materialkosten gesamt</span>
                </div>
              </div>
              <mat-list>
                @for (m of materialEntries(); track m.id) {
                  <mat-list-item lines="2">
                    <mat-icon matListItemIcon>inventory_2</mat-icon>
                    <span matListItemTitle>{{ m.material_name }}</span>
                    <span matListItemLine>
                      {{ m.quantity }} {{ m.unit }} ×
                      {{ m.unit_price | currency: 'EUR' : 'symbol' : '1.2-2' : 'de' }} =
                      {{ lineTotal(m) | currency: 'EUR' : 'symbol' : '1.2-2' : 'de' }}
                    </span>
                    @if (canRemove(m)) {
                      <button
                        matListItemMeta
                        matIconButton
                        (click)="removeMaterial(m)"
                        aria-label="Buchung löschen"
                      >
                        <mat-icon>delete</mat-icon>
                      </button>
                    }
                  </mat-list-item>
                }
              </mat-list>
            }
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
    .time-card,
    .material-card {
      grid-column: 1 / -1;
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
    .row-link {
      color: inherit;
      text-decoration: none;
    }
    .vehicle-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .vehicle-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 4px;
      border-radius: 8px;
    }
    .vehicle-row:hover {
      background: var(--hugo-hairline);
    }
    .vehicle-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .vehicle-title {
      font-size: 14px;
      font-weight: 500;
    }
    .vehicle-sub {
      font-size: 13px;
      color: var(--hugo-ink-muted);
    }
    .sum-row {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--hugo-hairline);
    }
    .sum-card {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .sum-value {
      font-size: 20px;
      font-weight: 700;
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
export class OrderDetailComponent {
  private readonly ordersService = inject(OrdersService);
  private readonly customersService = inject(CustomersService);
  private readonly fleet = inject(FleetService);
  readonly reports = inject(ReportsService);
  readonly auth = inject(AuthService);
  private readonly orderMaterials = inject(OrderMaterialsService);
  private readonly dialog = inject(MatDialog);

  readonly id = input.required<string>();

  readonly statusLabels = ORDER_STATUS_LABELS;

  readonly order = computed(() => this.ordersService.byId(this.id()));
  readonly customer = computed(() => {
    const cid = this.order()?.customer_id;
    return cid ? this.customersService.byId(cid) : undefined;
  });
  readonly vehicles = computed(() =>
    (this.order()?.vehicle_ids ?? [])
      .map((vid) => this.fleet.byId(vid))
      .filter((v) => v !== undefined),
  );
  readonly createdByName = computed(() => {
    const createdBy = this.order()?.created_by;
    if (!createdBy) {
      return null;
    }
    return this.reports.profiles().find((p) => p.id === createdBy)?.full_name ?? null;
  });
  /**
   * Defensiv nach order_id gefiltert: `reports` ist ein app-weiter Singleton,
   * dessen zuletzt geladener Datensatz auch von der Auswertungsseite stammen
   * kann — ohne diesen Filter würden dort geladene, ungefilterte Einträge
   * anderer Aufträge hier fälschlich mit angezeigt.
   */
  readonly orderEntries = computed(() =>
    this.reports.entries().filter((e) => e.order_id === this.id()),
  );
  readonly sumsByEmployee = computed(() => {
    const byUser = new Map<string, number>();
    for (const e of this.orderEntries()) {
      byUser.set(e.user_id, (byUser.get(e.user_id) ?? 0) + (e.duration_seconds ?? 0));
    }
    return [...byUser.entries()].map(([userId, seconds]) => ({
      userId,
      seconds,
      name: this.employeeName(userId),
    }));
  });

  readonly materialEntries = computed(() => this.orderMaterials.entries());
  readonly materialTotal = computed(() =>
    this.materialEntries().reduce((sum, m) => sum + this.lineTotal(m), 0),
  );

  readonly timeLoadError = signal<string | null>(null);

  constructor() {
    void this.ordersService.load();
    void this.customersService.load();
    void this.fleet.load();
    void this.reports.loadProfiles();
    // Als effect() statt direktem Aufruf im Konstruktor: `id` ist ein per Router
    // gebundener required-Input und erst NACH dem Konstruktor verfügbar (NG0950,
    // wenn man ihn hier synchron liest). Der effect läuft erstmals, sobald der
    // Input gesetzt ist, und erneut bei jeder Änderung von `id()`.
    effect(() => {
      void this.loadTimeEntries(this.id());
      void this.orderMaterials.loadForOrder(this.id());
    });
  }

  lineTotal(m: OrderMaterial): number {
    return m.unit_price * m.quantity;
  }

  /** Eigene Buchung oder Admin — deckt sich mit der RLS-Policy. */
  canRemove(m: OrderMaterial): boolean {
    return this.auth.isAdmin() || m.created_by === this.auth.user()?.id;
  }

  addMaterial(): void {
    this.dialog.open(OrderMaterialDialogComponent, { data: this.id() });
  }

  async removeMaterial(m: OrderMaterial): Promise<void> {
    const ok = await confirmDialog(this.dialog, {
      title: 'Buchung löschen',
      message: `Material „${m.material_name}" aus dem Auftrag entfernen?`,
      confirmLabel: 'Löschen',
    });
    if (ok) {
      await this.orderMaterials.remove(m.id, this.id());
    }
  }

  async loadTimeEntries(orderId: string): Promise<void> {
    this.timeLoadError.set(null);
    try {
      await this.reports.load({
        from: new Date(2000, 0, 1),
        to: new Date(),
        userId: null,
        orderId,
        vehicleId: null,
        commissionCodeId: null,
      });
    } catch (err) {
      this.timeLoadError.set(
        'Zeiterfassung konnte nicht geladen werden: ' + (err as Error).message,
      );
    }
  }

  employeeName(userId: string): string {
    return this.reports.profiles().find((p) => p.id === userId)?.full_name ?? 'Unbekannt';
  }

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
      await this.ordersService.setStatus(order.id, 'in_progress');
      const reloaded = this.ordersService.byId(order.id);
      this.dialog.open(OrderFormComponent, { data: reloaded ?? order });
      return;
    }
    this.dialog.open(OrderFormComponent, { data: order });
  }
}
