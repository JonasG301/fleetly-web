import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'auth';
import { CalendarEntry } from '../../../core/models/calendar-entry.model';
import { confirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { FleetService } from '../../fleet/fleet.service';
import { CalendarEntriesService } from '../calendar-entries.service';

/** Freier Kalendereintrag (z. B. Werkstatt, Urlaub) anlegen/bearbeiten. */
@Component({
  selector: 'app-calendar-entry-form',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ entry ? 'Termin bearbeiten' : 'Neuer Termin' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="calendar-entry-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Titel</mat-label>
          <input matInput formControlName="title" required />
          <mat-error>Titel ist erforderlich</mat-error>
        </mat-form-field>

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Startdatum</mat-label>
            <input matInput [matDatepicker]="startPicker" formControlName="start_date" required />
            <mat-datepicker-toggle matIconSuffix [for]="startPicker" />
            <mat-datepicker #startPicker />
            <mat-error>Erforderlich</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Enddatum</mat-label>
            <input matInput [matDatepicker]="endPicker" formControlName="end_date" required />
            <mat-datepicker-toggle matIconSuffix [for]="endPicker" />
            <mat-datepicker #endPicker />
            <mat-error>Erforderlich</mat-error>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Fahrzeug (optional)</mat-label>
          <mat-select formControlName="vehicle_id">
            <mat-option [value]="null">Kein Fahrzeug</mat-option>
            @for (v of fleet.vehicles(); track v.id) {
              <mat-option [value]="v.id">{{ v.plate }} — {{ v.make }} {{ v.model }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Notiz</mat-label>
          <textarea matInput formControlName="note" rows="3"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (entry) {
        <button
          matButton
          type="button"
          class="delete-button"
          [disabled]="saving()"
          (click)="remove()"
        >
          <mat-icon>delete</mat-icon>
          Löschen
        </button>
      }
      <span class="spacer"></span>
      <button matButton mat-dialog-close type="button">Abbrechen</button>
      <button matButton="filled" form="calendar-entry-form" type="submit" [disabled]="form.invalid || saving()">
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
    mat-dialog-actions {
      align-items: center;
    }
    .spacer {
      flex: 1;
    }
    .delete-button {
      color: var(--hugo-status-critical);
    }
  `,
})
export class CalendarEntryFormComponent {
  private readonly service = inject(CalendarEntriesService);
  readonly fleet = inject(FleetService);
  private readonly auth = inject(AuthService);
  private readonly dialogRef = inject(MatDialogRef<CalendarEntryFormComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly entry = inject<CalendarEntry | { start_date: string } | null>(MAT_DIALOG_DATA);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    title: [this.isEntry(this.entry) ? this.entry.title : '', Validators.required],
    start_date: [
      this.entry?.start_date ? new Date(this.entry.start_date) : null,
      Validators.required,
    ],
    end_date: [
      this.isEntry(this.entry) && this.entry.end_date
        ? new Date(this.entry.end_date)
        : this.entry?.start_date
          ? new Date(this.entry.start_date)
          : null,
      Validators.required,
    ],
    vehicle_id: [this.isEntry(this.entry) ? this.entry.vehicle_id : null],
    note: [this.isEntry(this.entry) ? (this.entry.note ?? '') : ''],
  });

  constructor() {
    void this.fleet.load();
  }

  private isEntry(value: unknown): value is CalendarEntry {
    return !!value && typeof value === 'object' && 'id' in value;
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    const raw = this.form.getRawValue();
    const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
    this.saving.set(true);
    try {
      await this.service.save(
        {
          title: raw.title.trim(),
          start_date: toIsoDate(raw.start_date!),
          end_date: toIsoDate(raw.end_date!),
          vehicle_id: raw.vehicle_id,
          note: raw.note.trim() || null,
          created_by: this.isEntry(this.entry) ? undefined : (this.auth.user()?.id ?? null),
        },
        this.isEntry(this.entry) ? this.entry.id : undefined,
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

  async remove(): Promise<void> {
    if (!this.isEntry(this.entry) || this.saving()) {
      return;
    }
    const confirmed = await confirmDialog(this.dialog, {
      title: 'Termin löschen',
      message: `Termin "${this.entry.title}" wirklich löschen?`,
      confirmLabel: 'Löschen',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this.saving.set(true);
    try {
      await this.service.remove(this.entry.id);
      this.dialogRef.close(true);
    } catch (err) {
      this.snackBar.open('Löschen fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 6000,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
