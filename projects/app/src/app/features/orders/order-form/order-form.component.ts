import { Component, computed, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from 'auth';
import { ORDER_STATUS_LABELS, OrderStatus } from '../../../core/models/order.model';
import { CustomersService } from '../../customers/customers.service';
import { FleetService } from '../../fleet/fleet.service';
import { OrderWithVehicles, OrdersService } from '../orders.service';

/**
 * Auftrag anlegen/bearbeiten (US-08): Kunde per Suche wählen, mindestens ein
 * Fahrzeug aus dessen Fuhrpark zuordnen.
 */
@Component({
  selector: 'app-order-form',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ order ? 'Auftrag bearbeiten' : 'Neuer Auftrag' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="order-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Auftragsnummer</mat-label>
          <input matInput formControlName="order_number" required />
          <button
            matSuffix
            mat-icon-button
            type="button"
            matTooltip="Auftragsnummer generieren"
            (click)="generateOrderNumber()"
          >
            <mat-icon>auto_fix_high</mat-icon>
          </button>
          <mat-error>Auftragsnummer ist erforderlich</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Kunde</mat-label>
          <input
            matInput
            formControlName="customer_id"
            [matAutocomplete]="customerAuto"
            placeholder="Kunde suchen…"
            required
          />
          <mat-autocomplete #customerAuto="matAutocomplete" [displayWith]="customerDisplayFn">
            @for (c of filteredCustomers(); track c.id) {
              <mat-option [value]="c.id">{{ c.company_name }}</mat-option>
            }
          </mat-autocomplete>
          <mat-error>Kunde ist erforderlich</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Fahrzeuge (mind. eines)</mat-label>
          <mat-chip-grid #vehicleChipGrid>
            @for (v of selectedVehicleObjects(); track v.id) {
              <mat-chip-row (removed)="removeVehicle(v.id)">
                {{ v.plate }} — {{ v.make }} {{ v.model }}
                <button matChipRemove type="button" [attr.aria-label]="'Fahrzeug ' + v.plate + ' entfernen'">
                  <mat-icon>cancel</mat-icon>
                </button>
              </mat-chip-row>
            }
          </mat-chip-grid>
          <input
            matInput
            #vehicleInput
            [formControl]="vehicleSearchControl"
            [matChipInputFor]="vehicleChipGrid"
            [matAutocomplete]="vehicleAuto"
            placeholder="Kennzeichen suchen…"
          />
          <mat-autocomplete #vehicleAuto="matAutocomplete" (optionSelected)="onVehicleSelected($event)">
            @for (v of filteredVehicles(); track v.id) {
              <mat-option [value]="v.id">{{ v.plate }} — {{ v.make }} {{ v.model }}</mat-option>
            }
          </mat-autocomplete>
          @if (form.controls.vehicle_ids.hasError('required')) {
            <mat-error>Mindestens ein Fahrzeug zuordnen</mat-error>
          }
          <mat-hint>
            @if (selectedCustomerId()) {
              Fuhrpark des Kunden
            } @else {
              Zuerst Kunde auswählen
            }
          </mat-hint>
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

  @ViewChild('vehicleInput') private readonly vehicleInput?: ElementRef<HTMLInputElement>;

  readonly order = inject<OrderWithVehicles | null>(MAT_DIALOG_DATA);
  readonly saving = signal(false);
  readonly statuses: OrderStatus[] = ['open', 'in_progress', 'done'];
  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly vehicleSearchControl = new FormControl('', { nonNullable: true });

  readonly form = this.fb.nonNullable.group({
    order_number: [this.order?.order_number ?? '', Validators.required],
    customer_id: [this.order?.customer_id ?? '', Validators.required],
    vehicle_ids: [this.order?.vehicle_ids ?? ([] as string[]), Validators.required],
    description: [this.order?.description ?? ''],
    start_date: [this.order?.start_date ? new Date(this.order.start_date) : null],
    end_date: [this.order?.end_date ? new Date(this.order.end_date) : null],
    status: [this.order?.status ?? ('open' as OrderStatus)],
  });

  readonly selectedCustomerId = toSignal(this.form.controls.customer_id.valueChanges, {
    initialValue: this.form.controls.customer_id.value,
  });

  private readonly vehicleIds = toSignal(this.form.controls.vehicle_ids.valueChanges, {
    initialValue: this.form.controls.vehicle_ids.value,
  });

  private readonly vehicleSearch = toSignal(this.vehicleSearchControl.valueChanges, {
    initialValue: this.vehicleSearchControl.value,
  });

  /** Nur Fahrzeuge aus dem Fuhrpark des gewählten Kunden (US-08). */
  readonly selectableVehicles = computed(() => {
    const cid = this.selectedCustomerId();
    if (!cid) {
      return [];
    }
    return this.fleet.vehicles().filter((v) => v.is_active && v.customer_id === cid);
  });

  readonly selectedVehicleObjects = computed(() => {
    const ids = this.vehicleIds();
    return ids
      .map((id) => this.fleet.byId(id))
      .filter((v): v is NonNullable<typeof v> => v !== undefined);
  });

  /** Fahrzeugsuche nach Kennzeichen/Marke/Modell (autocomplete), bereits gewählte ausgeblendet. */
  readonly filteredVehicles = computed(() => {
    const search = this.vehicleSearch().toLowerCase();
    const selected = new Set(this.vehicleIds());
    return this.selectableVehicles().filter(
      (v) =>
        !selected.has(v.id) &&
        (v.plate.toLowerCase().includes(search) ||
          v.make.toLowerCase().includes(search) ||
          v.model.toLowerCase().includes(search)),
    );
  });

  /** Für die Kundensuche im Autocomplete-Feld gefiltert nach Freitext (Firmenname). */
  readonly filteredCustomers = computed(() => {
    const raw = this.selectedCustomerId() ?? '';
    const isKnownId = this.customers.customers().some((c) => c.id === raw);
    const search = isKnownId ? '' : raw.toLowerCase();
    return this.customers
      .customers()
      .filter((c) => c.company_name.toLowerCase().includes(search));
  });

  readonly customerDisplayFn = (id: string | null): string => {
    if (!id) {
      return '';
    }
    return this.customers.byId(id)?.company_name ?? '';
  };

  constructor() {
    void this.customers.load();
    void this.fleet.load();

    let previousCustomerId = this.form.controls.customer_id.value;
    this.form.controls.customer_id.valueChanges.subscribe((value) => {
      if (value !== previousCustomerId) {
        this.form.controls.vehicle_ids.setValue([]);
        this.vehicleSearchControl.setValue('');
      }
      previousCustomerId = value;
    });
  }

  onVehicleSelected(event: MatAutocompleteSelectedEvent): void {
    this.addVehicle(event.option.value as string);
    if (this.vehicleInput) {
      this.vehicleInput.nativeElement.value = '';
    }
    this.vehicleSearchControl.setValue('');
  }

  addVehicle(id: string): void {
    const current = this.form.controls.vehicle_ids.value;
    if (!current.includes(id)) {
      this.form.controls.vehicle_ids.setValue([...current, id]);
    }
  }

  removeVehicle(id: string): void {
    const current = this.form.controls.vehicle_ids.value;
    this.form.controls.vehicle_ids.setValue(current.filter((v) => v !== id));
  }

  /** Generiert eine fortlaufende Auftragsnummer im Format AUF-JAHR-NNNN. */
  generateOrderNumber(): void {
    const year = new Date().getFullYear();
    const prefix = `AUF-${year}-`;
    const maxSeq = this.service
      .orders()
      .map((o) => o.order_number)
      .filter((n) => n.startsWith(prefix))
      .map((n) => parseInt(n.slice(prefix.length), 10))
      .filter((n) => !isNaN(n))
      .reduce((max, n) => Math.max(max, n), 0);
    const next = maxSeq + 1;
    this.form.controls.order_number.setValue(prefix + next.toString().padStart(4, '0'));
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    const raw = this.form.getRawValue();
    if (!this.customers.byId(raw.customer_id)) {
      this.form.controls.customer_id.setErrors({ required: true });
      return;
    }
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
