import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Material } from '../../core/models/material.model';
import { MaterialsService } from './materials.service';

/** Feste Auswahlliste an Einheiten für den Materialstamm. */
const UNITS = ['Stück', 'm', 'cm', 'kg', 'g', 'l', 'Paar', 'Rolle', 'Pack', 'Satz'];

@Component({
  selector: 'app-material-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ material ? 'Artikel bearbeiten' : 'Neuer Artikel' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="material-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Bezeichnung</mat-label>
          <input matInput formControlName="name" required />
          <mat-error>Bezeichnung ist erforderlich</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Einheit</mat-label>
          <mat-select formControlName="unit" required>
            @for (u of units; track u) {
              <mat-option [value]="u">{{ u }}</mat-option>
            }
          </mat-select>
          <mat-error>Einheit ist erforderlich</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Preis pro Einheit</mat-label>
          <input matInput type="number" formControlName="unit_price" min="0" step="0.01" required />
          <span matTextSuffix>€</span>
          <mat-error>Gültiger Preis ist erforderlich</mat-error>
        </mat-form-field>
        <mat-checkbox formControlName="is_active">Aktiv (für Buchung wählbar)</mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Abbrechen</button>
      <button matButton="filled" form="material-form" type="submit" [disabled]="form.invalid || saving()">
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
export class MaterialDialogComponent {
  private readonly service = inject(MaterialsService);
  private readonly dialogRef = inject(MatDialogRef<MaterialDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly material = inject<Material | null>(MAT_DIALOG_DATA);
  readonly saving = signal(false);
  readonly units = UNITS;

  readonly form = this.fb.nonNullable.group({
    name: [this.material?.name ?? '', Validators.required],
    unit: [this.material?.unit ?? 'Stück', Validators.required],
    unit_price: [this.material?.unit_price ?? 0, [Validators.required, Validators.min(0)]],
    is_active: [this.material?.is_active ?? true],
  });

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const payload = {
      name: raw.name.trim(),
      unit: raw.unit.trim(),
      unit_price: Number(raw.unit_price),
      is_active: raw.is_active,
    };
    try {
      if (this.material) {
        await this.service.update(this.material.id, payload);
      } else {
        await this.service.create({ ...payload, position: this.service.nextPosition() });
      }
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
