import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { Material } from '../../core/models/material.model';
import { LoadErrorComponent } from '../../shared/components/load-error/load-error.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MaterialDialogComponent } from './material-dialog.component';
import { MaterialsService } from './materials.service';

/** Admin-Konfiguration des Materialstamms mit Sortierung. */
@Component({
  selector: 'app-material-list',
  imports: [
    CurrencyPipe,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    PageHeaderComponent,
    LoadErrorComponent,
  ],
  template: `
    <app-page-header title="Material" subtitle="Verbrauchsmaterial für die Auftragsabrechnung">
      <button matButton="filled" (click)="openDialog(null)">
        <mat-icon>add</mat-icon>
        Neuer Artikel
      </button>
    </app-page-header>

    @if (service.loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @if (loadError()) {
      <app-load-error [message]="loadError()!" (retry)="load()" />
    }

    <div class="table-scroll">
      <table mat-table [dataSource]="service.materials()" class="mat-elevation-z1">
        <ng-container matColumnDef="position">
          <th mat-header-cell *matHeaderCellDef>Reihenfolge</th>
          <td mat-cell *matCellDef="let m; let i = index" class="position-cell">
            <button matIconButton [disabled]="i === 0" (click)="service.move(m.id, -1)" aria-label="Nach oben">
              <mat-icon>arrow_upward</mat-icon>
            </button>
            <button
              matIconButton
              [disabled]="i === service.materials().length - 1"
              (click)="service.move(m.id, 1)"
              aria-label="Nach unten"
            >
              <mat-icon>arrow_downward</mat-icon>
            </button>
          </td>
        </ng-container>
        <ng-container matColumnDef="name">
          <th mat-header-cell *matHeaderCellDef>Bezeichnung</th>
          <td mat-cell *matCellDef="let m">{{ m.name }}</td>
        </ng-container>
        <ng-container matColumnDef="unit">
          <th mat-header-cell *matHeaderCellDef>Einheit</th>
          <td mat-cell *matCellDef="let m">{{ m.unit }}</td>
        </ng-container>
        <ng-container matColumnDef="unit_price">
          <th mat-header-cell *matHeaderCellDef class="num">Preis / Einheit</th>
          <td mat-cell *matCellDef="let m" class="num">
            {{ m.unit_price | currency: 'EUR' : 'symbol' : '1.2-2' : 'de' }}
          </td>
        </ng-container>
        <ng-container matColumnDef="is_active">
          <th mat-header-cell *matHeaderCellDef>Aktiv</th>
          <td mat-cell *matCellDef="let m">
            <mat-slide-toggle
              [checked]="m.is_active"
              (change)="service.update(m.id, { is_active: $event.checked })"
            />
          </td>
        </ng-container>
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let m" class="actions">
            <button matIconButton (click)="openDialog(m)" aria-label="Bearbeiten">
              <mat-icon>edit</mat-icon>
            </button>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    </div>

    @if (!service.loading() && !loadError() && service.materials().length === 0) {
      <p class="empty">Noch kein Material angelegt.</p>
    }
  `,
  styles: `
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      background: transparent;
    }
    .empty {
      text-align: center;
      color: var(--hugo-ink-muted);
      padding: 32px;
    }
    .position-cell {
      white-space: nowrap;
    }
    .num {
      text-align: right;
    }
    .actions {
      text-align: right;
    }
  `,
})
export class MaterialListComponent {
  readonly service = inject(MaterialsService);
  private readonly dialog = inject(MatDialog);

  readonly columns = ['position', 'name', 'unit', 'unit_price', 'is_active', 'actions'];
  readonly loadError = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.service.load();
    } catch (err) {
      this.loadError.set('Material konnte nicht geladen werden: ' + (err as Error).message);
    }
  }

  openDialog(material: Material | null): void {
    this.dialog.open(MaterialDialogComponent, { data: material });
  }
}
