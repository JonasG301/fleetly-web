import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'auth';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadErrorComponent } from '../../../shared/components/load-error/load-error.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CommissionCodesService } from '../../commission-codes/commission-codes.service';
import { FleetService } from '../../fleet/fleet.service';
import { OrdersService } from '../../orders/orders.service';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Kombiniert Datum + "HH:mm"-Zeit zu einem lokalen Date-Objekt. */
function combineDateAndTime(date: Date, time: string): Date | null {
  const match = TIME_PATTERN.exec(time);
  if (!match) {
    return null;
  }
  const result = new Date(date);
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return result;
}

/** Validiert, dass die Endzeit nach der Startzeit liegt und beides nicht in der Zukunft. */
function timeRangeValidator(group: AbstractControl): ValidationErrors | null {
  const date = group.get('date')?.value as Date | null;
  const startTime = group.get('startTime')?.value as string | null;
  const endTime = group.get('endTime')?.value as string | null;
  if (!date || !startTime || !endTime) {
    return null;
  }
  const start = combineDateAndTime(date, startTime);
  const end = combineDateAndTime(date, endTime);
  if (!start || !end) {
    return { invalidTime: true };
  }
  const now = new Date();
  if (start > now || end > now) {
    return { future: true };
  }
  if (end <= start) {
    return { endBeforeStart: true };
  }
  return null;
}

/** Manuelle Nacherfassung vergessener Stempelungen (US-15). */
@Component({
  selector: 'app-manual-entry',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    PageHeaderComponent,
    LoadErrorComponent,
  ],
  template: `
    <app-page-header
      title="Zeit nacherfassen"
      subtitle="Manuelle Nacherfassung, falls das Stempeln vergessen wurde"
    />

    @if (loadError()) {
      <app-load-error [message]="loadError()!" (retry)="reloadMasterData()" />
    }

    <form [formGroup]="form" (ngSubmit)="save()" class="manual-form">
      <mat-form-field appearance="outline">
        <mat-label>Datum</mat-label>
        <input matInput [matDatepicker]="datePicker" formControlName="date" required />
        <mat-datepicker-toggle matIconSuffix [for]="datePicker" />
        <mat-datepicker #datePicker />
        @if (form.controls.date.hasError('required')) {
          <mat-error>Datum ist erforderlich</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Startzeit</mat-label>
        <input matInput type="time" formControlName="startTime" required />
        @if (form.controls.startTime.hasError('required')) {
          <mat-error>Startzeit ist erforderlich</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Endzeit</mat-label>
        <input matInput type="time" formControlName="endTime" required />
        @if (form.controls.endTime.hasError('required')) {
          <mat-error>Endzeit ist erforderlich</mat-error>
        }
      </mat-form-field>

      @if (form.hasError('endBeforeStart')) {
        <p class="form-error">Die Endzeit muss nach der Startzeit liegen.</p>
      }
      @if (form.hasError('future')) {
        <p class="form-error">Datum/Zeit dürfen nicht in der Zukunft liegen.</p>
      }
      @if (form.hasError('invalidTime')) {
        <p class="form-error">Bitte gültige Uhrzeiten angeben.</p>
      }

      <mat-form-field appearance="outline">
        <mat-label>Auftrag</mat-label>
        <mat-select formControlName="orderId" required>
          @for (o of orders.orders(); track o.id) {
            <mat-option [value]="o.id">{{ o.order_number }} — {{ o.description ?? '' }}</mat-option>
          }
        </mat-select>
        @if (form.controls.orderId.hasError('required')) {
          <mat-error>Auftrag ist erforderlich</mat-error>
        }
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

      <mat-form-field appearance="outline">
        <mat-label>Kommissionsnummer</mat-label>
        <mat-select formControlName="commissionCodeId" required>
          @for (c of codes.activeCodes(); track c.id) {
            <mat-option [value]="c.id">{{ c.code }} — {{ c.label }}</mat-option>
          }
        </mat-select>
        @if (form.controls.commissionCodeId.hasError('required')) {
          <mat-error>Kommissionsnummer ist erforderlich</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Notiz (optional)</mat-label>
        <textarea matInput formControlName="note" rows="3"></textarea>
        <mat-hint>Grund der Nacherfassung, z. B. "Stempeln vergessen"</mat-hint>
      </mat-form-field>

      <div class="actions">
        <button matButton type="button" (click)="cancel()">Abbrechen</button>
        <button matButton="filled" type="submit" [disabled]="form.invalid || saving()">
          <mat-icon>save</mat-icon>
          Speichern
        </button>
      </div>
    </form>
  `,
  styles: `
    .manual-form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 560px;
    }
    .full-width {
      width: 100%;
    }
    .form-error {
      color: var(--hugo-status-critical);
      font-size: 13px;
      margin: -8px 0 8px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
  `,
})
export class ManualEntryComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly orders = inject(OrdersService);
  readonly fleet = inject(FleetService);
  readonly codes = inject(CommissionCodesService);

  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group(
    {
      date: [null as Date | null, Validators.required],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      orderId: ['', Validators.required],
      vehicleId: [null as string | null],
      commissionCodeId: ['', Validators.required],
      note: [''],
    },
    { validators: timeRangeValidator },
  );

  private readonly selectedOrderId = toSignal(this.form.controls.orderId.valueChanges, {
    initialValue: this.form.controls.orderId.value,
  });

  /** Fahrzeuge des gewählten Auftrags. */
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
    void this.reloadMasterData();
  }

  async reloadMasterData(): Promise<void> {
    this.loadError.set(null);
    try {
      await Promise.all([this.orders.load(), this.fleet.load(), this.codes.load()]);
    } catch (err) {
      this.loadError.set('Stammdaten konnten nicht geladen werden: ' + (err as Error).message);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.snackBar.open('Nicht angemeldet.', 'OK', { duration: 5000 });
      return;
    }
    const raw = this.form.getRawValue();
    const start = combineDateAndTime(raw.date!, raw.startTime);
    const end = combineDateAndTime(raw.date!, raw.endTime);
    if (!start || !end) {
      return;
    }
    const note = raw.note.trim();
    const correctionNote = note ? `Manuell nacherfasst: ${note}` : 'Manuell nacherfasst';

    this.saving.set(true);
    try {
      const { error } = await this.supabase.from('time_entries').insert({
        user_id: userId,
        order_id: raw.orderId,
        vehicle_id: raw.vehicleId,
        commission_code_id: raw.commissionCodeId,
        started_at: start.toISOString(),
        stopped_at: end.toISOString(),
        status: 'closed',
        correction_note: correctionNote,
      });
      if (error) {
        throw new Error(error.message);
      }
      this.snackBar.open('Zeit erfolgreich nacherfasst.', 'OK', { duration: 4000 });
      void this.router.navigate(['/meine-zeiten']);
    } catch (err) {
      this.snackBar.open('Speichern fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 6000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    void this.router.navigate(['/meine-zeiten']);
  }
}
