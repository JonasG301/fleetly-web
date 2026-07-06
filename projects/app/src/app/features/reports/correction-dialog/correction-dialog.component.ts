import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TimeEntry } from '../../../core/models/time-entry.model';
import { CommissionCodesService } from '../../commission-codes/commission-codes.service';
import { FleetService } from '../../fleet/fleet.service';
import { OrdersService } from '../../orders/orders.service';
import { ReportsService } from '../reports.service';

/**
 * Korrektur-Dialog (US-16): Start/Ende, Auftrag, Fahrzeug und Kommissionsnummer
 * nachträglich korrigieren. Jede Korrektur landet mit Begründung im Audit-Trail
 * (DB-Trigger); Stornieren statt Löschen.
 */
@Component({
  selector: 'app-correction-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Zeiteintrag korrigieren</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="correction-form" (ngSubmit)="save()">
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Start</mat-label>
            <input matInput type="datetime-local" formControlName="started_at" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Ende</mat-label>
            <input matInput type="datetime-local" formControlName="stopped_at" />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Auftrag</mat-label>
          <mat-select formControlName="order_id">
            @for (o of orders.orders(); track o.id) {
              <mat-option [value]="o.id">{{ o.order_number }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Fahrzeug</mat-label>
          <mat-select formControlName="vehicle_id">
            <mat-option [value]="null">Ohne Fahrzeug</mat-option>
            @for (v of fleet.vehicles(); track v.id) {
              <mat-option [value]="v.id">{{ v.plate }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Kommissionsnummer</mat-label>
          <mat-select formControlName="commission_code_id">
            @for (c of codes.codes(); track c.id) {
              <mat-option [value]="c.id">{{ c.code }} — {{ c.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Begründung der Korrektur</mat-label>
          <textarea matInput formControlName="note" rows="2" required></textarea>
          <mat-error>Begründung ist erforderlich</mat-error>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button matButton class="cancel-entry" type="button" (click)="cancelEntry()">
        Eintrag stornieren
      </button>
      <span class="spacer"></span>
      <button matButton mat-dialog-close type="button">Abbrechen</button>
      <button
        matButton="filled"
        form="correction-form"
        type="submit"
        [disabled]="form.invalid || saving()"
      >
        Korrektur speichern
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(460px, 85vw);
      padding-top: 8px;
    }
    .full-width {
      width: 100%;
    }
    .row {
      display: flex;
      gap: 12px;
    }
    .row > * {
      flex: 1;
    }
    .cancel-entry {
      color: var(--hugo-status-critical);
    }
    .spacer {
      flex: 1;
    }
  `,
})
export class CorrectionDialogComponent {
  private readonly reports = inject(ReportsService);
  readonly orders = inject(OrdersService);
  readonly fleet = inject(FleetService);
  readonly codes = inject(CommissionCodesService);
  private readonly dialogRef = inject(MatDialogRef<CorrectionDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly entry = inject<TimeEntry>(MAT_DIALOG_DATA);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    started_at: [this.toLocal(this.entry.started_at), Validators.required],
    stopped_at: [this.entry.stopped_at ? this.toLocal(this.entry.stopped_at) : ''],
    order_id: [this.entry.order_id],
    vehicle_id: [this.entry.vehicle_id],
    commission_code_id: [this.entry.commission_code_id],
    note: ['', Validators.required],
  });

  private toLocal(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const started = new Date(raw.started_at);
    const stopped = raw.stopped_at ? new Date(raw.stopped_at) : null;
    // Korrigierte Dauer aus Start/Ende — Segment-genaue Korrektur ist Phase 6
    const duration = stopped
      ? Math.max(0, Math.floor((stopped.getTime() - started.getTime()) / 1000))
      : null;
    try {
      await this.reports.correctEntry(
        this.entry.id,
        {
          started_at: started.toISOString(),
          stopped_at: stopped?.toISOString() ?? null,
          duration_seconds: duration ?? this.entry.duration_seconds,
          order_id: raw.order_id,
          vehicle_id: raw.vehicle_id,
          commission_code_id: raw.commission_code_id,
        },
        raw.note.trim(),
      );
      this.dialogRef.close(true);
    } catch (err) {
      this.snackBar.open('Korrektur fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 6000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  async cancelEntry(): Promise<void> {
    const note = this.form.controls.note.value.trim();
    if (!note) {
      this.snackBar.open('Bitte zuerst eine Begründung eingeben.', 'OK', { duration: 4000 });
      return;
    }
    try {
      await this.reports.cancelEntry(this.entry.id, note);
      this.dialogRef.close(true);
    } catch (err) {
      this.snackBar.open('Stornieren fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 6000,
      });
    }
  }
}
