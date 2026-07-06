import { Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import {
  FUEL_TYPE_LABELS,
  FuelType,
  LICENSE_PLATE_PATTERN,
  VehicleInsert,
} from '../../../core/models/vehicle.model';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CustomersService } from '../../customers/customers.service';
import { FleetService } from '../fleet.service';

/**
 * Fahrzeug anlegen/bearbeiten als Stepper (US-06) — Schritte analog
 * zum Flutter-Wizard: Basisdaten / Technik & HU / Sonstiges.
 */
@Component({
  selector: 'app-vehicle-form',
  imports: [
    ReactiveFormsModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header [title]="vehicleId() ? 'Fahrzeug bearbeiten' : 'Neues Fahrzeug'" />

    <mat-stepper [linear]="!vehicleId()" orientation="vertical">
      <!-- Schritt 1: Basisdaten -->
      <mat-step [stepControl]="baseForm" label="Basisdaten">
        <form [formGroup]="baseForm" class="step-form">
          <mat-form-field appearance="outline">
            <mat-label>Kennzeichen</mat-label>
            <input matInput formControlName="plate" placeholder="S-AB 1234" />
            @if (baseForm.controls.plate.hasError('required')) {
              <mat-error>Kennzeichen ist erforderlich</mat-error>
            } @else if (baseForm.controls.plate.hasError('pattern')) {
              <mat-error>Format: XXX-XX 1234 (deutsches Kennzeichen)</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Hersteller</mat-label>
            <input matInput formControlName="make" />
            <mat-error>Hersteller ist erforderlich</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Modell</mat-label>
            <input matInput formControlName="model" />
            <mat-error>Modell ist erforderlich</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Interne Bezeichnung</mat-label>
            <input matInput formControlName="internal_name" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Zuordnung</mat-label>
            <mat-select formControlName="customer_id">
              <mat-option [value]="null">Eigener Fuhrpark</mat-option>
              @for (c of customers.customers(); track c.id) {
                <mat-option [value]="c.id">{{ c.company_name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-checkbox formControlName="is_faster_than_40kmh">
            Fahrzeug schneller als 40 km/h (HU-Intervall 1 Jahr statt 2 Jahre)
          </mat-checkbox>
          <div>
            <button matButton="filled" matStepperNext type="button">Weiter</button>
          </div>
        </form>
      </mat-step>

      <!-- Schritt 2: Technik & HU -->
      <mat-step [stepControl]="techForm" label="Technik & HU">
        <form [formGroup]="techForm" class="step-form">
          <mat-form-field appearance="outline">
            <mat-label>Betriebsstunden</mat-label>
            <input matInput type="number" min="0" formControlName="operating_hours" />
            <span matTextSuffix>h</span>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Kilometerstand</mat-label>
            <input matInput type="number" min="0" formControlName="mileage" />
            <span matTextSuffix>km</span>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Baujahr</mat-label>
            <input matInput type="number" formControlName="construction_year" />
            @if (techForm.controls.construction_year.hasError('min') || techForm.controls.construction_year.hasError('max')) {
              <mat-error>Baujahr zwischen 1900 und {{ maxYear }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Letzte HU</mat-label>
            <input matInput [matDatepicker]="tuvPicker" formControlName="tuv_date" />
            <mat-datepicker-toggle matIconSuffix [for]="tuvPicker" />
            <mat-datepicker #tuvPicker />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Letzte UVV-Prüfung</mat-label>
            <input matInput [matDatepicker]="uvvPicker" formControlName="uvv_date" />
            <mat-datepicker-toggle matIconSuffix [for]="uvvPicker" />
            <mat-datepicker #uvvPicker />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Kraftstoff</mat-label>
            <mat-select formControlName="fuel_type">
              <mat-option [value]="null">–</mat-option>
              @for (ft of fuelTypes; track ft) {
                <mat-option [value]="ft">{{ fuelTypeLabels[ft] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>FIN (VIN)</mat-label>
            <input matInput formControlName="vin" />
          </mat-form-field>
          <div class="step-actions">
            <button matButton matStepperPrevious type="button">Zurück</button>
            <button matButton="filled" matStepperNext type="button">Weiter</button>
          </div>
        </form>
      </mat-step>

      <!-- Schritt 3: Sonstiges -->
      <mat-step label="Sonstiges">
        <form [formGroup]="miscForm" class="step-form">
          <mat-form-field appearance="outline">
            <mat-label>Kostenstelle</mat-label>
            <input matInput formControlName="cost_center" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Leasing-Ende</mat-label>
            <input matInput [matDatepicker]="leasingEndPicker" formControlName="leasing_end" />
            <mat-datepicker-toggle matIconSuffix [for]="leasingEndPicker" />
            <mat-datepicker #leasingEndPicker />
          </mat-form-field>
          <mat-form-field appearance="outline" class="notes">
            <mat-label>Notizen</mat-label>
            <textarea matInput formControlName="notes" rows="4"></textarea>
          </mat-form-field>
          <div class="step-actions">
            <button matButton matStepperPrevious type="button">Zurück</button>
            <button matButton="filled" (click)="save()" [disabled]="saving() || baseForm.invalid || techForm.invalid">
              <mat-icon>save</mat-icon>
              Speichern
            </button>
          </div>
        </form>
      </mat-step>
    </mat-stepper>
  `,
  styles: `
    .step-form {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 8px 16px;
      padding: 12px 0;
      max-width: 800px;
    }
    .step-form > mat-checkbox,
    .step-form > div,
    .notes {
      grid-column: 1 / -1;
    }
    .step-actions {
      display: flex;
      gap: 8px;
    }
  `,
})
export class VehicleFormComponent implements HasUnsavedChanges {
  private readonly fleet = inject(FleetService);
  readonly customers = inject(CustomersService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  /** Route-Param bei Bearbeitung (withComponentInputBinding). */
  readonly id = input<string>();
  readonly vehicleId = computed(() => this.id() ?? null);

  readonly maxYear = new Date().getFullYear() + 1;
  readonly fuelTypes = Object.keys(FUEL_TYPE_LABELS) as FuelType[];
  readonly fuelTypeLabels = FUEL_TYPE_LABELS;
  readonly saving = signal(false);
  /** Nach erfolgreichem Speichern true — unterdrückt die Verwerfen-Rückfrage. */
  private readonly saved = signal(false);

  readonly baseForm = this.fb.nonNullable.group({
    plate: ['', [Validators.required, Validators.pattern(LICENSE_PLATE_PATTERN)]],
    make: ['', Validators.required],
    model: ['', Validators.required],
    internal_name: [''],
    customer_id: [null as string | null],
    is_faster_than_40kmh: [true],
  });

  readonly techForm = this.fb.group({
    operating_hours: [null as number | null, Validators.min(0)],
    mileage: [null as number | null, Validators.min(0)],
    construction_year: [
      null as number | null,
      [Validators.min(1900), Validators.max(this.maxYear)],
    ],
    tuv_date: [null as Date | null],
    uvv_date: [null as Date | null],
    fuel_type: [null as FuelType | null],
    vin: [''],
  });

  readonly miscForm = this.fb.group({
    cost_center: [''],
    leasing_end: [null as Date | null],
    notes: [''],
  });

  constructor() {
    void this.customers.load();
    void this.loadExisting();
  }

  private async loadExisting(): Promise<void> {
    const id = this.vehicleId();
    if (!id) {
      return;
    }
    if (this.fleet.vehicles().length === 0) {
      await this.fleet.load();
    }
    const v = this.fleet.byId(id);
    if (!v) {
      return;
    }
    this.baseForm.patchValue({
      plate: v.plate,
      make: v.make,
      model: v.model,
      internal_name: v.internal_name ?? '',
      customer_id: v.customer_id,
      is_faster_than_40kmh: v.is_faster_than_40kmh,
    });
    this.techForm.patchValue({
      operating_hours: v.operating_hours,
      mileage: v.mileage,
      construction_year: v.construction_year,
      tuv_date: v.tuv_date ? new Date(v.tuv_date) : null,
      uvv_date: v.uvv_date ? new Date(v.uvv_date) : null,
      fuel_type: v.fuel_type,
      vin: v.vin ?? '',
    });
    this.miscForm.patchValue({
      cost_center: v.cost_center ?? '',
      leasing_end: v.leasing_end ? new Date(v.leasing_end) : null,
      notes: v.notes ?? '',
    });
  }

  async save(): Promise<void> {
    if (this.baseForm.invalid || this.techForm.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    const base = this.baseForm.getRawValue();
    const tech = this.techForm.getRawValue();
    const misc = this.miscForm.getRawValue();
    const toIsoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const payload: Partial<VehicleInsert> = {
      plate: base.plate.trim().toUpperCase(),
      make: base.make.trim(),
      model: base.model.trim(),
      internal_name: base.internal_name.trim() || null,
      customer_id: base.customer_id,
      is_faster_than_40kmh: base.is_faster_than_40kmh,
      operating_hours: tech.operating_hours,
      mileage: tech.mileage,
      construction_year: tech.construction_year,
      tuv_date: toIsoDate(tech.tuv_date),
      uvv_date: toIsoDate(tech.uvv_date),
      fuel_type: tech.fuel_type,
      vin: tech.vin?.trim() || null,
      cost_center: misc.cost_center?.trim() || null,
      leasing_end: toIsoDate(misc.leasing_end),
      notes: misc.notes?.trim() || null,
    };
    try {
      const id = this.vehicleId();
      if (id) {
        await this.fleet.update(id, payload);
      } else {
        await this.fleet.create(payload as VehicleInsert);
      }
      this.snackBar.open('Fahrzeug gespeichert', undefined, { duration: 3000 });
      this.saved.set(true);
      await this.router.navigate(['/fuhrpark']);
    } catch (err) {
      this.snackBar.open('Speichern fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 6000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  hasUnsavedChanges(): boolean {
    return (
      !this.saved() &&
      (this.baseForm.dirty || this.techForm.dirty || this.miscForm.dirty)
    );
  }
}
