import { Component, DestroyRef, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../auth.service';

/** Gruppen-Validator: Passwort und Wiederholung müssen übereinstimmen. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('passwordConfirm')?.value;
  return password && confirm && password !== confirm ? { passwordsMismatch: true } : null;
}

/**
 * Abschluss des Passwort-Resets (Bug-Fix): Ziel des Reset-Links aus der E-Mail.
 * Supabase erzeugt über den Recovery-Token eine (temporäre) Session und löst das
 * PASSWORD_RECOVERY-Event aus; der AuthService leitet dann hierher. Hier setzt der
 * Nutzer sein neues Passwort per updateUser().
 */
@Component({
  selector: 'lib-reset-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-card class="reset-card">
      <mat-card-header>
        <mat-card-title>Neues Passwort festlegen</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (!auth.passwordRecovery() && !auth.loading()) {
          <div class="invalid-hint">
            <mat-icon>error_outline</mat-icon>
            <p>
              Dieser Link ist ungültig oder abgelaufen. Bitte fordere über „Passwort
              vergessen?" einen neuen Link an.
            </p>
            <a matButton routerLink="/login">Zur Anmeldung</a>
          </div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Neues Passwort</mat-label>
              <input
                matInput
                [type]="hidePassword() ? 'password' : 'text'"
                formControlName="password"
                autocomplete="new-password"
              />
              <button
                matIconButton
                matSuffix
                type="button"
                (click)="hidePassword.set(!hidePassword())"
                [attr.aria-label]="hidePassword() ? 'Passwort anzeigen' : 'Passwort verbergen'"
              >
                <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
              @if (form.controls.password.hasError('required')) {
                <mat-error>Passwort ist erforderlich</mat-error>
              } @else if (form.controls.password.hasError('minlength')) {
                <mat-error>Mindestens {{ minPasswordLength }} Zeichen</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Passwort wiederholen</mat-label>
              <input
                matInput
                [type]="hidePasswordConfirm() ? 'password' : 'text'"
                formControlName="passwordConfirm"
                autocomplete="new-password"
              />
              <button
                matIconButton
                matSuffix
                type="button"
                (click)="hidePasswordConfirm.set(!hidePasswordConfirm())"
                [attr.aria-label]="
                  hidePasswordConfirm() ? 'Passwort anzeigen' : 'Passwort verbergen'
                "
              >
                <mat-icon>{{ hidePasswordConfirm() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
              @if (form.controls.passwordConfirm.hasError('required')) {
                <mat-error>Wiederholung ist erforderlich</mat-error>
              }
            </mat-form-field>

            @if (form.hasError('passwordsMismatch') && form.controls.passwordConfirm.touched) {
              <p class="mismatch-error">Die Passwörter stimmen nicht überein.</p>
            }

            <button
              matButton="filled"
              class="full-width"
              type="submit"
              [disabled]="form.invalid || submitting()"
            >
              @if (submitting()) {
                <mat-spinner diameter="20" />
              } @else {
                Passwort speichern
              }
            </button>
          </form>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .reset-card {
      max-width: 400px;
      width: 100%;
      margin: 0 auto;
      padding: 8px;
    }
    .full-width {
      width: 100%;
      margin-bottom: 8px;
    }
    mat-card-header {
      margin-bottom: 16px;
    }
    .mismatch-error {
      color: #ba1a1a;
      font-size: 12px;
      margin: -4px 0 12px;
    }
    .invalid-hint {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
    }
    .invalid-hint mat-icon {
      color: #ba1a1a;
      font-size: 40px;
      width: 40px;
      height: 40px;
    }
  `,
})
export class ResetPasswordComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** Muss zur Supabase-Konfiguration passen (minimum_password_length). */
  readonly minPasswordLength = 6;

  readonly hidePassword = signal(true);
  readonly hidePasswordConfirm = signal(true);
  readonly submitting = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(this.minPasswordLength)]],
      passwordConfirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    const { password } = this.form.getRawValue();
    const { error } = await this.auth.updatePassword(password);
    this.submitting.set(false);
    if (error) {
      this.snackBar.open(error, 'OK', { duration: 6000 });
      return;
    }
    this.snackBar.open('Passwort wurde geändert.', 'OK', { duration: 4000 });
    await this.router.navigateByUrl('/');
  }
}
