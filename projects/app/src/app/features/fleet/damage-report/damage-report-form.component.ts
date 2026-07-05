import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { FleetService } from '../fleet.service';
import { DamageReportService } from './damage-report.service';

/** Schaden melden — offline-fähig, analog ReportNewDamageView der Flutter-App. */
@Component({
  selector: 'app-damage-report-form',
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
  ],
  template: `
    <app-page-header title="Schaden melden" subtitle="Schadensmeldung zu einem Fahrzeug erfassen" />

    <form [formGroup]="form" (ngSubmit)="save()" class="damage-form">
      <mat-form-field appearance="outline">
        <mat-label>Fahrzeug</mat-label>
        <mat-select formControlName="vehicle_id" required>
          @for (v of fleet.vehicles(); track v.id) {
            <mat-option [value]="v.id">{{ v.plate }} — {{ v.make }} {{ v.model }}</mat-option>
          }
        </mat-select>
        <mat-error>Fahrzeug auswählen</mat-error>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Schadensdatum</mat-label>
        <input matInput [matDatepicker]="picker" formControlName="damage_date" required />
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-datepicker #picker />
      </mat-form-field>

      <mat-form-field appearance="outline" class="span-2">
        <mat-label>Schadensbeschreibung</mat-label>
        <textarea matInput formControlName="description" rows="4" required></textarea>
        <mat-error>Beschreibung ist erforderlich</mat-error>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Ort des Schadens</mat-label>
        <input matInput formControlName="location" placeholder="z. B. Feld, Hof, Straße" required />
        <mat-error>Ort ist erforderlich</mat-error>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Gemeldet von</mat-label>
        <input matInput formControlName="reporter_name" required />
        <mat-error>Name ist erforderlich</mat-error>
      </mat-form-field>

      <div class="span-2 actions">
        <button matButton type="button" (click)="back()">Abbrechen</button>
        <button matButton="filled" type="submit" [disabled]="form.invalid || saving()">
          <mat-icon>send</mat-icon>
          Schaden melden
        </button>
      </div>
    </form>
  `,
  styles: `
    .damage-form {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 8px 16px;
      max-width: 700px;
    }
    .span-2 {
      grid-column: 1 / -1;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class DamageReportFormComponent {
  readonly fleet = inject(FleetService);
  private readonly damageService = inject(DamageReportService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  /** Vorauswahl per Query-Param (?fahrzeug=...) von der Fahrzeug-Detailseite. */
  readonly fahrzeug = input<string>();

  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    vehicle_id: ['', Validators.required],
    damage_date: [new Date(), Validators.required],
    description: ['', Validators.required],
    location: ['', Validators.required],
    reporter_name: [this.auth.user()?.fullName ?? '', Validators.required],
  });

  constructor() {
    void this.fleet.load().then(() => {
      const preselect = this.fahrzeug();
      if (preselect && this.fleet.byId(preselect)) {
        this.form.patchValue({ vehicle_id: preselect });
      }
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    try {
      await this.damageService.report({
        vehicle_id: raw.vehicle_id,
        damage_date: raw.damage_date.toISOString().slice(0, 10),
        description: raw.description.trim(),
        location: raw.location.trim(),
        reporter_name: raw.reporter_name.trim(),
        reported_by: this.auth.user()?.id ?? null,
      });
      this.snackBar.open('Schadensmeldung gespeichert', undefined, { duration: 3000 });
      await this.router.navigate(['/schaeden']);
    } catch (err) {
      this.snackBar.open('Fehler: ' + (err as Error).message, 'OK', { duration: 6000 });
    } finally {
      this.saving.set(false);
    }
  }

  back(): void {
    void this.router.navigate(['/schaeden']);
  }
}
