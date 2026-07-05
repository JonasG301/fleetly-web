import { Injectable, inject, signal } from '@angular/core';
import { DamageReport, DamageStatus } from '../../../core/models/damage-report.model';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { OfflineQueueService } from '../../../core/services/offline-queue.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { SyncService } from '../../../core/services/sync.service';

@Injectable({ providedIn: 'root' })
export class DamageReportService {
  private readonly supabase = inject(SupabaseService);
  private readonly queue = inject(OfflineQueueService);
  private readonly network = inject(NetworkStatusService);
  private readonly sync = inject(SyncService);

  private readonly _reports = signal<DamageReport[]>([]);
  private readonly _loading = signal(false);

  readonly reports = this._reports.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(): Promise<void> {
    if (!this.network.isOnline()) {
      return; // offline: vorhandenen Stand behalten
    }
    this._loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('damage_reports')
        .select('*')
        .order('report_date', { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      this._reports.set((data ?? []) as DamageReport[]);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Schadensmeldung ist offline-fähig (E-08): erst in die Queue,
   * der SyncService überträgt mit client_id-Idempotenz.
   */
  async report(input: {
    vehicle_id: string;
    description: string;
    location: string;
    reporter_name: string;
    reported_by: string | null;
    damage_date: string;
  }): Promise<void> {
    const clientId = crypto.randomUUID();
    await this.queue.enqueue(clientId, 'damage_report', 'create', { ...input, status: 'open' });
    // Optimistische Anzeige
    this._reports.update((list) => [
      {
        ...input,
        id: clientId,
        client_id: clientId,
        status: 'open' as DamageStatus,
        report_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
      ...list,
    ]);
    void this.sync.syncNow();
  }

  async setStatus(id: string, status: DamageStatus): Promise<void> {
    const { error } = await this.supabase.from('damage_reports').update({ status }).eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
  }
}
