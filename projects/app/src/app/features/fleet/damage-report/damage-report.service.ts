import { Injectable, inject, signal } from '@angular/core';
import {
  DamageReport,
  DamageReportPhoto,
  DamageStatus,
} from '../../../core/models/damage-report.model';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { OfflineQueueService } from '../../../core/services/offline-queue.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { SyncService } from '../../../core/services/sync.service';

const PHOTOS_BUCKET = 'damage-photos';

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
    location: string | null;
    reporter_name: string;
    reported_by: string | null;
    damage_date: string;
    position_x: number | null;
    position_y: number | null;
    position_view: string | null;
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

  /**
   * Wie report(), hängt aber optional Fotos an. Fotos benötigen Storage-
   * Zugriff und damit Netz — dafür wird die Schadensmeldung hier direkt
   * (statt über die Offline-Queue) angelegt, um sofort die echte ID zu
   * bekommen. Ohne Netz greift der normale Offline-Pfad ohne Fotos.
   */
  async reportWithPhotos(
    input: {
      vehicle_id: string;
      description: string;
      location: string | null;
      reporter_name: string;
      reported_by: string | null;
      damage_date: string;
      position_x: number | null;
      position_y: number | null;
      position_view: string | null;
    },
    files: File[],
  ): Promise<void> {
    if (!this.network.isOnline() || files.length === 0) {
      await this.report(input);
      return;
    }
    const { data, error } = await this.supabase
      .from('damage_reports')
      .insert({ ...input, status: 'open' })
      .select()
      .single();
    if (error) {
      throw new Error(error.message);
    }
    const created = data as DamageReport;
    this._reports.update((list) => [created, ...list]);
    await this.uploadPhotos(created.id, files);
  }

  async uploadPhotos(damageReportId: string, files: File[]): Promise<void> {
    for (const file of files) {
      const path = `${damageReportId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await this.supabase.client.storage
        .from(PHOTOS_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      const { error: insertError } = await this.supabase.from('damage_report_photos').insert({
        damage_report_id: damageReportId,
        storage_path: path,
      });
      if (insertError) {
        throw new Error(insertError.message);
      }
    }
  }

  async getPhotos(damageReportId: string): Promise<DamageReportPhoto[]> {
    const { data, error } = await this.supabase
      .from('damage_report_photos')
      .select('*')
      .eq('damage_report_id', damageReportId)
      .order('created_at');
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []) as DamageReportPhoto[];
  }

  /** Signierte URL für die private Foto-Datei (1 Stunde gültig). */
  async getPhotoUrl(storagePath: string): Promise<string> {
    const { data, error } = await this.supabase.client.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (error) {
      throw new Error(error.message);
    }
    return data.signedUrl;
  }

  async deletePhoto(photo: DamageReportPhoto): Promise<void> {
    const { error: removeError } = await this.supabase.client.storage
      .from(PHOTOS_BUCKET)
      .remove([photo.storage_path]);
    if (removeError) {
      throw new Error(removeError.message);
    }
    const { error: deleteError } = await this.supabase
      .from('damage_report_photos')
      .delete()
      .eq('id', photo.id);
    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  async setStatus(id: string, status: DamageStatus): Promise<void> {
    const { error } = await this.supabase.from('damage_reports').update({ status }).eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
  }
}
