import { Injectable, computed, inject, signal } from '@angular/core';
import { Material, MaterialInsert } from '../../core/models/material.model';
import { MasterDataCacheService } from '../../core/services/master-data-cache.service';
import { SupabaseService } from '../../core/services/supabase.service';

/** Materialstamm (Katalog): laden, anlegen, ändern, sortieren. Admin-verwaltet. */
@Injectable({ providedIn: 'root' })
export class MaterialsService {
  private readonly supabase = inject(SupabaseService);
  private readonly cache = inject(MasterDataCacheService);

  private readonly _materials = signal<Material[]>([]);
  private readonly _loading = signal(false);
  private readonly _loadError = signal<string | null>(null);

  readonly materials = this._materials.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** Nicht-null, wenn das Laden fehlgeschlagen ist UND kein Cache-Stand einspringen konnte. */
  readonly loadError = this._loadError.asReadonly();
  /** Nur aktive, in Anzeige-Reihenfolge — für die Buchungs-Auswahl im Auftrag. */
  readonly activeMaterials = computed(() => this._materials().filter((m) => m.is_active));

  async load(): Promise<void> {
    this._loading.set(true);
    this._loadError.set(null);
    try {
      const { data, error } = await this.supabase
        .from('materials')
        .select('*')
        .order('position');
      if (error) {
        throw new Error(error.message);
      }
      this._materials.set((data ?? []) as Material[]);
      void this.cache.put('materials', data ?? []);
    } catch (err) {
      const cached = await this.cache.get<Material>('materials');
      if (cached && cached.length > 0) {
        this._materials.set(cached);
      } else {
        this._loadError.set('Material konnte nicht geladen werden: ' + (err as Error).message);
      }
    } finally {
      this._loading.set(false);
    }
  }

  byId(id: string): Material | undefined {
    return this._materials().find((m) => m.id === id);
  }

  async create(material: MaterialInsert): Promise<void> {
    const { error } = await this.supabase.from('materials').insert(material);
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
  }

  async update(id: string, changes: Partial<MaterialInsert>): Promise<void> {
    const { error } = await this.supabase.from('materials').update(changes).eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
  }

  /** Position tauschen (Sortierung per Auf/Ab, analog Kommissionsnummern). */
  async move(id: string, direction: -1 | 1): Promise<void> {
    const materials = this._materials();
    const index = materials.findIndex((m) => m.id === id);
    const other = materials[index + direction];
    if (index < 0 || !other) {
      return;
    }
    const current = materials[index];
    await Promise.all([
      this.update(current.id, { position: other.position }),
      this.update(other.id, { position: current.position }),
    ]);
    await this.load();
  }

  nextPosition(): number {
    return Math.max(0, ...this._materials().map((m) => m.position)) + 1;
  }
}
