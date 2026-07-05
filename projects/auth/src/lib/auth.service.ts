import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './auth.config';
import { mapAuthError } from './auth-error';
import { AuthUser, UserRole } from './models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly router = inject(Router);

  private readonly _session = signal<Session | null>(null);
  private readonly _user = signal<AuthUser | null>(null);
  private readonly _loading = signal(true);
  private readonly _passwordRecovery = signal(false);

  readonly session = this._session.asReadonly();
  readonly user = this._user.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'admin');
  /** True, solange der Nutzer über einen Passwort-Reset-Link angemeldet ist. */
  readonly passwordRecovery = this._passwordRecovery.asReadonly();

  /** Aufgelöst, sobald die initiale Session-Wiederherstellung abgeschlossen ist. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.restoreSession();
    this.supabase.auth.onAuthStateChange((event, session) => {
      this._session.set(session);
      if (event === 'PASSWORD_RECOVERY') {
        // Nutzer kommt über den Reset-Link aus der E-Mail: neues Passwort setzen.
        this._passwordRecovery.set(true);
        void this.router.navigateByUrl('/passwort-neu');
      }
      if (!session) {
        this._user.set(null);
      }
    });
  }

  private async restoreSession(): Promise<void> {
    try {
      const { data } = await this.supabase.auth.getSession();
      this._session.set(data.session);
      if (data.session) {
        await this.loadProfile(data.session);
      }
    } finally {
      this._loading.set(false);
    }
  }

  private async loadProfile(session: Session): Promise<void> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('full_name, role, is_active')
      .eq('id', session.user.id)
      .single();
    if (error || !data || !data['is_active']) {
      // Deaktivierte Konten dürfen sich nicht einloggen (US-02)
      await this.supabase.auth.signOut();
      this._user.set(null);
      return;
    }
    this._user.set({
      id: session.user.id,
      email: session.user.email ?? null,
      fullName: data['full_name'] as string,
      role: data['role'] as UserRole,
      isActive: true,
    });
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ error: string | null; emailNotConfirmed?: boolean }> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return {
        error: mapAuthError(error.message),
        emailNotConfirmed:
          error.code === 'email_not_confirmed' ||
          error.message.toLowerCase().includes('email not confirmed'),
      };
    }
    this._session.set(data.session);
    await this.loadProfile(data.session!);
    if (!this._user()) {
      return { error: 'Dieses Konto ist deaktiviert.' };
    }
    return { error: null };
  }

  /**
   * Registriert eine neue Firma (Multi-Tenancy): der DB-Trigger legt anhand
   * von options.data.org_name automatisch eine Organisation an und macht den
   * Nutzer zu deren Admin. E-Mail-Bestätigung ist Pflicht — nach dem Signup
   * existiert daher i. d. R. noch KEINE Session (needsConfirmation = true).
   */
  async register(params: {
    email: string;
    password: string;
    fullName: string;
    orgName: string;
    captchaToken?: string;
  }): Promise<{ error: string | null; needsConfirmation: boolean }> {
    const { data, error } = await this.supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: { full_name: params.fullName, org_name: params.orgName },
        emailRedirectTo: `${location.origin}/login`,
        captchaToken: params.captchaToken,
      },
    });
    if (error) {
      return { error: mapAuthError(error.message), needsConfirmation: false };
    }
    // Supabase liefert bei bereits registrierter E-Mail (mit Bestätigungspflicht)
    // KEINEN Fehler, sondern einen Fake-User ohne Identities — hier erkennen.
    if (data.user && data.user.identities?.length === 0) {
      return {
        error: 'Für diese E-Mail-Adresse existiert bereits ein Konto.',
        needsConfirmation: false,
      };
    }
    return { error: null, needsConfirmation: !data.session };
  }

  /** Bestätigungs-E-Mail erneut senden (Server erlaubt max. alle 60 Sekunden). */
  async resendConfirmation(email: string): Promise<{ error: string | null }> {
    const { error } = await this.supabase.auth.resend({ type: 'signup', email });
    return { error: error ? mapAuthError(error.message) : null };
  }

  async logout(): Promise<void> {
    await this.supabase.auth.signOut();
    this._session.set(null);
    this._user.set(null);
    this._passwordRecovery.set(false);
  }

  async resetPassword(email: string): Promise<{ error: string | null }> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/passwort-neu`,
    });
    return { error: error ? mapAuthError(error.message) : null };
  }

  /** Setzt das Passwort der aktuellen (Recovery-)Session neu. */
  async updatePassword(password: string): Promise<{ error: string | null }> {
    const { data, error } = await this.supabase.auth.updateUser({ password });
    if (error) {
      return { error: mapAuthError(error.message) };
    }
    this._passwordRecovery.set(false);
    // Profil laden, damit der Nutzer direkt eingeloggt weiterarbeiten kann.
    const { data: sessionData } = await this.supabase.auth.getSession();
    if (sessionData.session) {
      this._session.set(sessionData.session);
      await this.loadProfile(sessionData.session);
    }
    return { error: null };
  }
}
