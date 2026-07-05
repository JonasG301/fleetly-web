import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'auth';
import { ORDER_STATUS_LABELS, OrderStatus } from '../../../core/models/order.model';
import { CustomersService } from '../../customers/customers.service';
import { FleetService } from '../../fleet/fleet.service';
import { OrderWithVehicles, OrdersService } from '../orders.service';

/**
 * Auftragspipeline: Kanban-Board mit einer Spalte je Status. Zeigt auf einen
 * Blick, welche Aufträge offen bzw. in Bearbeitung sind. Admins verschieben
 * Karten per Drag & Drop zwischen den Spalten (Statuswechsel); abgeschlossene
 * Aufträge sind schreibgeschützt und daher nicht verschiebbar (US-09).
 */
@Component({
  selector: 'app-order-pipeline',
  imports: [DatePipe, MatIconModule, CdkDropList, CdkDrag],
  template: `
    <div class="board">
      @for (col of columns; track col) {
        <div class="column" [class]="'column-' + col">
          <div class="column-header">
            <span class="column-title">{{ statusLabels[col] }}</span>
            <span class="column-count">{{ byStatus()[col].length }}</span>
          </div>
          <div
            class="column-body"
            cdkDropList
            [id]="col"
            [cdkDropListData]="byStatus()[col]"
            [cdkDropListConnectedTo]="columns"
            [cdkDropListDisabled]="!auth.isAdmin()"
            (cdkDropListDropped)="drop($event)"
          >
            @for (o of byStatus()[col]; track o.id) {
              <div
                class="card"
                cdkDrag
                [cdkDragDisabled]="o.status === 'done'"
                (click)="cardClick.emit(o)"
              >
                <div class="card-head">
                  <span class="order-number">{{ o.order_number }}</span>
                  @if (auth.isAdmin() && o.status !== 'done') {
                    <mat-icon class="drag-hint">drag_indicator</mat-icon>
                  }
                </div>
                <div class="customer">{{ customerName(o) }}</div>
                @if (o.description) {
                  <div class="description">{{ o.description }}</div>
                }
                @if (o.vehicle_ids.length > 0) {
                  <div class="meta">
                    <mat-icon inline>local_shipping</mat-icon>
                    {{ plates(o) }}
                  </div>
                }
                <div class="meta">
                  <mat-icon inline>event</mat-icon>
                  {{ o.start_date ? (o.start_date | date: 'dd.MM.yy') : '–' }} –
                  {{ o.end_date ? (o.end_date | date: 'dd.MM.yy') : 'offen' }}
                </div>
              </div>
            } @empty {
              <p class="column-empty">Keine Aufträge</p>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .board {
      display: grid;
      grid-template-columns: repeat(3, minmax(220px, 1fr));
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 800px) {
      .board {
        grid-template-columns: 1fr;
      }
    }
    .column {
      background: #f5f5f5;
      border-radius: 8px;
      border-top: 4px solid transparent;
    }
    .column-open {
      border-top-color: #1565c0;
    }
    .column-in_progress {
      border-top-color: #e65100;
    }
    .column-done {
      border-top-color: #2e7d32;
    }
    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 8px;
    }
    .column-title {
      font-weight: 600;
    }
    .column-count {
      font-size: 12px;
      font-weight: 600;
      background: rgba(0, 0, 0, 0.08);
      border-radius: 12px;
      padding: 2px 8px;
    }
    .column-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 4px 8px 8px;
      min-height: 80px;
    }
    .card {
      background: white;
      border-radius: 6px;
      padding: 10px 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
      cursor: pointer;
    }
    .card.cdk-drag-preview {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    .card.cdk-drag-placeholder {
      opacity: 0.3;
    }
    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .order-number {
      font-weight: 600;
    }
    .drag-hint {
      color: rgba(0, 0, 0, 0.3);
      cursor: grab;
    }
    .customer {
      font-size: 13px;
      color: rgba(0, 0, 0, 0.7);
    }
    .description {
      font-size: 13px;
      color: rgba(0, 0, 0, 0.55);
      margin-top: 4px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.55);
      margin-top: 6px;
    }
    .column-empty {
      text-align: center;
      font-size: 13px;
      color: rgba(0, 0, 0, 0.4);
      margin: 16px 0;
    }
  `,
})
export class OrderPipelineComponent {
  readonly auth = inject(AuthService);
  private readonly service = inject(OrdersService);
  private readonly customers = inject(CustomersService);
  private readonly fleet = inject(FleetService);
  private readonly snackBar = inject(MatSnackBar);

  /** Bereits gefilterte Aufträge (Filter kommen aus der Auftragsliste). */
  readonly orders = input.required<OrderWithVehicles[]>();
  readonly cardClick = output<OrderWithVehicles>();

  readonly columns: OrderStatus[] = ['open', 'in_progress', 'done'];
  readonly statusLabels = ORDER_STATUS_LABELS;

  readonly byStatus = computed<Record<OrderStatus, OrderWithVehicles[]>>(() => {
    const groups: Record<OrderStatus, OrderWithVehicles[]> = {
      open: [],
      in_progress: [],
      done: [],
    };
    for (const o of this.orders()) {
      groups[o.status].push(o);
    }
    return groups;
  });

  customerName(o: OrderWithVehicles): string {
    return this.customers.customers().find((c) => c.id === o.customer_id)?.company_name ?? '–';
  }

  plates(o: OrderWithVehicles): string {
    return o.vehicle_ids.map((id) => this.fleet.byId(id)?.plate ?? '?').join(', ');
  }

  async drop(event: CdkDragDrop<OrderWithVehicles[]>): Promise<void> {
    if (event.previousContainer === event.container) {
      return;
    }
    const order = event.previousContainer.data[event.previousIndex];
    const newStatus = event.container.id as OrderStatus;
    // Optimistisch verschieben, damit die Karte nicht zurückspringt
    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );
    try {
      await this.service.setStatus(order.id, newStatus);
      this.snackBar.open(
        `Auftrag ${order.order_number}: ${this.statusLabels[newStatus]}`,
        undefined,
        { duration: 3000 },
      );
    } catch (err) {
      await this.service.load();
      this.snackBar.open(
        'Statuswechsel fehlgeschlagen: ' + (err as Error).message,
        'OK',
        { duration: 5000 },
      );
    }
  }
}
