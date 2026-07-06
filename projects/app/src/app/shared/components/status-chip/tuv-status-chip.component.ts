import { Component, computed, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TUV_STATUS_LABELS, TUV_STATUS_TOKENS, TuvInfo } from '../../../features/fleet/tuv-status/tuv.utils';

/** HU-Status als Ampel-Punkt + Kleinschrift-Label (Systematik), statt vollflächiger Pille. */
@Component({
  selector: 'app-tuv-status-chip',
  imports: [MatTooltipModule],
  template: `
    <span class="chip" [matTooltip]="tooltip()">
      <span class="dot" [style.background]="'var(' + colorToken() + ')'"></span>
      <span class="label" [style.color]="'var(' + colorToken() + ')'">{{ label() }}</span>
      @if (info().dueMonthLabel) {
        <span class="due-month hugo-numeric">{{ info().dueMonthLabel }}</span>
      }
    </span>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .label {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .due-month {
      font-size: 12px;
      font-weight: 400;
      color: var(--hugo-ink-muted);
    }
  `,
})
export class TuvStatusChipComponent {
  readonly info = input.required<TuvInfo>();

  readonly colorToken = computed(() => TUV_STATUS_TOKENS[this.info().status]);
  readonly label = computed(() => TUV_STATUS_LABELS[this.info().status]);
  readonly tooltip = computed(() => {
    const d = this.info().daysRemaining;
    if (d === null) {
      return 'Kein HU-Datum hinterlegt';
    }
    return d < 0
      ? `HU seit ${-d} Tag(en) abgelaufen`
      : `Noch ${d} Tag(e) bis Ende des Fälligkeitsmonats`;
  });
}
