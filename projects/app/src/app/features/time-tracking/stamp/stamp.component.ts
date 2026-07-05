import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CommissionCodesService } from '../../commission-codes/commission-codes.service';
import { FleetService } from '../../fleet/fleet.service';
import { OrdersService } from '../../orders/orders.service';
import { ActiveStamp, StampService } from './stamp.service';

/** START/PAUSE/WEITER/STOP-Stempelung mit Live-Timer (US-10, US-11, US-12). */
@Component({
  selector: 'app-stamp',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header title="Zeiterfassung" subtitle="Arbeitszeit auf Aufträge stempeln" />

    <mat-card class="start-card">
      <mat-card-header>
        <mat-card-title>Neue Stempelung</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="start()" class="start-form">
          <mat-form-field appearance="outline">
            <mat-label>Auftrag</mat-label>
            <mat-select formControlName="orderId" required>
              @for (o of openOrders(); track o.id) {
                <mat-option [value]="o.id">{{ o.order_number }} — {{ o.description ?? '' }}</mat-option>
              }
            </mat-select>
            <mat-error>Auftrag wählen</mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Kommissionsnummer</mat-label>
            <mat-select formControlName="commissionCodeId" required>
              @for (c of codes.activeCodes(); track c.id) {
                <mat-option [value]="c.id">{{ c.code }} — {{ c.label }}</mat-option>
              }
            </mat-select>
            <mat-error>Kommissionsnummer ist Pflicht (US-12)</mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Fahrzeug (optional)</mat-label>
            <mat-select formControlName="vehicleId">
              <mat-option [value]="null">Ohne Fahrzeug</mat-option>
              @for (v of orderVehicles(); track v.id) {
                <mat-option [value]="v.id">{{ v.plate }} — {{ v.make }} {{ v.model }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <button matButton="filled" type="submit" class="start-btn" [disabled]="form.invalid || starting()">
            <mat-icon>play_arrow</mat-icon>
            START
          </button>
        </form>
      </mat-card-content>
    </mat-card>

    @if (stampService.stamps().length > 0) {
      <h2 class="section-title">Laufende Stempelungen</h2>
    }

    <div class="stamps">
      @for (stamp of stampService.stamps(); track stamp.entryId) {
        <mat-card class="stamp-card" [class.paused]="stamp.status === 'paused'">
          <mat-card-content>
            <div class="stamp-info">
              <span class="order">{{ orderLabel(stamp) }}</span>
              <span class="details">
                {{ codeLabel(stamp) }}
                @if (stamp.vehicleId) {
                  · {{ plateLabel(stamp) }}
                }
              </span>
              <span class="since">Gestartet {{ startedLabel(stamp) }}</span>
            </div>
            <div class="timer" [class.paused]="stamp.status === 'paused'">
              {{ timerLabel(stamp) }}
              @if (stamp.status === 'paused') {
                <span class="pause-hint">pausiert</span>
              }
            </div>
            <div class="stamp-actions">
              @if (stamp.status === 'open') {
                <button matButton (click)="stampService.pause(stamp.entryId)">
                  <mat-icon>pause</mat-icon>
                  PAUSE
                </button>
              } @else {
                <button matButton (click)="stampService.resume(stamp.entryId)">
                  <mat-icon>play_arrow</mat-icon>
                  WEITER
                </button>
              }
              <button matButton="filled" class="stop-btn" (click)="stampService.stop(stamp.entryId)">
                <mat-icon>stop</mat-icon>
                STOP
              </button>
            </div>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: `
    .start-card {
      margin-bottom: 24px;
    }
    .start-form {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px 16px;
      align-items: start;
      padding-top: 12px;
    }
    .start-btn {
      height: 56px;
      font-size: 16px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 12px;
    }
    .stamps {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }
    .stamp-card {
      border-left: 4px solid #4e944f;
    }
    .stamp-card.paused {
      border-left-color: #e65100;
    }
    .stamp-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .order {
      font-weight: 600;
    }
    .details,
    .since {
      font-size: 13px;
      color: rgba(0, 0, 0, 0.6);
    }
    .timer {
      font-size: 36px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #4e944f;
      margin: 12px 0;
    }
    .timer.paused {
      color: #e65100;
    }
    .pause-hint {
      font-size: 13px;
      font-weight: 500;
      margin-left: 8px;
    }
    .stamp-actions {
      display: flex;
      gap: 8px;
    }
    .stop-btn {
      --mat-button-filled-container-color: #c62828;
    }
  `,
})
export class StampComponent {
  readonly stampService = inject(StampService);
  readonly codes = inject(CommissionCodesService);
  private readonly orders = inject(OrdersService);
  private readonly fleet = inject(FleetService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly starting = signal(false);

  readonly form = this.fb.group({
    orderId: ['', Validators.required],
    commissionCodeId: ['', Validators.required],
    vehicleId: [null as string | null],
  });

  readonly openOrders = computed(() =>
    this.orders.orders().filter((o) => o.status !== 'done'),
  );

  private readonly selectedOrderId = toSignal(this.form.controls.orderId.valueChanges, {
    initialValue: null,
  });

  /** Fahrzeuge des gewählten Auftrags (US-11). */
  readonly orderVehicles = computed(() => {
    const order = this.orders.orders().find((o) => o.id === this.selectedOrderId());
    if (!order) {
      return [];
    }
    return order.vehicle_ids
      .map((id) => this.fleet.byId(id))
      .filter((v) => v !== undefined);
  });

  constructor() {
    void this.orders.load();
    void this.codes.load();
    void this.fleet.load();
  }

  async start(): Promise<void> {
    if (this.form.invalid || this.starting()) {
      return;
    }
    this.starting.set(true);
    const raw = this.form.getRawValue();
    try {
      await this.stampService.start(raw.orderId!, raw.vehicleId, raw.commissionCodeId!);
      this.form.controls.vehicleId.setValue(null);
    } catch (err) {
      this.snackBar.open('Start fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 5000,
      });
    } finally {
      this.starting.set(false);
    }
  }

  timerLabel(stamp: ActiveStamp): string {
    const total = this.stampService.elapsedSeconds(stamp, this.stampService.now());
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  orderLabel(stamp: ActiveStamp): string {
    const order = this.orders.orders().find((o) => o.id === stamp.orderId);
    return order ? `Auftrag ${order.order_number}` : 'Auftrag';
  }

  codeLabel(stamp: ActiveStamp): string {
    const code = this.codes.codes().find((c) => c.id === stamp.commissionCodeId);
    return code ? `${code.code} — ${code.label}` : '';
  }

  plateLabel(stamp: ActiveStamp): string {
    return stamp.vehicleId ? (this.fleet.byId(stamp.vehicleId)?.plate ?? '') : '';
  }

  startedLabel(stamp: ActiveStamp): string {
    return new Date(stamp.startedAt).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
