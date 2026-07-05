import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'auth';
import { environment } from '../../../../environments/environment';
import { PushNotificationService } from '../../../core/services/push-notification.service';
import { SupabaseService } from '../../../core/services/supabase.service';

interface NotificationSettingsRow {
  id?: string;
  user_id: string;
  max_duration_hours: number;
  latest_time: string;
  notify_admin: boolean;
  is_enabled: boolean;
  tuv_reminders_enabled: boolean;
}

/** Benachrichtigungs-Einstellungen (US-18) + TÜV-Erinnerungen + Push-Abo. */
@Component({
  selector: 'app-notification-settings',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Benachrichtigungen</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <form [formGroup]="form" (ngSubmit)="save()" class="settings-form">
          <mat-slide-toggle formControlName="is_enabled">
            Erinnerung bei vergessener Abstempelung
          </mat-slide-toggle>

          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>Maximale Arbeitsdauer</mat-label>
              <input matInput type="number" min="1" max="24" formControlName="max_duration_hours" />
              <span matTextSuffix>Stunden</span>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Späteste Uhrzeit</mat-label>
              <input matInput type="time" formControlName="latest_time" />
            </mat-form-field>
          </div>

          <mat-slide-toggle formControlName="notify_admin">
            Admin erhält eine Kopie der Benachrichtigung
          </mat-slide-toggle>

          <mat-slide-toggle formControlName="tuv_reminders_enabled">
            TÜV-Erinnerungen erhalten (30/7/1 Tage vor Fälligkeit)
          </mat-slide-toggle>

          <div class="actions">
            <button matButton="filled" type="submit" [disabled]="form.invalid || saving()">
              Speichern
            </button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>

    <mat-card class="push-card">
      <mat-card-header>
        <mat-card-title>Push-Benachrichtigungen auf diesem Gerät</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (!push.isSupported) {
          <p class="hint">
            Push wird von diesem Browser nicht unterstützt oder der Service Worker ist im
            Dev-Modus deaktiviert. Auf iOS ab 16.4 muss die App zuerst zum Homescreen
            hinzugefügt werden.
          </p>
        } @else {
          <p class="hint">
            Aktiviere Push, um Erinnerungen auch bei geschlossener App zu erhalten.
          </p>
          <button matButton="filled" (click)="enablePush()" [disabled]="subscribing()">
            <mat-icon>notifications_active</mat-icon>
            Push aktivieren
          </button>
          <button matButton (click)="push.unsubscribe()">Push deaktivieren</button>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 12px;
      max-width: 560px;
    }
    .row {
      display: flex;
      gap: 12px;
    }
    .row > * {
      flex: 1;
    }
    .push-card {
      margin-top: 16px;
    }
    .hint {
      color: rgba(0, 0, 0, 0.6);
      font-size: 13px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class NotificationSettingsComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  readonly push = inject(PushNotificationService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly saving = signal(false);
  readonly subscribing = signal(false);
  readonly loading = signal(true);

  readonly form = this.fb.nonNullable.group({
    is_enabled: [true],
    max_duration_hours: [10, [Validators.required, Validators.min(1), Validators.max(24)]],
    latest_time: ['20:00', Validators.required],
    notify_admin: [false],
    tuv_reminders_enabled: [true],
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const { data } = await this.supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (data) {
        const row = data as NotificationSettingsRow;
        this.form.patchValue({
          is_enabled: row.is_enabled,
          max_duration_hours: row.max_duration_hours,
          latest_time: row.latest_time.slice(0, 5),
          notify_admin: row.notify_admin,
          tuv_reminders_enabled: row.tuv_reminders_enabled,
        });
      }
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    try {
      const { error } = await this.supabase
        .from('notification_settings')
        .upsert({ user_id: userId, ...raw }, { onConflict: 'user_id' });
      if (error) {
        throw new Error(error.message);
      }
      this.snackBar.open('Einstellungen gespeichert', undefined, { duration: 3000 });
    } catch (err) {
      this.snackBar.open('Speichern fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 5000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  async enablePush(): Promise<void> {
    this.subscribing.set(true);
    try {
      const vapidKey = (environment as { vapidPublicKey?: string }).vapidPublicKey;
      if (!vapidKey) {
        this.snackBar.open(
          'Kein VAPID-Key konfiguriert — Push wird beim Deployment eingerichtet.',
          'OK',
          { duration: 5000 },
        );
        return;
      }
      const ok = await this.push.subscribe(vapidKey);
      this.snackBar.open(
        ok ? 'Push aktiviert' : 'Push konnte nicht aktiviert werden',
        undefined,
        { duration: 4000 },
      );
    } finally {
      this.subscribing.set(false);
    }
  }
}
