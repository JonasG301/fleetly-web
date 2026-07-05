import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Customer } from '../../../core/models/customer.model';
import { confirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LoadErrorComponent } from '../../../shared/components/load-error/load-error.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CustomersService } from '../customers.service';
import { CustomerFormComponent } from '../customer-form/customer-form.component';

/** Kundenliste mit Volltextsuche (US-05). */
@Component({
  selector: 'app-customer-list',
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    PageHeaderComponent,
    LoadErrorComponent,
  ],
  template: `
    <app-page-header title="Kundenverwaltung" subtitle="Stammdaten aller Kunden">
      <button matButton="filled" (click)="openForm(null)">
        <mat-icon>add</mat-icon>
        Neuer Kunde
      </button>
    </app-page-header>

    <mat-form-field appearance="outline" class="search">
      <mat-label>Suche (Firma oder Ansprechpartner)</mat-label>
      <input matInput [value]="search()" (input)="search.set($any($event.target).value)" />
      <mat-icon matSuffix>search</mat-icon>
    </mat-form-field>

    @if (service.loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @if (loadError()) {
      <app-load-error [message]="loadError()!" (retry)="load()" />
    }

    <div class="table-scroll">
      <table mat-table [dataSource]="filtered()" class="mat-elevation-z1">
        <ng-container matColumnDef="company_name">
          <th mat-header-cell *matHeaderCellDef>Firma</th>
          <td mat-cell *matCellDef="let c">
            {{ c.company_name }}
            @if (!c.is_active) {
              <span class="inactive">inaktiv</span>
            }
          </td>
        </ng-container>
        <ng-container matColumnDef="contact_name">
          <th mat-header-cell *matHeaderCellDef>Ansprechpartner</th>
          <td mat-cell *matCellDef="let c">{{ c.contact_name ?? '–' }}</td>
        </ng-container>
        <ng-container matColumnDef="phone">
          <th mat-header-cell *matHeaderCellDef>Telefon</th>
          <td mat-cell *matCellDef="let c">{{ c.phone ?? '–' }}</td>
        </ng-container>
        <ng-container matColumnDef="email">
          <th mat-header-cell *matHeaderCellDef>E-Mail</th>
          <td mat-cell *matCellDef="let c">{{ c.email ?? '–' }}</td>
        </ng-container>
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let c" class="actions">
            <button matIconButton (click)="openForm(c)" aria-label="Bearbeiten">
              <mat-icon>edit</mat-icon>
            </button>
            <button matIconButton (click)="remove(c)" aria-label="Löschen">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    </div>

    @if (!service.loading() && !loadError() && filtered().length === 0) {
      <p class="empty">Keine Kunden gefunden.</p>
    }
  `,
  styles: `
    .search {
      width: 100%;
      max-width: 400px;
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;
    }
    .actions {
      white-space: nowrap;
      text-align: right;
    }
    .inactive {
      font-size: 11px;
      color: #9e9e9e;
      border: 1px solid #bdbdbd;
      border-radius: 10px;
      padding: 1px 6px;
      margin-left: 6px;
    }
    .empty {
      text-align: center;
      color: rgba(0, 0, 0, 0.5);
      padding: 32px;
    }
  `,
})
export class CustomerListComponent {
  readonly service = inject(CustomersService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly columns = ['company_name', 'contact_name', 'phone', 'email', 'actions'];
  readonly search = signal('');
  readonly loadError = signal<string | null>(null);

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const all = this.service.customers();
    if (!term) {
      return all;
    }
    return all.filter(
      (c) =>
        c.company_name.toLowerCase().includes(term) ||
        (c.contact_name ?? '').toLowerCase().includes(term),
    );
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.service.load();
    } catch (err) {
      this.loadError.set('Kunden konnten nicht geladen werden: ' + (err as Error).message);
    }
  }

  openForm(customer: Customer | null): void {
    // disableClose: Eingaben sollen nicht durch versehentliches Escape/Backdrop-Klicken verloren gehen.
    this.dialog.open(CustomerFormComponent, { data: customer, disableClose: true });
  }

  async remove(customer: Customer): Promise<void> {
    const ok = await confirmDialog(this.dialog, {
      title: 'Kunde löschen',
      message: `"${customer.company_name}" wirklich löschen? Fahrzeuge und Aufträge bleiben erhalten, wenn keine offenen Aufträge existieren.`,
      confirmLabel: 'Löschen',
      destructive: true,
    });
    if (!ok) {
      return;
    }
    const { error } = await this.service.delete(customer.id);
    if (error) {
      this.snackBar.open(error, 'OK', { duration: 5000 });
    }
  }
}
