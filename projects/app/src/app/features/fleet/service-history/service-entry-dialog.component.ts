import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FleetService } from '../fleet.service';

/** Service-Eintrag hinzufügen (Wartung/Reparatur-Historie je Fahrzeug). */
@Component({
  selector: 'app-service-entry-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Service-Eintrag</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="service-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Datum</mat-label>
          <input matInput [matDatepicker]="picker" formControlName="service_date" required />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Beschreibung</mat-label>
          <textarea matInput formControlName="description" rows="3" required></textarea>
          <mat-error>Beschreibung ist erforderlich</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Kilometerstand</mat-label>
          <input matInput type="number" min="0" formControlName="mileage" />
          <span matTextSuffix>km</span>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Kosten</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="cost" />
          <span matTextSuffix>€</span>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Werkstatt</mat-label>
          <input matInput formControlName="workshop" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Abbrechen</button>
      <button matButton="filled" form="service-form" type="submit" [disabled]="form.invalid || saving()">
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
      min-width: min(400px, 80vw);
      padding-top: 8px;
    }
  `,
})
export class ServiceEntryDialogComponent {
  private readonly fleet = inject(FleetService);
  private readonly dialogRef = inject(MatDialogRef<ServiceEntryDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly vehicleId = inject<string>(MAT_DIALOG_DATA);
  readonly saving = signal(false);

  readonly form = this.fb.group({
    service_date: [new Date(), Validators.required],
    description: ['', Validators.required],
    mileage: [null as number | null, Validators.min(0)],
    cost: [null as number | null, Validators.min(0)],
    workshop: [''],
  });

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    try {
      await this.fleet.addServiceEntry({
        vehicle_id: this.vehicleId,
        service_date: raw.service_date!.toISOString().slice(0, 10),
        description: raw.description!.trim(),
        mileage: raw.mileage,
        cost: raw.cost,
        workshop: raw.workshop?.trim() || null,
      });
      this.dialogRef.close(true);
    } catch (err) {
      this.snackBar.open('Speichern fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 5000,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
