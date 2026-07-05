import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'auth';
import { ORDER_STATUS_LABELS, OrderStatus } from '../../../core/models/order.model';
import { CustomersService } from '../../customers/customers.service';
import { FleetService } from '../../fleet/fleet.service';
import { OrderWithVehicles, OrdersService } from '../orders.service';

/**
 * Auftrag anlegen/bearbeiten (US-08): Kunde wählen, mindestens ein Fahrzeug
 * aus dessen Fuhrpark (oder dem eigenen) zuordnen.
 */
@Component({
  selector: 'app-order-form',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ order ? 'Auftrag bearbeiten' : 'Neuer Auftrag' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="order-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Auftragsnummer</mat-label>
          <input matInput formControlName="order_number" required />
          <mat-error>Auftragsnummer ist erforderlich</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Kunde</mat-label>
          <mat-select formControlName="customer_id" required>
            @for (c of customers.customers(); track c.id) {
              <mat-option [value]="c.id">{{ c.company_name }}</mat-option>
            }
          </mat-select>
          <mat-error>Kunde ist erforderlich</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Fahrzeuge (mind. eines)</mat-label>
          <mat-select formControlName="vehicle_ids" multiple required>
            @for (v of selectableVehicles(); track v.id) {
              <mat-option [value]="v.id">
                {{ v.plate }} — {{ v.make }} {{ v.model }}{{ v.customer_id ? '' : ' (eigener Fuhrpark)' }}
              </mat-option>
            }
          </mat-select>
          @if (form.controls.vehicle_ids.hasError('required')) {
            <mat-error>Mindestens ein Fahrzeug zuordnen</mat-error>
          }
          <mat-hint>Fuhrpark des Kunden + eigener Fuhrpark</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Beschreibung</mat-label>
          <textarea matInput formControlName="description" rows="3"></textarea>
        </mat-form-field>

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Startdatum</mat-label>
            <input matInput [matDatepicker]="startPicker" formControlName="start_date" />
            <mat-datepicker-toggle matIconSuffix [for]="startPicker" />
            <mat-datepicker #startPicker />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Enddatum</mat-label>
            <input matInput [matDatepicker]="endPicker" formControlName="end_date" />
            <mat-datepicker-toggle matIconSuffix [for]="endPicker" />
            <mat-datepicker #endPicker />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            @for (s of statuses; track s) {
              <mat-option [value]="s">{{ statusLabels[s] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Abbrechen</button>
      <button matButton="filled" form="order-form" type="submit" [disabled]="form.invalid || saving()">
        Speichern
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .full-width {
      width: 100%;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(480px, 85vw);
      padding-top: 8px;
    }
    .row {
      display: flex;
      gap: 12px;
    }
    .row > * {
      flex: 1;
    }
  `,
})
export class OrderFormComponent {
  private readonly service = inject(OrdersService);
  readonly customers = inject(CustomersService);
  private readonly fleet = inject(FleetService);
  private readonly auth = inject(AuthService);
  private readonly dialogRef = inject(MatDialogRef<OrderFormComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly order = inject<OrderWithVehicles | null>(MAT_DIALOG_DATA);
  readonly saving = signal(false);
  readonly statuses: OrderStatus[] = ['open', 'in_progress', 'done'];
  readonly statusLabels = ORDER_STATUS_LABELS;

  readonly form = this.fb.nonNullable.group({
    order_number: [this.order?.order_number ?? '', Validators.required],
    customer_id: [this.order?.customer_id ?? '', Validators.required],
    vehicle_ids: [this.order?.vehicle_ids ?? ([] as string[]), Validators.required],
    description: [this.order?.description ?? ''],
    start_date: [this.order?.start_date ? new Date(this.order.start_date) : null],
    end_date: [this.order?.end_date ? new Date(this.order.end_date) : null],
    status: [this.order?.status ?? ('open' as OrderStatus)],
  });

  private readonly selectedCustomerId = toSignal(this.form.controls.customer_id.valueChanges, {
    initialValue: this.form.controls.customer_id.value,
  });

  /** Fahrzeuge des gewählten Kunden + eigener Fuhrpark (US-08). */
  readonly selectableVehicles = computed(() => {
    const cid = this.selectedCustomerId();
    return this.fleet
      .vehicles()
      .filter((v) => v.is_active && (v.customer_id === null || v.customer_id === cid));
  });

  constructor() {
    void this.customers.load();
    void this.fleet.load();
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    const raw = this.form.getRawValue();
    if (raw.vehicle_ids.length === 0) {
      this.form.controls.vehicle_ids.setErrors({ required: true });
      return;
    }
    this.saving.set(true);
    const toIsoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    try {
      await this.service.save(
        {
          order_number: raw.order_number.trim(),
          customer_id: raw.customer_id,
          description: raw.description.trim() || null,
          start_date: toIsoDate(raw.start_date),
          end_date: toIsoDate(raw.end_date),
          status: raw.status,
          created_by: this.order ? undefined : (this.auth.user()?.id ?? null),
        },
        raw.vehicle_ids,
        this.order?.id,
      );
      this.dialogRef.close(true);
    } catch (err) {
      this.snackBar.open('Speichern fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 6000,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
