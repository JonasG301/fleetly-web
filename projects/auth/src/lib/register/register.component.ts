import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AUTH_CONFIG } from '../auth.config';
import { AuthService } from '../auth.service';

/** Minimales Turnstile-API auf dem globalen Objekt. */
interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void },
  ): string;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Gruppen-Validator: Passwort und Wiederholung müssen übereinstimmen. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('passwordConfirm')?.value;
  return password && confirm && password !== confirm ? { passwordsMismatch: true } : null;
}

/**
 * Registrierung einer NEUEN Firma (Multi-Tenancy-Onboarding): der DB-Trigger
 * legt aus org_name automatisch eine Organisation an und macht den Nutzer zum
 * Admin. E-Mail-Bestätigung ist Pflicht — nach dem Absenden wird der Hinweis
 * "Bitte bestätige deine E-Mail-Adresse" angezeigt.
 */
@Component({
  selector: 'lib-register',
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
    <mat-card class="register-card">
      @if (registered()) {
        <mat-card-content class="success">
          <mat-icon class="success-icon">mark_email_read</mat-icon>
          <h2>Bitte bestätige deine E-Mail-Adresse</h2>
          <p>
            Wir haben dir eine E-Mail an <strong>{{ registeredEmail() }}</strong> geschickt.
            Klicke auf den Link darin, um dein Konto zu aktivieren. Danach kannst du dich
            anmelden.
          </p>
          <button
            matButton
            type="button"
            [disabled]="resendCooldown() > 0"
            (click)="resendConfirmation()"
          >
            @if (resendCooldown() > 0) {
              E-Mail erneut senden ({{ resendCooldown() }}s)
            } @else {
              E-Mail erneut senden
            }
          </button>
          <a matButton routerLink="/login">Zur Anmeldung</a>
        </mat-card-content>
      } @else {
        <mat-card-header>
          <mat-card-title>Firma registrieren</mat-card-title>
          <mat-card-subtitle>Kostenloses Konto für deinen Betrieb anlegen</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Firmenname</mat-label>
              <input matInput formControlName="orgName" autocomplete="organization" />
              @if (form.controls.orgName.hasError('required')) {
                <mat-error>Firmenname ist erforderlich</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Vollständiger Name</mat-label>
              <input matInput formControlName="fullName" autocomplete="name" />
              @if (form.controls.fullName.hasError('required')) {
                <mat-error>Name ist erforderlich</mat-error>
              }
            </mat-form-field>

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

            @if (captchaActive) {
              <div #captchaContainer class="captcha"></div>
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
                Konto erstellen
              }
            </button>
          </form>
        </mat-card-content>
        <mat-card-actions>
          <a matButton routerLink="/login">Bereits ein Konto? Anmelden</a>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    .register-card {
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
    .success {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
      padding: 16px 8px;
    }
    .success-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #4e944f;
    }
    .success h2 {
      margin: 0;
      font-size: 20px;
    }
    .success p {
      margin: 0 0 8px;
      color: rgba(0, 0, 0, 0.6);
    }
  `,
})
export class RegisterComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** Site Key aus der Projekt-Konfiguration; leer = Captcha aus (z. B. lokal). */
  readonly captchaSiteKey = inject(AUTH_CONFIG).captchaSiteKey ?? '';
  /**
   * Captcha ist nur aktiv, wenn ein ECHTER Site Key konfiguriert ist — nicht
   * bei leerem Wert und nicht bei einem unersetzten Build-Platzhalter (z. B.
   * wenn ein Prod-Build ohne gesetzte TURNSTILE_SITE_KEY-Env erzeugt wurde).
   * So sperrt ein fehlkonfiguriertes Captcha die Registrierung niemals dauerhaft.
   */
  readonly captchaActive = !!this.captchaSiteKey && !this.captchaSiteKey.includes('PLACEHOLDER');
  readonly captchaToken = signal('');
  private readonly captchaContainer = viewChild<ElementRef<HTMLElement>>('captchaContainer');

  /** Muss zur Supabase-Konfiguration passen (minimum_password_length). */
  readonly minPasswordLength = 6;

  readonly hidePassword = signal(true);
  readonly hidePasswordConfirm = signal(true);
  readonly submitting = signal(false);
  readonly registered = signal(false);
  readonly registeredEmail = signal('');
  readonly resendCooldown = signal(0);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  readonly form = this.fb.nonNullable.group(
    {
      orgName: ['', Validators.required],
      fullName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(this.minPasswordLength)]],
      passwordConfirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.clearCooldownTimer());
  }

  ngAfterViewInit(): void {
    if (this.captchaActive) {
      void this.loadCaptcha();
    }
  }

  /** Turnstile-Skript nachladen und Widget rendern (nur wenn Site Key gesetzt). */
  private async loadCaptcha(): Promise<void> {
    if (!window.turnstile) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Turnstile konnte nicht geladen werden'));
        document.head.appendChild(script);
      }).catch(() => undefined);
    }
    const el = this.captchaContainer()?.nativeElement;
    if (window.turnstile && el) {
      window.turnstile.render(el, {
        sitekey: this.captchaSiteKey,
        callback: (token) => this.captchaToken.set(token),
        'expired-callback': () => this.captchaToken.set(''),
      });
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    if (this.captchaActive && !this.captchaToken()) {
      this.snackBar.open('Bitte bestätige das Captcha.', 'OK', { duration: 4000 });
      return;
    }
    this.submitting.set(true);
    const { orgName, fullName, email, password } = this.form.getRawValue();
    const { error } = await this.auth.register({
      email,
      password,
      fullName,
      orgName,
      captchaToken: this.captchaToken() || undefined,
    });
    this.submitting.set(false);
    if (error) {
      this.snackBar.open(error, 'OK', { duration: 6000 });
      return;
    }
    this.registeredEmail.set(email);
    this.registered.set(true);
    // Direkt nach dem Signup hat der Server bereits eine Mail verschickt —
    // Resend erst nach Ablauf der 60s-Sperre (max_frequency) erlauben.
    this.startCooldown();
  }

  async resendConfirmation(): Promise<void> {
    if (this.resendCooldown() > 0) {
      return;
    }
    const { error } = await this.auth.resendConfirmation(this.registeredEmail());
    if (error) {
      this.snackBar.open(error, 'OK', { duration: 5000 });
      return;
    }
    this.snackBar.open('Bestätigungs-E-Mail wurde erneut versendet.', 'OK', { duration: 5000 });
    this.startCooldown();
  }

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
