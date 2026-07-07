import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'auth';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { FleetService } from '../fleet.service';
import { DamagePositionFullscreenDialogComponent } from './damage-position-fullscreen-dialog.component';
import { DamageReportService } from './damage-report.service';
import {
  VehicleDamageDiagramComponent,
  VehicleDiagramView,
  VEHICLE_DIAGRAM_VIEWS,
  VEHICLE_DIAGRAM_VIEW_LABELS,
} from './vehicle-damage-diagram.component';

interface PhotoPreview {
  file: File;
  url: string;
}

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
    VehicleDamageDiagramComponent,
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
        <input matInput formControlName="location" placeholder="z. B. Feld, Hof, Straße" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Gemeldet von</mat-label>
        <input matInput formControlName="reporter_name" required />
        <mat-error>Name ist erforderlich</mat-error>
      </mat-form-field>

      @if (selectedVehicle(); as v) {
        <div class="span-2 diagram-section">
          <label class="photos-label">Schadensposition (optional) — auf die Silhouette klicken</label>
          <div class="view-picker">
            @for (v2 of views; track v2) {
              <button
                matButton="outlined"
                type="button"
                [class.active]="selectedView() === v2"
                (click)="selectView(v2)"
              >
                {{ viewLabels[v2] }}
              </button>
            }
            <button matButton="outlined" type="button" (click)="openFullscreen(v.type)">
              <mat-icon>fullscreen</mat-icon>
              Vollbild
            </button>
          </div>
          <app-vehicle-damage-diagram
            [category]="v.type"
            [view]="selectedView()"
            [x]="position()?.x ?? null"
            [y]="position()?.y ?? null"
            [interactive]="true"
            (pick)="position.set($event)"
          />
          @if (position()) {
            <button matButton type="button" (click)="position.set(null)">
              <mat-icon>close</mat-icon>
              Markierung entfernen
            </button>
          }
        </div>
      }

      <div class="span-2 photos">
        <label class="photos-label">Fotos</label>
        @if (!network.isOnline()) {
          <p class="hint">Fotos können nur mit Internetverbindung angehängt werden.</p>
        }
        <div class="photo-picker">
          <button
            matButton="outlined"
            type="button"
            [disabled]="!network.isOnline()"
            (click)="fileInput.click()"
          >
            <mat-icon>add_a_photo</mat-icon>
            Foto hinzufügen
          </button>
          <input
            #fileInput
            type="file"
            accept="image/*"
            multiple
            hidden
            (change)="onFilesSelected($event)"
          />
        </div>
        @if (photos().length > 0) {
          <div class="photo-previews">
            @for (p of photos(); track p.url) {
              <div class="photo-preview">
                <img [src]="p.url" alt="Schadensfoto" />
                <button
                  matIconButton
                  type="button"
                  class="remove-btn"
                  (click)="removePhoto(p)"
                  aria-label="Foto entfernen"
                >
                  <mat-icon>close</mat-icon>
                </button>
              </div>
            }
          </div>
        }
      </div>

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
    .photos,
    .diagram-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
    .photos-label {
      font-size: 12px;
      color: var(--hugo-ink-muted);
    }
    .view-picker {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .view-picker button.active {
      background: color-mix(in srgb, var(--hugo-ink) 12%, transparent);
    }
    .hint {
      font-size: 12px;
      color: var(--hugo-ink-muted);
      margin: 0;
    }
    .photo-previews {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .photo-preview {
      position: relative;
      width: 96px;
      height: 96px;
    }
    .photo-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 8px;
    }
    .remove-btn {
      position: absolute;
      top: -8px;
      right: -8px;
      background: var(--hugo-paper);
      transform: scale(0.75);
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
  private readonly dialog = inject(MatDialog);
  readonly network = inject(NetworkStatusService);

  /** Vorauswahl per Query-Param (?fahrzeug=...) von der Fahrzeug-Detailseite. */
  readonly fahrzeug = input<string>();

  readonly views = VEHICLE_DIAGRAM_VIEWS;
  readonly viewLabels = VEHICLE_DIAGRAM_VIEW_LABELS;

  readonly saving = signal(false);
  readonly photos = signal<PhotoPreview[]>([]);
  readonly position = signal<{ x: number; y: number } | null>(null);
  readonly selectedView = signal<VehicleDiagramView>('front');

  readonly form = this.fb.nonNullable.group({
    vehicle_id: ['', Validators.required],
    damage_date: [new Date(), Validators.required],
    description: ['', Validators.required],
    location: [''],
    reporter_name: [this.auth.user()?.fullName ?? '', Validators.required],
  });

  private readonly selectedVehicleId = toSignal(this.form.controls.vehicle_id.valueChanges, {
    initialValue: '',
  });
  readonly selectedVehicle = computed(() => this.fleet.byId(this.selectedVehicleId()) ?? null);

  constructor() {
    void this.fleet.load().then(() => {
      const preselect = this.fahrzeug();
      if (preselect && this.fleet.byId(preselect)) {
        this.form.patchValue({ vehicle_id: preselect });
      }
    });
    effect(() => {
      this.selectedVehicleId();
      this.position.set(null);
      this.selectedView.set('front');
    });
  }

  /** Perspektive manuell über den View-Picker gewechselt — alte Markierung passt nicht mehr. */
  selectView(view: VehicleDiagramView): void {
    this.selectedView.set(view);
    this.position.set(null);
  }

  openFullscreen(category: string | null): void {
    const ref = this.dialog.open(DamagePositionFullscreenDialogComponent, {
      width: '96vw',
      maxWidth: '96vw',
      height: '90vh',
      maxHeight: '90vh',
      data: {
        category,
        view: this.selectedView(),
        x: this.position()?.x ?? null,
        y: this.position()?.y ?? null,
      },
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.selectedView.set(result.view);
      this.position.set({ x: result.x, y: result.y });
    });
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.photos.update((list) => [
      ...list,
      ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
    input.value = '';
  }

  removePhoto(photo: PhotoPreview): void {
    URL.revokeObjectURL(photo.url);
    this.photos.update((list) => list.filter((p) => p !== photo));
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    try {
      await this.damageService.reportWithPhotos(
        {
          vehicle_id: raw.vehicle_id,
          damage_date: raw.damage_date.toISOString().slice(0, 10),
          description: raw.description.trim(),
          location: raw.location.trim() || null,
          reporter_name: raw.reporter_name.trim(),
          reported_by: this.auth.user()?.id ?? null,
          position_x: this.position()?.x ?? null,
          position_y: this.position()?.y ?? null,
          position_view: this.position() ? this.selectedView() : null,
        },
        this.photos().map((p) => p.file),
      );
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
