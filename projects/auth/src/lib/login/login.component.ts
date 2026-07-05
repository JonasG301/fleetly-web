import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../auth.service';

@Component({
  selector: 'lib-login',
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
    <mat-card class="login-card">
      <mat-card-header>
        <mat-card-title>Anmelden</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>E-Mail</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" />
            @if (form.controls.email.hasError('required')) {
              <mat-error>E-Mail ist erforderlich</mat-error>
            } @else if (form.controls.email.hasError('email')) {
              <mat-error>Keine gültige E-Mail-Adresse</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Passwort</mat-label>
            <input
              matInput
              [type]="hidePassword() ? 'password' : 'text'"
              formControlName="password"
              autocomplete="current-password"
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
            }
          </mat-form-field>

          @if (emailNotConfirmed()) {
            <div class="confirm-hint">
              <mat-icon>mark_email_unread</mat-icon>
              <div>
                <p>
                  Deine E-Mail-Adresse ist noch nicht bestätigt. Bitte klicke auf den Link in
                  der Bestätigungs-E-Mail.
                </p>
                <button
                  matButton
                  type="button"
                  [disabled]="resendCooldown() > 0"
                  (click)="resendConfirmation()"
                >
                  @if (resendCooldown() > 0) {
                    Erneut senden ({{ resendCooldown() }}s)
                  } @else {
                    Bestätigungsmail erneut senden
                  }
                </button>
              </div>
            </div>
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
              Einloggen
            }
          </button>
        </form>
      </mat-card-content>
      <mat-card-actions class="actions">
        <button matButton type="button" (click)="forgotPassword()">Passwort vergessen?</button>
        <a matButton routerLink="/registrieren">Noch kein Konto? Registrieren</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .login-card {
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
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px;
    }
    .confirm-hint {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      background: #fff8e1;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .confirm-hint mat-icon {
      color: #f9a825;
      flex-shrink: 0;
    }
    .confirm-hint p {
      margin: 4px 0 8px;
      font-size: 13px;
    }
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly hidePassword = signal(true);
  readonly submitting = signal(false);
  readonly emailNotConfirmed = signal(false);
  readonly resendCooldown = signal(0);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clearCooldownTimer());
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    const { error, emailNotConfirmed } = await this.auth.login(email, password);
    this.submitting.set(false);
    if (error) {
      this.emailNotConfirmed.set(!!emailNotConfirmed);
      this.snackBar.open(error, 'OK', { duration: 5000 });
      return;
    }
    this.emailNotConfirmed.set(false);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    await this.router.navigateByUrl(returnUrl);
  }

  async resendConfirmation(): Promise<void> {
    const email = this.form.controls.email.value;
    if (!email || this.resendCooldown() > 0) {
      return;
    }
    const { error } = await this.auth.resendConfirmation(email);
    if (error) {
      this.snackBar.open(error, 'OK', { duration: 5000 });
      return;
    }
    this.snackBar.open('Bestätigungs-E-Mail wurde erneut versendet.', 'OK', { duration: 5000 });
    this.startCooldown();
  }

  async forgotPassword(): Promise<void> {
    const email = this.form.controls.email.value;
    if (!email) {
      this.snackBar.open('Bitte zuerst die E-Mail-Adresse eingeben.', 'OK', { duration: 4000 });
      return;
    }
    const { error } = await this.auth.resetPassword(email);
    this.snackBar.open(
      error ?? 'Reset-Mail wurde versendet. Bitte prüfe dein Postfach.',
      'OK',
      { duration: 5000 },
    );
  }

  /** Server erlaubt Resend max. alle 60s (max_frequency) — UI-seitig sperren. */
  private startCooldown(): void {
    this.resendCooldown.set(60);
    this.clearCooldownTimer();
    this.cooldownTimer = setInterval(() => {
      const next = this.resendCooldown() - 1;
      this.resendCooldown.set(next);
      if (next <= 0) {
        this.clearCooldownTimer();
      }
    }, 1000);
  }

  private clearCooldownTimer(): void {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }
}
