import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import { AuthService } from 'auth';
import { startOfMonth } from 'date-fns';
import { SupabaseService } from '../../core/services/supabase.service';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DamageReportService } from '../fleet/damage-report/damage-report.service';
import { FleetService } from '../fleet/fleet.service';
import { calcTuvInfo } from '../fleet/tuv-status/tuv.utils';
import { OrdersService } from '../orders/orders.service';
import {
  DashboardPreferencesService,
  WidgetPref,
} from './dashboard-preferences.service';

interface DashboardCard {
  label: string;
  icon: string;
  route: string;
  color: 'green' | 'brown';
  adminOnly?: boolean;
}

interface KpiDef {
  id: string;
  label: string;
  icon: string;
  route: string;
  format: 'count' | 'duration';
}

/** Einstiegsseite — Kacheln analog zur Flutter-App (_DashboardCard). */
const CARDS: DashboardCard[] = [
  { label: 'Zeit stempeln', icon: 'timer', route: '/zeiterfassung', color: 'green' },
  { label: 'Fuhrpark', icon: 'agriculture', route: '/fuhrpark', color: 'brown' },
  { label: 'TÜV-Status', icon: 'verified', route: '/fuhrpark/tuv', color: 'green' },
  { label: 'Schaden melden', icon: 'report_problem', route: '/schaeden/neu', color: 'brown' },
  { label: 'Meine Zeiten', icon: 'history', route: '/meine-zeiten', color: 'green' },
  { label: 'Aufträge', icon: 'assignment', route: '/auftraege', color: 'brown' },
  { label: 'Kunden', icon: 'business', route: '/kunden', color: 'green', adminOnly: true },
  { label: 'Auswertung', icon: 'bar_chart', route: '/auswertung', color: 'brown', adminOnly: true },
];

const KPIS: KpiDef[] = [
  { id: 'tuv', label: 'TÜV fällig', icon: 'verified', route: '/fuhrpark/tuv', format: 'count' },
  { id: 'damages', label: 'Offene Schäden', icon: 'report_problem', route: '/schaeden', format: 'count' },
  { id: 'orders', label: 'Aktive Aufträge', icon: 'assignment', route: '/auftraege', format: 'count' },
  { id: 'hours', label: 'Meine Stunden (Monat)', icon: 'schedule', route: '/meine-zeiten', format: 'duration' },
];

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    DragDropModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatRippleModule,
    DurationPipe,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      title="Willkommen bei fleetly"
      [subtitle]="'Hallo ' + (auth.user()?.fullName ?? '') + ' – was möchtest du tun?'"
    >
      @if (editMode()) {
        <button mat-button (click)="resetLayout()">
          <mat-icon>restart_alt</mat-icon>
          Zurücksetzen
        </button>
      }
      <button mat-stroked-button (click)="toggleEditMode()">
        <mat-icon>{{ editMode() ? 'check' : 'tune' }}</mat-icon>
        {{ editMode() ? 'Fertig' : 'Anpassen' }}
      </button>
    </app-page-header>

    @if (editMode()) {
      <p class="edit-hint">
        Kacheln per Drag &amp; Drop anordnen, mit dem Auge ein-/ausblenden.
      </p>
    }

    <div
      class="kpi-row"
      cdkDropList
      cdkDropListOrientation="mixed"
      [cdkDropListDisabled]="!editMode()"
      (cdkDropListDropped)="dropKpi($event)"
    >
      @for (w of kpiWidgets(); track w.def.id) {
        <a
          class="kpi"
          cdkDrag
          [class.editing]="editMode()"
          [class.hidden-widget]="w.hidden"
          [routerLink]="editMode() ? null : w.def.route"
          matRipple
          [matRippleDisabled]="editMode()"
        >
          @if (editMode()) {
            <button
              class="hide-btn"
              type="button"
              [attr.aria-label]="w.hidden ? 'Einblenden' : 'Ausblenden'"
              (click)="toggleHidden('kpis', w.def.id)"
            >
              <mat-icon>{{ w.hidden ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          }
          <mat-icon [class.alert]="kpiAlert(w.def.id)">{{ w.def.icon }}</mat-icon>
          <span class="kpi-value">
            @if (w.def.format === 'duration') {
              {{ hoursThisMonth() | duration }}
            } @else {
              {{ kpiValue(w.def.id) }}
            }
          </span>
          <span class="kpi-label">{{ w.def.label }}</span>
        </a>
      }
    </div>

    <div
      class="card-grid"
      cdkDropList
      cdkDropListOrientation="mixed"
      [cdkDropListDisabled]="!editMode()"
      (cdkDropListDropped)="dropCard($event)"
    >
      @for (w of cardWidgets(); track w.def.route) {
        <a
          class="dashboard-card"
          cdkDrag
          [class.brown]="w.def.color === 'brown'"
          [class.editing]="editMode()"
          [class.hidden-widget]="w.hidden"
          [routerLink]="editMode() ? null : w.def.route"
          matRipple
          [matRippleDisabled]="editMode()"
        >
          @if (editMode()) {
            <button
              class="hide-btn"
              type="button"
              [attr.aria-label]="w.hidden ? 'Einblenden' : 'Ausblenden'"
              (click)="toggleHidden('cards', w.def.route)"
            >
              <mat-icon>{{ w.hidden ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          }
          <mat-icon>{{ w.def.icon }}</mat-icon>
          <span>{{ w.def.label }}</span>
        </a>
      }
    </div>
  `,
  styles: `
    .edit-hint {
      margin: -8px 0 16px;
      font-size: 13px;
      color: rgba(0, 0, 0, 0.6);
    }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .kpi {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 18px 12px;
      background: white;
      border-radius: 14px;
      border: 1px solid rgba(0, 0, 0, 0.08);
      text-decoration: none;
      color: inherit;
      transition: transform 0.15s ease;
    }
    .kpi:hover {
      transform: translateY(-2px);
    }
    .kpi mat-icon {
      color: #90a4ae;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }
    .kpi mat-icon.alert {
      color: #e53935;
    }
    .kpi-value {
      font-size: 24px;
      font-weight: 700;
      color: #37474f;
    }
    .kpi-label {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
      text-align: center;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 16px;
    }
    .dashboard-card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 28px 16px;
      background: white;
      border-radius: 18px;
      border: 1px solid rgba(78, 148, 79, 0.18);
      box-shadow: 0 2px 8px rgba(78, 148, 79, 0.12);
      color: #4e944f;
      font-weight: 600;
      text-decoration: none;
      text-align: center;
      transition: transform 0.15s ease;
    }
    .dashboard-card:hover {
      transform: translateY(-2px);
    }
    .dashboard-card.brown {
      border-color: rgba(141, 119, 95, 0.18);
      box-shadow: 0 2px 8px rgba(141, 119, 95, 0.12);
      color: #8d775f;
    }
    mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
    }

    /* ── Bearbeiten-Modus ─────────────────────────────────────────────── */
    .editing {
      cursor: grab;
      border-style: dashed;
    }
    .editing:hover {
      transform: none;
    }
    .editing:active {
      cursor: grabbing;
    }
    .hidden-widget {
      opacity: 0.4;
    }
    .hide-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      border: none;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
      color: rgba(0, 0, 0, 0.45);
      z-index: 1;
    }
    .hide-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: inherit;
    }
    .cdk-drag-preview {
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      opacity: 0.9;
    }
    .cdk-drag-placeholder {
      opacity: 0.25;
    }
    .cdk-drag-animating {
      transition: transform 200ms ease;
    }
  `,
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  private readonly fleet = inject(FleetService);
  private readonly damages = inject(DamageReportService);
  private readonly orders = inject(OrdersService);
  private readonly supabase = inject(SupabaseService);
  private readonly prefs = inject(DashboardPreferencesService);

  private readonly monthSeconds = signal(0);

  readonly editMode = signal(false);

  /** Aktive Fahrzeuge, deren TÜV überfällig oder in ≤30 Tagen fällig ist. */
  readonly tuvDue = computed(
    () =>
      this.fleet
        .vehicles()
        .filter((v) => v.is_active)
        .filter((v) => {
          const s = calcTuvInfo(v.tuv_date, v.is_faster_than_40kmh).status;
          return s === 'expired' || s === 'due_7' || s === 'due_30';
        }).length,
  );

  readonly openDamages = computed(
    () => this.damages.reports().filter((d) => d.status === 'open').length,
  );

  readonly activeOrders = computed(
    () => this.orders.orders().filter((o) => o.status === 'open' || o.status === 'in_progress').length,
  );

  readonly hoursThisMonth = this.monthSeconds.asReadonly();

  /** Gespeicherte Reihenfolge + neue Widgets angehängt, entfernte bereinigt. */
  private readonly kpiPrefs = computed(() =>
    mergeLayout(
      KPIS.map((k) => k.id),
      this.prefs.layout().kpis,
    ),
  );

  private readonly cardPrefs = computed(() =>
    mergeLayout(
      CARDS.filter((c) => !c.adminOnly || this.auth.isAdmin()).map((c) => c.route),
      this.prefs.layout().cards,
    ),
  );

  /** Anzeige-Liste: im Bearbeiten-Modus auch ausgeblendete (gedimmt). */
  readonly kpiWidgets = computed(() =>
    this.kpiPrefs()
      .filter((w) => this.editMode() || !w.hidden)
      .map((w) => ({ def: KPIS.find((k) => k.id === w.id)!, hidden: !!w.hidden })),
  );

  readonly cardWidgets = computed(() =>
    this.cardPrefs()
      .filter((w) => this.editMode() || !w.hidden)
      .map((w) => ({ def: CARDS.find((c) => c.route === w.id)!, hidden: !!w.hidden })),
  );

  constructor() {
    void this.fleet.load();
    void this.damages.load();
    void this.orders.load();
    void this.loadMonthHours();
    void this.prefs.load();
  }

  kpiValue(id: string): number {
    switch (id) {
      case 'tuv':
        return this.tuvDue();
      case 'damages':
        return this.openDamages();
      case 'orders':
        return this.activeOrders();
      default:
        return 0;
    }
  }

  kpiAlert(id: string): boolean {
    return (id === 'tuv' && this.tuvDue() > 0) || (id === 'damages' && this.openDamages() > 0);
  }

  toggleEditMode(): void {
    this.editMode.update((v) => !v);
  }

  // Drop-Indizes beziehen sich auf die gerenderte Liste; im Bearbeiten-Modus
  // (nur dort ist Drag aktiv) werden alle Widgets gerendert → 1:1 zu kpiPrefs.
  dropKpi(event: CdkDragDrop<unknown>): void {
    const list = [...this.kpiPrefs()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    void this.saveLayout(list, this.cardPrefs());
  }

  dropCard(event: CdkDragDrop<unknown>): void {
    const list = [...this.cardPrefs()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    void this.saveLayout(this.kpiPrefs(), list);
  }

  toggleHidden(section: 'kpis' | 'cards', id: string): void {
    const flip = (list: WidgetPref[]) =>
      list.map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w));
    if (section === 'kpis') {
      void this.saveLayout(flip(this.kpiPrefs()), this.cardPrefs());
    } else {
      void this.saveLayout(this.kpiPrefs(), flip(this.cardPrefs()));
    }
  }

  resetLayout(): void {
    void this.prefs.save({ version: 1, kpis: [], cards: [] });
  }

  private saveLayout(kpis: WidgetPref[], cards: WidgetPref[]): Promise<void> {
    return this.prefs.save({ version: 1, kpis, cards });
  }

  private async loadMonthHours(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      return;
    }
    const { data } = await this.supabase
      .from('time_entries')
      .select('duration_seconds')
      .eq('user_id', userId)
      .gte('started_at', startOfMonth(new Date()).toISOString());
    const total = (data ?? []).reduce(
      (sum, e) => sum + ((e as { duration_seconds: number | null }).duration_seconds ?? 0),
      0,
    );
    this.monthSeconds.set(total);
  }
}

/**
 * Vereinigt gespeicherte Reihenfolge mit den aktuellen Defaults:
 * unbekannte (entfernte) Widgets fliegen raus, neue kommen hinten dran.
 */
function mergeLayout(defaultIds: string[], saved: WidgetPref[]): WidgetPref[] {
  const known = new Set(defaultIds);
  const result = saved.filter((w) => known.has(w.id));
  for (const id of defaultIds) {
    if (!result.some((w) => w.id === id)) {
      result.push({ id });
    }
  }
  return result;
}
