import { Injectable, inject, signal } from '@angular/core';
import { Profile } from '../../core/models/profile.model';
import { TimeEntry } from '../../core/models/time-entry.model';
import { SupabaseService } from '../../core/services/supabase.service';

export interface ReportFilter {
  from: Date;
  to: Date;
  userId: string | null;
  orderId: string | null;
  vehicleId: string | null;
  commissionCodeId: string | null;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly supabase = inject(SupabaseService);

  private readonly _entries = signal<TimeEntry[]>([]);
  private readonly _profiles = signal<Profile[]>([]);
  private readonly _loading = signal(false);

  readonly entries = this._entries.asReadonly();
  readonly profiles = this._profiles.asReadonly();
  readonly loading = this._loading.asReadonly();

  async loadProfiles(): Promise<void> {
    const { data, error } = await this.supabase.from('profiles').select('*').order('full_name');
    if (error) {
      throw new Error(error.message);
    }
    this._profiles.set((data ?? []) as Profile[]);
  }

  async load(filter: ReportFilter): Promise<void> {
    this._loading.set(true);
    try {
      let query = this.supabase
        .from('time_entries')
        .select('*')
        .neq('status', 'cancelled')
        .gte('started_at', filter.from.toISOString())
        .lte('started_at', filter.to.toISOString())
        .order('started_at', { ascending: false });
      if (filter.userId) {
        query = query.eq('user_id', filter.userId);
      }
      if (filter.orderId) {
        query = query.eq('order_id', filter.orderId);
      }
      if (filter.vehicleId) {
        query = query.eq('vehicle_id', filter.vehicleId);
      }
      if (filter.commissionCodeId) {
        query = query.eq('commission_code_id', filter.commissionCodeId);
      }
      const { data, error } = await query;
      if (error) {
        throw new Error(error.message);
      }
      this._entries.set((data ?? []) as TimeEntry[]);
    } finally {
      this._loading.set(false);
    }
  }

  /** Korrektur (US-16): Zeiten/Zuordnung ändern, mit Begründung protokolliert. */
  async correctEntry(
    id: string,
    changes: Partial<
      Pick<
        TimeEntry,
        | 'started_at'
        | 'stopped_at'
        | 'duration_seconds'
        | 'commission_code_id'
        | 'vehicle_id'
        | 'order_id'
        | 'status'
      >
    >,
    note: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('time_entries')
      .update({ ...changes, correction_note: note })
      .eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
  }

  /** Kein hartes Löschen: Eintrag wird storniert (US-16). */
  async cancelEntry(id: string, note: string): Promise<void> {
    await this.correctEntry(id, { status: 'cancelled' }, note);
  }
}
