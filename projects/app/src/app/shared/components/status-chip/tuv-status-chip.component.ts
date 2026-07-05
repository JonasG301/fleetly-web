import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  TUV_STATUS_COLORS,
  TUV_STATUS_LABELS,
  TuvInfo,
} from '../../../features/fleet/tuv-status/tuv.utils';

/** Farbcodierter TÜV-Status (rot/orange/amber/grün/grau) wie in der Flutter-App. */
@Component({
  selector: 'app-tuv-status-chip',
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <span
      class="chip"
      [style.color]="color()"
      [style.background]="color() + '20'"
      [matTooltip]="tooltip()"
    >
      <mat-icon>{{ icon() }}</mat-icon>
      {{ label() }}
      @if (info().dueMonthLabel) {
        <span class="due-month">{{ info().dueMonthLabel }}</span>
      }
    </span>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      border-radius: 14px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .due-month {
      font-weight: 400;
      opacity: 0.85;
    }
  `,
})
export class TuvStatusChipComponent {
  readonly info = input.required<TuvInfo>();

  readonly color = computed(() => TUV_STATUS_COLORS[this.info().status]);
  readonly label = computed(() => TUV_STATUS_LABELS[this.info().status]);
  readonly icon = computed(() => {
    switch (this.info().status) {
      case 'expired':
        return 'error';
      case 'due_7':
        return 'warning';
      case 'due_30':
        return 'schedule';
      case 'valid':
        return 'check_circle';
      default:
        return 'help';
    }
  });
  readonly tooltip = computed(() => {
    const d = this.info().daysRemaining;
    if (d === null) {
      return 'Kein TÜV-Datum hinterlegt';
    }
    return d < 0
      ? `TÜV seit ${-d} Tag(en) abgelaufen`
      : `Noch ${d} Tag(e) bis Ende des Fälligkeitsmonats`;
  });
}
