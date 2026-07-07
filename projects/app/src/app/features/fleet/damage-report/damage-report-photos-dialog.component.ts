import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'auth';
import { DamageReport, DamageReportPhoto } from '../../../core/models/damage-report.model';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { FleetService } from '../fleet.service';
import { DamageReportService } from './damage-report.service';
import { VehicleDamageDiagramComponent, VehicleDiagramView } from './vehicle-damage-diagram.component';

interface PhotoView {
  photo: DamageReportPhoto;
  url: string;
}

/** Fotos einer Schadensmeldung ansehen, nachträglich hinzufügen oder löschen. */
@Component({
  selector: 'app-damage-report-photos-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    VehicleDamageDiagramComponent,
  ],
  template: `
    <h2 mat-dialog-title>Details zur Schadensmeldung</h2>
    <mat-dialog-content>
      @if (vehicle(); as v) {
        <div class="diagram-section">
          <label class="section-label">Schadensposition</label>
          @if (report.position_x !== null && report.position_y !== null) {
            <app-vehicle-damage-diagram
              [category]="v.type"
              [view]="positionView()"
              [x]="report.position_x"
              [y]="report.position_y"
            />
          } @else {
            <p class="empty">Keine Position markiert.</p>
          }
        </div>
      }

      <label class="section-label">Fotos</label>
      @if (loading()) {
        <mat-spinner diameter="32" />
      } @else if (photoViews().length === 0) {
        <p class="empty">Noch keine Fotos vorhanden.</p>
      } @else {
        <div class="grid">
          @for (pv of photoViews(); track pv.photo.id) {
            <div class="tile">
              <img [src]="pv.url" alt="Schadensfoto" />
              @if (canDelete(pv.photo)) {
                <button
                  matIconButton
                  type="button"
                  class="remove-btn"
                  (click)="remove(pv)"
                  aria-label="Foto löschen"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              }
            </div>
          }
        </div>
      }

      @if (!network.isOnline()) {
        <p class="hint">Fotos hinzufügen benötigt eine Internetverbindung.</p>
      }
      <input
        #fileInput
        type="file"
        accept="image/*"
        multiple
        hidden
        (change)="onFilesSelected($event)"
      />
      <button
        matButton="outlined"
        type="button"
        [disabled]="!network.isOnline() || uploading()"
        (click)="fileInput.click()"
      >
        <mat-icon>add_a_photo</mat-icon>
        Foto hinzufügen
      </button>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Schließen</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(480px, 80vw);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .tile {
      position: relative;
      width: 120px;
      height: 120px;
    }
    .tile img {
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
    .empty {
      color: var(--hugo-ink-muted);
    }
    .hint {
      font-size: 12px;
      color: var(--hugo-ink-muted);
      margin: 0;
    }
    .diagram-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
    .section-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--hugo-ink-muted);
    }
  `,
})
export class DamageReportPhotosDialogComponent {
  readonly report = inject<DamageReport>(MAT_DIALOG_DATA);
  private readonly service = inject(DamageReportService);
  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fleet = inject(FleetService);
  readonly network = inject(NetworkStatusService);

  readonly vehicle = computed(() => this.fleet.byId(this.report.vehicle_id) ?? null);
  readonly positionView = computed<VehicleDiagramView>(
    () => (this.report.position_view as VehicleDiagramView | null) ?? 'front',
  );
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly photoViews = signal<PhotoView[]>([]);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const photos = await this.service.getPhotos(this.report.id);
      const views = await Promise.all(
        photos.map(async (photo) => ({ photo, url: await this.service.getPhotoUrl(photo.storage_path) })),
      );
      this.photoViews.set(views);
    } catch (err) {
      this.snackBar.open('Fotos konnten nicht geladen werden: ' + (err as Error).message, 'OK', {
        duration: 6000,
      });
    } finally {
      this.loading.set(false);
    }
  }

  canDelete(photo: DamageReportPhoto): boolean {
    const user = this.auth.user();
    return !!user && (this.auth.isAdmin() || photo.uploaded_by === user.id);
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) {
      return;
    }
    this.uploading.set(true);
    try {
      await this.service.uploadPhotos(this.report.id, files);
      await this.load();
    } catch (err) {
      this.snackBar.open('Upload fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 6000,
      });
    } finally {
      this.uploading.set(false);
    }
  }

  async remove(pv: PhotoView): Promise<void> {
    try {
      await this.service.deletePhoto(pv.photo);
      this.photoViews.update((list) => list.filter((p) => p !== pv));
    } catch (err) {
      this.snackBar.open('Löschen fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 6000,
      });
    }
  }
}
