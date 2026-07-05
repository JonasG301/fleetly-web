import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommissionCode } from '../../core/models/commission-code.model';
import { CommissionCodesService } from './commission-codes.service';

@Component({
  selector: 'app-commission-code-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ code ? 'Kommissionsnummer bearbeiten' : 'Neue Kommissionsnummer' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="cc-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Kürzel</mat-label>
          <input matInput formControlName="code" required />
          <mat-error>Kürzel ist erforderlich</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Bezeichnung</mat-label>
          <input matInput formControlName="label" required />
          <mat-error>Bezeichnung ist erforderlich</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Beschreibung</mat-label>
          <textarea matInput formControlName="description" rows="2"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Farbe</mat-label>
          <input matInput type="color" formControlName="color" class="color-input" />
        </mat-form-field>
        <mat-checkbox formControlName="is_active">Aktiv (für Mitarbeiter wählbar)</mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Abbrechen</button>
      <button matButton="filled" form="cc-form" type="submit" [disabled]="form.invalid || saving()">
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
    .color-input {
      height: 32px;
      padding: 2px;
    }
  `,
})
export class CommissionCodeDialogComponent {
  private readonly service = inject(CommissionCodesService);
  private readonly dialogRef = inject(MatDialogRef<CommissionCodeDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly code = inject<CommissionCode | null>(MAT_DIALOG_DATA);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    code: [this.code?.code ?? '', Validators.required],
    label: [this.code?.label ?? '', Validators.required],
    description: [this.code?.description ?? ''],
    color: [this.code?.color ?? '#4e944f'],
    is_active: [this.code?.is_active ?? true],
  });

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const payload = {
      code: raw.code.trim().toUpperCase(),
      label: raw.label.trim(),
      description: raw.description.trim() || null,
      color: raw.color,
      is_active: raw.is_active,
    };
    try {
      if (this.code) {
        await this.service.update(this.code.id, payload);
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
