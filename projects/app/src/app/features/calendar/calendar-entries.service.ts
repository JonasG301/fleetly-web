import { Injectable, inject, signal } from '@angular/core';
import { CalendarEntry, CalendarEntryInsert } from '../../core/models/calendar-entry.model';
import { MasterDataCacheService } from '../../core/services/master-data-cache.service';
import { SupabaseService } from '../../core/services/supabase.service';

@Injectable({ providedIn: 'root' })
export class CalendarEntriesService {
  private readonly supabase = inject(SupabaseService);
  private readonly cache = inject(MasterDataCacheService);

  private readonly _entries = signal<CalendarEntry[]>([]);
  private readonly _loading = signal(false);
  private readonly _loadError = signal<string | null>(null);

  readonly entries = this._entries.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loadError = this._loadError.asReadonly();

  async load(): Promise<void> {
    this._loading.set(true);
    this._loadError.set(null);
    try {
      const { data, error } = await this.supabase
        .from('calendar_entries')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      const entries = (data ?? []) as CalendarEntry[];
      this._entries.set(entries);
      void this.cache.put('calendar_entries', entries);
    } catch (err) {
      const cached = await this.cache.get<CalendarEntry>('calendar_entries');
      if (cached && cached.length > 0) {
        this._entries.set(cached);
      } else {
        this._loadError.set(
          'Termine konnten nicht geladen werden: ' + (err as Error).message,
        );
      }
    } finally {
      this._loading.set(false);
    }
  }

  byId(id: string): CalendarEntry | undefined {
    return this._entries().find((e) => e.id === id);
  }

  async save(
    entry: Omit<CalendarEntryInsert, 'created_by'> & { created_by?: string | null },
    existingId?: string,
  ): Promise<void> {
    if (existingId) {
      const { error } = await this.supabase
        .from('calendar_entries')
        .update(entry)
        .eq('id', existingId);
      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await this.supabase.from('calendar_entries').insert(entry);
      if (error) {
        throw new Error(error.message);
      }
    }
    await this.load();
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.from('calendar_entries').delete().eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
  }
}
