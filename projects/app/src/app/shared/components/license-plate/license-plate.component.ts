import { Component, computed, input } from '@angular/core';

const HU_STICKER_COLORS = ['#f5a623', '#f2e14c', '#4a90d9', '#b98ac9', '#7ac142', '#c9c9c9'];

/**
 * Reales deutsches Kfz-Kennzeichen als Plakette (EU-Band, Plaketten-Schrift),
 * statt reinen Textes — Systematik-Direktion: das amtliche Objekt bleibt konkret.
 */
@Component({
  selector: 'app-license-plate',
  template: `
    <span class="plate plate--{{ size() }}">
      <span class="eu-band">
        <span class="stars" aria-hidden="true"></span>
        <span class="d">D</span>
      </span>
      <span class="plate-text">{{ plate() }}</span>
      @if (huMonth() && huYear()) {
        <span class="hu-sticker" [style.background]="stickerColor()">
          <span class="hu-month">{{ huMonth() }}</span>
          <span class="hu-year">{{ huYear() }}</span>
        </span>
      }
    </span>
  `,
  styles: `
    .plate {
      display: inline-flex;
      align-items: stretch;
      border: 1.5px solid #0a0a0a;
      border-radius: var(--hugo-radius-plate, 4px);
      background: #f7f7f2;
      overflow: hidden;
      font-family: 'Arial Narrow', Arial, sans-serif;
      line-height: 1;
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
    }
    .eu-band {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      background: #003399;
      color: #ffffff;
      padding: 2px 3px;
      gap: 2px;
    }
    .stars {
      width: 10px;
      height: 6px;
      background-image: radial-gradient(circle, #ffcc00 0.6px, transparent 0.7px);
      background-size: 3.4px 3.4px;
      background-position: 0 0;
    }
    .d {
      font-weight: 700;
      font-size: 10px;
      letter-spacing: 0;
    }
    .plate-text {
      display: flex;
      align-items: center;
      padding: 0 8px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #0a0a0a;
      white-space: nowrap;
    }
    .hu-sticker {
      align-self: center;
      margin-right: 4px;
      width: 15px;
      height: 15px;
      border-radius: 50%;
      border: 1px solid rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 5px;
      font-weight: 700;
      color: #0a0a0a;
      line-height: 1.1;
    }

    .plate--sm .plate-text {
      font-size: 13px;
      padding: 0 6px;
    }
    .plate--sm .eu-band {
      padding: 1px 2px;
    }
    .plate--sm .d {
      font-size: 8px;
    }
    .plate--md .plate-text {
      font-size: 17px;
    }
    .plate--lg .plate-text {
      font-size: 26px;
      padding: 0 10px;
    }
    .plate--lg .eu-band {
      padding: 3px 5px;
    }
    .plate--lg .d {
      font-size: 14px;
    }
    .plate--lg .stars {
      width: 14px;
      height: 8px;
    }
  `,
})
export class LicensePlateComponent {
  readonly plate = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** Fälligkeitsmonat/-jahr der HU als zweistellige Strings, z.B. "07" / "27" — blendet die Prüfplakette ein. */
  readonly huMonth = input<string | null>(null);
  readonly huYear = input<string | null>(null);

  readonly stickerColor = computed(() => {
    const year = Number(this.huYear());
    if (!Number.isFinite(year)) {
      return HU_STICKER_COLORS[0];
    }
    return HU_STICKER_COLORS[year % HU_STICKER_COLORS.length];
  });
}
