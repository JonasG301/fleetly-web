import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { CommissionCode } from '../../core/models/commission-code.model';
import { LoadErrorComponent } from '../../shared/components/load-error/load-error.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { CommissionCodeDialogComponent } from './commission-code-dialog.component';
import { CommissionCodesService } from './commission-codes.service';

/** Admin-Konfiguration der Kommissionsnummern mit Sortierung (US-13). */
@Component({
  selector: 'app-commission-code-list',
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    PageHeaderComponent,
    LoadErrorComponent,
  ],
  template: `
    <app-page-header
      title="Kommissionsnummern"
      subtitle="Tätigkeitskategorien für die Zeiterfassung"
    >
      <button matButton="filled" (click)="openDialog(null)">
        <mat-icon>add</mat-icon>
        Neue Kommissionsnummer
      </button>
    </app-page-header>

    @if (service.loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @if (loadError()) {
      <app-load-error [message]="loadError()!" (retry)="load()" />
    }

    <div class="table-scroll">
    <table mat-table [dataSource]="service.codes()" class="mat-elevation-z1">
      <ng-container matColumnDef="position">
        <th mat-header-cell *matHeaderCellDef>Reihenfolge</th>
        <td mat-cell *matCellDef="let c; let i = index" class="position-cell">
          <button matIconButton [disabled]="i === 0" (click)="service.move(c.id, -1)" aria-label="Nach oben">
            <mat-icon>arrow_upward</mat-icon>
          </button>
          <button
            matIconButton
            [disabled]="i === service.codes().length - 1"
            (click)="service.move(c.id, 1)"
            aria-label="Nach unten"
          >
            <mat-icon>arrow_downward</mat-icon>
          </button>
        </td>
      </ng-container>
      <ng-container matColumnDef="code">
        <th mat-header-cell *matHeaderCellDef>Kürzel</th>
        <td mat-cell *matCellDef="let c">
          <span class="code-chip" [style.background]="c.color + '22'" [style.color]="c.color">
            {{ c.code }}
          </span>
        </td>
      </ng-container>
      <ng-container matColumnDef="label">
        <th mat-header-cell *matHeaderCellDef>Bezeichnung</th>
        <td mat-cell *matCellDef="let c">{{ c.label }}</td>
      </ng-container>
      <ng-container matColumnDef="description">
        <th mat-header-cell *matHeaderCellDef>Beschreibung</th>
        <td mat-cell *matCellDef="let c">{{ c.description ?? '–' }}</td>
      </ng-container>
      <ng-container matColumnDef="is_active">
        <th mat-header-cell *matHeaderCellDef>Aktiv</th>
        <td mat-cell *matCellDef="let c">
          <mat-slide-toggle
            [checked]="c.is_active"
            (change)="service.update(c.id, { is_active: $event.checked })"
          />
        </td>
      </ng-container>
      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef></th>
        <td mat-cell *matCellDef="let c" class="actions">
          <button matIconButton (click)="openDialog(c)" aria-label="Bearbeiten">
            <mat-icon>edit</mat-icon>
          </button>
        </td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
    </table>
    </div>

    @if (!service.loading() && !loadError() && service.codes().length === 0) {
      <p class="empty">Noch keine Kommissionsnummern angelegt.</p>
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
    .code-chip {
      font-weight: 700;
      font-size: 12px;
      padding: 3px 10px;
      border-radius: 12px;
    }
    .actions {
      text-align: right;
    }
  `,
})
export class CommissionCodeListComponent {
  readonly service = inject(CommissionCodesService);
  private readonly dialog = inject(MatDialog);

  readonly columns = ['position', 'code', 'label', 'description', 'is_active', 'actions'];
  readonly loadError = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.service.load();
    } catch (err) {
      this.loadError.set(
        'Kommissionsnummern konnten nicht geladen werden: ' + (err as Error).message,
      );
    }
  }

  openDialog(code: CommissionCode | null): void {
    this.dialog.open(CommissionCodeDialogComponent, { data: code });
  }
}
