import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Customer } from '../../../core/models/customer.model';
import { CustomersService } from '../customers.service';

/** Kunden anlegen/bearbeiten als Dialog (US-04, US-05). */
@Component({
  selector: 'app-customer-form',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ customer ? 'Kunde bearbeiten' : 'Neuer Kunde' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="customer-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Firmenname</mat-label>
          <input matInput formControlName="company_name" required />
          @if (form.controls.company_name.hasError('required')) {
            <mat-error>Firmenname ist erforderlich</mat-error>
          }
        </mat-form-field>
        @if (duplicateWarning()) {
          <p class="warning">⚠ Ein Kunde mit diesem Namen existiert bereits.</p>
        }
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Ansprechpartner</mat-label>
          <input matInput formControlName="contact_name" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Adresse</mat-label>
          <textarea matInput formControlName="address" rows="2"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Telefon</mat-label>
          <input matInput formControlName="phone" type="tel" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>E-Mail</mat-label>
          <input matInput formControlName="email" type="email" />
          @if (form.controls.email.hasError('email')) {
            <mat-error>Keine gültige E-Mail-Adresse</mat-error>
          }
        </mat-form-field>
        <mat-checkbox formControlName="is_active">Aktiv</mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Abbrechen</button>
      <button matButton="filled" form="customer-form" type="submit" [disabled]="form.invalid || saving()">
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
      min-width: min(420px, 80vw);
      padding-top: 8px;
    }
    .warning {
      color: #e65100;
      font-size: 13px;
      margin: -4px 0 8px;
    }
  `,
})
export class CustomerFormComponent {
  private readonly service = inject(CustomersService);
  private readonly dialogRef = inject(MatDialogRef<CustomerFormComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly customer = inject<Customer | null>(MAT_DIALOG_DATA);
  readonly saving = signal(false);
  readonly duplicateWarning = signal(false);

  readonly form = this.fb.nonNullable.group({
    company_name: [this.customer?.company_name ?? '', Validators.required],
    contact_name: [this.customer?.contact_name ?? ''],
    address: [this.customer?.address ?? ''],
    phone: [this.customer?.phone ?? ''],
    email: [this.customer?.email ?? '', Validators.email],
    is_active: [this.customer?.is_active ?? true],
  });

  constructor() {
    this.form.controls.company_name.valueChanges.subscribe((name) => {
      this.duplicateWarning.set(this.service.hasDuplicateName(name, this.customer?.id));
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const payload = {
      company_name: raw.company_name.trim(),
      contact_name: raw.contact_name.trim() || null,
      address: raw.address.trim() || null,
      phone: raw.phone.trim() || null,
      email: raw.email.trim() || null,
      is_active: raw.is_active,
    };
    try {
      if (this.customer) {
        await this.service.update(this.customer.id, payload);
      } else {
        await this.service.create(payload);
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
