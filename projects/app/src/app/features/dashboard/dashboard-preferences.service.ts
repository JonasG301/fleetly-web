import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from 'auth';
import { SupabaseService } from '../../core/services/supabase.service';

/** Position/Größe eines Grid-Widgets (Kennzahl, Termine, Kalender, Links …). */
export interface GridWidgetPref {
  id: string;
  x: number;
  y: number;
  cols: number;
  rows: number;
  hidden?: boolean;
}

/** Ein Eintrag einer internen Liste (z. B. Reihenfolge der Links im "Links"-Widget). */
export interface WidgetPref {
  id: string;
  hidden?: boolean;
}

/** Persistiertes Dashboard-Layout (jsonb-Spalte dashboard_preferences.layout). */
export interface DashboardLayout {
  version: 2;
  items: GridWidgetPref[];
  cards: WidgetPref[];
}

const EMPTY_LAYOUT: DashboardLayout = { version: 2, items: [], cards: [] };

/**
 * Lädt und speichert die persönliche Dashboard-Anordnung (eine Zeile je
 * Nutzer in dashboard_preferences, Upsert auf user_id). Fehler beim
 * Speichern sind nicht kritisch — das Dashboard funktioniert auch mit
 * Default-Layout weiter.
 *
 * Layout-Version 2: frei positionierbares/größenveränderbares Grid (vorher:
 * Version 1 mit reinen Reihenfolgelisten). Ältere gespeicherte Layouts haben
 * keine Grid-Koordinaten und werden beim Laden verworfen — das Dashboard
 * startet dann einmalig wieder mit dem Default-Grid.
 */
@Injectable({ providedIn: 'root' })
export class DashboardPreferencesService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _layout = signal<DashboardLayout>(EMPTY_LAYOUT);
  readonly layout = this._layout.asReadonly();

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      return;
    }
    const { data, error } = await this.supabase
      .from('dashboard_preferences')
      .select('layout')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('Dashboard-Layout konnte nicht geladen werden:', error.message);
      return;
    }
    const layout = data?.layout as Partial<DashboardLayout> | undefined;
    if (layout?.version === 2) {
      this._layout.set({
        version: 2,
        items: layout.items ?? [],
        cards: layout.cards ?? [],
      });
    }
  }

  async save(layout: DashboardLayout): Promise<void> {
    this._layout.set(layout);
    const userId = this.auth.user()?.id;
    if (!userId) {
      return;
    }
    const { error } = await this.supabase
      .from('dashboard_preferences')
      .upsert({ user_id: userId, layout }, { onConflict: 'user_id' });
    if (error) {
      console.warn('Dashboard-Layout konnte nicht gespeichert werden:', error.message);
    }
  }
}
