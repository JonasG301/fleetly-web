import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AuthService, UserRole } from 'auth';
import { Profile } from '../../../core/models/profile.model';
import { SupabaseService } from '../../../core/services/supabase.service';

/**
 * Dialog zum Einladen eines neuen Mitarbeiters in die eigene Organisation.
 * Ruft die Edge Function `invite-user` (Service-Role) auf.
 */
@Component({
  selector: 'app-invite-user-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Nutzer einladen</h2>
    <mat-dialog-content>
      <p class="hint">
        Der oder die Eingeladene erhält eine E-Mail mit einem Link, um ein Passwort zu
        setzen, und wird als Mitarbeiter deiner Organisation angelegt.
      </p>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>E-Mail</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="off" />
          @if (form.controls.email.hasError('required')) {
            <mat-error>E-Mail ist erforderlich</mat-error>
          } @else if (form.controls.email.hasError('email')) {
            <mat-error>Keine gültige E-Mail-Adresse</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Name (optional)</mat-label>
          <input matInput formControlName="fullName" autocomplete="off" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Abbrechen</button>
      <button matButton="filled" type="button" [disabled]="form.invalid || sending()" (click)="submit()">
        @if (sending()) {
          <mat-spinner diameter="20" />
        } @else {
          Einladung senden
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .hint {
      color: var(--hugo-ink-muted);
      font-size: 13px;
      margin-bottom: 12px;
    }
    .full-width {
      width: 100%;
      margin-bottom: 8px;
    }
  `,
})
export class InviteUserDialogComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<InviteUserDialogComponent>);

  readonly sending = signal(false);
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    fullName: [''],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.sending()) {
      return;
    }
    this.sending.set(true);
    const { email, fullName } = this.form.getRawValue();
    const { data, error } = await this.supabase.client.functions.invoke('invite-user', {
      body: { email, full_name: fullName },
    });
    this.sending.set(false);
    if (error || data?.error) {
      // supabase-js liefert bei Non-2xx-Antworten `error.message` nur als generischen
      // Platzhalter ("Edge Function returned a non-2xx status code"); der eigentliche
      // Fehlertext steckt im Response-Body unter `error.context`.
      let message = data?.error ?? error?.message;
      if (!data?.error && error && 'context' in error) {
        try {
          const body = await (error as { context: Response }).context.json();
          message = body?.error ?? message;
        } catch {
          /* Body war kein JSON – generische Meldung beibehalten. */
        }
      }
      this.snackBar.open('Einladung fehlgeschlagen: ' + message, 'OK', {
        duration: 6000,
      });
      return;
    }
    this.snackBar.open(`Einladung an ${email} versendet.`, 'OK', { duration: 4000 });
    this.dialogRef.close(true);
  }
}

/**
 * Nutzerverwaltung (US-02): Mitarbeiter einladen, Rollen ändern, Konten deaktivieren.
 * Einladungen laufen über die Edge Function `invite-user`; das Profil entsteht per
 * DB-Trigger mit der org_id des einladenden Admins.
 */
@Component({
  selector: 'app-user-management',
  imports: [
    MatCardModule,
    MatTableModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Nutzerverwaltung</mat-card-title>
        <span class="spacer"></span>
        <button matButton="filled" (click)="openInvite()">
          <mat-icon>person_add</mat-icon>
          Nutzer einladen
        </button>
      </mat-card-header>
      <mat-card-content>
        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        @if (loadError()) {
          <div class="load-error">
            <mat-icon>error_outline</mat-icon>
            <span>Nutzer konnten nicht geladen werden.</span>
            <button matButton (click)="reload()">Erneut versuchen</button>
          </div>
        } @else {
          <table mat-table [dataSource]="profiles()" class="mat-elevation-z0">
            <ng-container matColumnDef="full_name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let p">{{ p.full_name }}</td>
            </ng-container>
            <ng-container matColumnDef="role">
              <th mat-header-cell *matHeaderCellDef>Rolle</th>
              <td mat-cell *matCellDef="let p">
                <mat-select
                  [value]="p.role"
                  (valueChange)="setRole(p, $event)"
                  [disabled]="p.id === auth.user()?.id"
                  class="role-select"
                >
                  <mat-option value="admin">Administrator</mat-option>
                  <mat-option value="employee">Mitarbeiter</mat-option>
                </mat-select>
              </td>
            </ng-container>
            <ng-container matColumnDef="is_active">
              <th mat-header-cell *matHeaderCellDef>Aktiv</th>
              <td mat-cell *matCellDef="let p">
                <mat-slide-toggle
                  [checked]="p.is_active"
                  [disabled]="p.id === auth.user()?.id"
                  (change)="setActive(p, $event.checked)"
                />
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
          @if (!loading() && profiles().length === 0) {
            <p class="empty">Noch keine weiteren Nutzer. Lade Mitarbeiter über „Nutzer einladen" ein.</p>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    mat-card-header {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    }
    .spacer {
      flex: 1 1 auto;
    }
    table {
      width: 100%;
    }
    .role-select {
      width: 160px;
    }
    .empty {
      color: var(--hugo-ink-muted);
      text-align: center;
      padding: 24px 0;
    }
    .load-error {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 0;
      color: var(--hugo-status-critical);
    }
  `,
})
export class UserManagementComponent {
  private readonly supabase = inject(SupabaseService);
  readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly columns = ['full_name', 'role', 'is_active'];
  readonly profiles = signal<Profile[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);

  constructor() {
    void this.load();
  }

  reload(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    const { data, error } = await this.supabase.from('profiles').select('*').order('full_name');
    this.loading.set(false);
    if (error) {
      this.loadError.set(true);
      return;
    }
    this.profiles.set((data ?? []) as Profile[]);
  }

  openInvite(): void {
    this.dialog
      .open(InviteUserDialogComponent, { width: '420px' })
      .afterClosed()
      .subscribe((invited) => {
        if (invited) {
          void this.load();
        }
      });
  }

  async setRole(profile: Profile, role: UserRole): Promise<void> {
    const { error } = await this.supabase
      .from('profiles')
      .update({ role })
      .eq('id', profile.id);
    this.snackBar.open(
      error ? 'Fehler: ' + error.message : `Rolle von ${profile.full_name} geändert`,
      undefined,
      { duration: 4000 },
    );
    await this.load();
  }

  /** Deaktivieren statt löschen — Daten bleiben erhalten (US-02). */
  async setActive(profile: Profile, isActive: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', profile.id);
    this.snackBar.open(
      error
        ? 'Fehler: ' + error.message
        : `${profile.full_name} ${isActive ? 'aktiviert' : 'deaktiviert'}`,
      undefined,
      { duration: 4000 },
    );
    await this.load();
  }
}
