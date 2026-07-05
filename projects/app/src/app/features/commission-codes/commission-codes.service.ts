import { Injectable, computed, inject, signal } from '@angular/core';
import { CommissionCode, CommissionCodeInsert } from '../../core/models/commission-code.model';
import { MasterDataCacheService } from '../../core/services/master-data-cache.service';
import { SupabaseService } from '../../core/services/supabase.service';

@Injectable({ providedIn: 'root' })
export class CommissionCodesService {
  private readonly supabase = inject(SupabaseService);
  private readonly cache = inject(MasterDataCacheService);

  private readonly _codes = signal<CommissionCode[]>([]);
  private readonly _loading = signal(false);
  private readonly _loadError = signal<string | null>(null);

  readonly codes = this._codes.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** Nicht-null, wenn das Laden fehlgeschlagen ist UND kein Cache-Stand einspringen konnte. */
  readonly loadError = this._loadError.asReadonly();
  /** Nur aktive, in Anzeige-Reihenfolge — für die Stempel-Auswahl (US-12). */
  readonly activeCodes = computed(() => this._codes().filter((c) => c.is_active));

  async load(): Promise<void> {
    this._loading.set(true);
    this._loadError.set(null);
    try {
      const { data, error } = await this.supabase
        .from('commission_codes')
        .select('*')
        .order('position');
      if (error) {
        throw new Error(error.message);
      }
      this._codes.set((data ?? []) as CommissionCode[]);
      void this.cache.put('commission_codes', data ?? []);
    } catch (err) {
      const cached = await this.cache.get<CommissionCode>('commission_codes');
      if (cached && cached.length > 0) {
        this._codes.set(cached);
      } else {
        this._loadError.set(
          'Kommissionsnummern konnten nicht geladen werden: ' + (err as Error).message,
        );
      }
    } finally {
      this._loading.set(false);
    }
  }

  async create(code: CommissionCodeInsert): Promise<void> {
    const { error } = await this.supabase.from('commission_codes').insert(code);
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
  }

  async update(id: string, changes: Partial<CommissionCodeInsert>): Promise<void> {
    const { error } = await this.supabase.from('commission_codes').update(changes).eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
  }

  /** Position tauschen (Sortierung per Auf/Ab, US-13). */
  async move(id: string, direction: -1 | 1): Promise<void> {
    const codes = this._codes();
    const index = codes.findIndex((c) => c.id === id);
    const other = codes[index + direction];
    if (index < 0 || !other) {
      return;
    }
    const current = codes[index];
    await Promise.all([
      this.update(current.id, { position: other.position }),
      this.update(other.id, { position: current.position }),
    ]);
    await this.load();
  }

  nextPosition(): number {
    return Math.max(0, ...this._codes().map((c) => c.position)) + 1;
  }
}
