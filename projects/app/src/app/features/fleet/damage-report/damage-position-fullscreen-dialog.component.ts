import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import {
  VehicleDamageDiagramComponent,
  VehicleDiagramView,
  VEHICLE_DIAGRAM_VIEWS,
  VEHICLE_DIAGRAM_VIEW_LABELS,
} from './vehicle-damage-diagram.component';

export interface DamagePositionDialogData {
  category: string | null;
  view: VehicleDiagramView;
  x: number | null;
  y: number | null;
}

export interface DamagePositionDialogResult {
  view: VehicleDiagramView;
  x: number;
  y: number;
}

/** Vollbild-Ansicht der Fahrzeug-Silhouette zum präzisen Markieren der Schadensposition. */
@Component({
  selector: 'app-damage-position-fullscreen-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, VehicleDamageDiagramComponent],
  template: `
    <h2 mat-dialog-title>Schadensposition markieren</h2>
    <mat-dialog-content>
      <div class="view-picker">
        @for (v of views; track v) {
          <button
            matButton="outlined"
            type="button"
            [class.active]="selectedView() === v"
            (click)="selectedView.set(v)"
          >
            {{ viewLabels[v] }}
          </button>
        }
      </div>
      <div class="diagram-wrap">
        <app-vehicle-damage-diagram
          [category]="data.category"
          [view]="selectedView()"
          [x]="position()?.x ?? null"
          [y]="position()?.y ?? null"
          [interactive]="true"
          [fill]="true"
          (pick)="position.set($event)"
        />
      </div>
      @if (position()) {
        <button matButton type="button" (click)="position.set(null)">
          <mat-icon>close</mat-icon>
          Markierung entfernen
        </button>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Abbrechen</button>
      <button matButton="filled" type="button" [disabled]="!position()" (click)="apply()">
        Übernehmen
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
    }
    .view-picker {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .view-picker button.active {
      background: color-mix(in srgb, var(--hugo-ink) 12%, transparent);
    }
    .diagram-wrap {
      flex: 1;
      width: 100%;
      display: flex;
      min-height: 0;
    }
    /* stretch (Default von align-items) lässt die Komponente die volle Höhe
       von diagram-wrap einnehmen, flex:1 die volle Breite — zusammen mit
       [fill]="true" nutzt die Silhouette so den kompletten verfügbaren Platz. */
    .diagram-wrap app-vehicle-damage-diagram {
      flex: 1;
      min-height: 0;
    }
  `,
})
export class DamagePositionFullscreenDialogComponent {
  readonly data = inject<DamagePositionDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<DamagePositionFullscreenDialogComponent>);

  readonly views = VEHICLE_DIAGRAM_VIEWS;
  readonly viewLabels = VEHICLE_DIAGRAM_VIEW_LABELS;

  readonly selectedView = signal<VehicleDiagramView>(this.data.view);
  readonly position = signal<{ x: number; y: number } | null>(
    this.data.x !== null && this.data.y !== null ? { x: this.data.x, y: this.data.y } : null,
  );

  apply(): void {
    const pos = this.position();
    if (!pos) return;
    const result: DamagePositionDialogResult = { view: this.selectedView(), x: pos.x, y: pos.y };
    this.dialogRef.close(result);
  }
}
