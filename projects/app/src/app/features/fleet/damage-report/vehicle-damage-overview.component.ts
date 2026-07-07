import { Component, computed, input, output, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { DamageReport } from '../../../core/models/damage-report.model';
import {
  VEHICLE_DIAGRAM_VIEWS,
  VEHICLE_DIAGRAM_VIEW_LABELS,
  VehicleDamageDiagramComponent,
  VehicleDiagramView,
} from './vehicle-damage-diagram.component';

/**
 * Zeigt alle Schäden eines Fahrzeugs auf einmal als Marker auf der
 * Fahrzeug-Silhouette an (statt nur den einen Schaden, den man einzeln
 * geöffnet hat). Da die Silhouette je Ansicht (Front/Heck/Links/Rechts) eine
 * eigene Grafik ist, wird per Toggle zwischen den Ansichten gewechselt;
 * standardmäßig wird die Ansicht mit den meisten markierten Schäden gezeigt.
 */
@Component({
  selector: 'app-vehicle-damage-overview',
  imports: [MatButtonToggleModule, MatIconModule, VehicleDamageDiagramComponent],
  template: `
    <div class="overview">
      <mat-button-toggle-group
        [value]="selectedView()"
        (change)="userSelectedView.set($event.value)"
        aria-label="Fahrzeugansicht"
      >
        @for (v of views; track v) {
          <mat-button-toggle [value]="v">
            {{ viewLabels[v] }}
            @if (countsByView()[v]) {
              <span class="badge">{{ countsByView()[v] }}</span>
            }
          </mat-button-toggle>
        }
      </mat-button-toggle-group>

      <app-vehicle-damage-diagram
        [category]="category()"
        [view]="selectedView()"
        [markers]="markersForView()"
        (markerClick)="onMarkerClick($event)"
      />

      @if (unpositioned().length > 0) {
        <div class="unpositioned">
          <span class="section-label">Ohne markierte Position</span>
          <ul>
            @for (d of unpositioned(); track d.id) {
              <li>
                <button type="button" (click)="damageSelect.emit(d)">
                  {{ d.description }}
                </button>
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: `
    .overview {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      margin-left: 6px;
      border-radius: 8px;
      background: var(--hugo-status-critical, #d32f2f);
      color: white;
      font-size: 10px;
      font-weight: 700;
    }
    .section-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--hugo-ink-muted);
    }
    .unpositioned ul {
      list-style: none;
      margin: 4px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .unpositioned button {
      background: none;
      border: none;
      padding: 0;
      color: var(--hugo-ink);
      text-decoration: underline;
      cursor: pointer;
      font-size: 13px;
      text-align: left;
    }
  `,
})
export class VehicleDamageOverviewComponent {
  readonly damages = input<DamageReport[]>([]);
  readonly category = input<string | null>(null);

  readonly damageSelect = output<DamageReport>();

  readonly views = VEHICLE_DIAGRAM_VIEWS;
  readonly viewLabels = VEHICLE_DIAGRAM_VIEW_LABELS;

  readonly userSelectedView = signal<VehicleDiagramView | null>(null);

  readonly positioned = computed(() =>
    this.damages().filter((d) => d.position_x !== null && d.position_y !== null),
  );
  readonly unpositioned = computed(() =>
    this.damages().filter((d) => d.position_x === null || d.position_y === null),
  );

  readonly countsByView = computed(() => {
    const counts: Record<VehicleDiagramView, number> = {
      side: 0,
      front: 0,
      rear: 0,
      left: 0,
      right: 0,
    };
    for (const d of this.positioned()) {
      const view = (d.position_view as VehicleDiagramView | null) ?? 'front';
      counts[view] = (counts[view] ?? 0) + 1;
    }
    return counts;
  });

  private readonly defaultView = computed<VehicleDiagramView>(() => {
    const counts = this.countsByView();
    let best: VehicleDiagramView = 'front';
    let bestCount = -1;
    for (const v of this.views) {
      if (counts[v] > bestCount) {
        best = v;
        bestCount = counts[v];
      }
    }
    return bestCount > 0 ? best : 'front';
  });

  readonly selectedView = computed(() => this.userSelectedView() ?? this.defaultView());

  readonly markersForView = computed(() =>
    this.positioned()
      .filter((d) => ((d.position_view as VehicleDiagramView | null) ?? 'front') === this.selectedView())
      .map((d) => ({ id: d.id, x: d.position_x!, y: d.position_y! })),
  );

  onMarkerClick(id: string): void {
    const damage = this.damages().find((d) => d.id === id);
    if (damage) {
      this.damageSelect.emit(damage);
    }
  }
}
