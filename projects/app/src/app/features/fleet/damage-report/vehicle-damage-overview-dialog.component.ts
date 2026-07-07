import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DamageReport } from '../../../core/models/damage-report.model';
import { FleetService } from '../fleet.service';
import { DamageReportPhotosDialogComponent } from './damage-report-photos-dialog.component';
import { DamageReportService } from './damage-report.service';
import { VehicleDamageOverviewComponent } from './vehicle-damage-overview.component';

export interface VehicleDamageOverviewDialogData {
  vehicleId: string;
}

/** Zeigt alle Schäden eines Fahrzeugs auf einmal (Aufruf über den "Details"-Button in der Schadensliste). */
@Component({
  selector: 'app-vehicle-damage-overview-dialog',
  imports: [MatDialogModule, MatButtonModule, VehicleDamageOverviewComponent],
  template: `
    <h2 mat-dialog-title>Schäden — {{ plate() }}</h2>
    <mat-dialog-content>
      <app-vehicle-damage-overview
        [damages]="damages()"
        [category]="category()"
        (damageSelect)="openDamage($event)"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Schließen</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(480px, 80vw);
    }
  `,
})
export class VehicleDamageOverviewDialogComponent {
  private readonly data = inject<VehicleDamageOverviewDialogData>(MAT_DIALOG_DATA);
  private readonly fleet = inject(FleetService);
  private readonly damageService = inject(DamageReportService);
  private readonly dialog = inject(MatDialog);

  readonly vehicle = computed(() => this.fleet.byId(this.data.vehicleId));
  readonly plate = computed(() => this.vehicle()?.plate ?? '–');
  readonly category = computed(() => this.vehicle()?.type ?? null);
  readonly damages = computed<DamageReport[]>(() =>
    this.damageService.reports().filter((d) => d.vehicle_id === this.data.vehicleId),
  );

  openDamage(d: DamageReport): void {
    this.dialog.open(DamageReportPhotosDialogComponent, { data: d });
  }
}
