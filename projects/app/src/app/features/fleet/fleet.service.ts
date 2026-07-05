import { Injectable, computed, inject, signal } from '@angular/core';
import { ServiceEntry, ServiceEntryInsert } from '../../core/models/service-entry.model';
import { Vehicle, VehicleInsert } from '../../core/models/vehicle.model';
import { MasterDataCacheService } from '../../core/services/master-data-cache.service';
import { SupabaseService } from '../../core/services/supabase.service';

@Injectable({ providedIn: 'root' })
export class FleetService {
  private readonly supabase = inject(SupabaseService);
  private readonly cache = inject(MasterDataCacheService);

  private readonly _vehicles = signal<Vehicle[]>([]);
  private readonly _loading = signal(false);
  private readonly _loadError = signal<string | null>(null);

  readonly vehicles = this._vehicles.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** Nicht-null, wenn das Laden fehlgeschlagen ist UND kein Cache-Stand einspringen konnte. */
  readonly loadError = this._loadError.asReadonly();

  /** Eigener Fuhrpark (Fleetly-Fall): kein Kunde zugeordnet. */
  readonly ownFleet = computed(() => this._vehicles().filter((v) => v.customer_id === null));
  /** Kundenfahrzeuge (TimeStamp-Fall). */
  readonly customerVehicles = computed(() =>
    this._vehicles().filter((v) => v.customer_id !== null),
  );

  async load(): Promise<void> {
    this._loading.set(true);
    this._loadError.set(null);
    try {
      const { data, error } = await this.supabase.from('vehicles').select('*').order('plate');
      if (error) {
        throw new Error(error.message);
      }
      this._vehicles.set((data ?? []) as Vehicle[]);
      void this.cache.put('vehicles', data ?? []);
    } catch (err) {
      // Offline: Stammdaten-Spiegel aus IndexedDB (E-08)
      const cached = await this.cache.get<Vehicle>('vehicles');
      if (cached && cached.length > 0) {
        this._vehicles.set(cached);
      } else {
        this._loadError.set(
          'Fahrzeuge konnten nicht geladen werden: ' + (err as Error).message,
        );
      }
    } finally {
      this._loading.set(false);
    }
  }

  byId(id: string): Vehicle | undefined {
    return this._vehicles().find((v) => v.id === id);
  }

  async create(vehicle: VehicleInsert): Promise<Vehicle> {
    const { data, error } = await this.supabase.from('vehicles').insert(vehicle).select().single();
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
    return data as Vehicle;
  }

  async update(id: string, changes: Partial<VehicleInsert>): Promise<void> {
    const { error } = await this.supabase.from('vehicles').update(changes).eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
  }

  /** Deaktivieren statt löschen — historische Daten bleiben erhalten (US-06). */
  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.update(id, { is_active: isActive });
  }

  // ── Service-Historie ─────────────────────────────────────────────────
  async loadServiceEntries(vehicleId: string): Promise<ServiceEntry[]> {
    const { data, error } = await this.supabase
      .from('service_entries')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('service_date', { ascending: false });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []) as ServiceEntry[];
  }

  async addServiceEntry(entry: ServiceEntryInsert): Promise<void> {
    const { error } = await this.supabase.from('service_entries').insert(entry);
    if (error) {
      throw new Error(error.message);
    }
  }

  async deleteServiceEntry(id: string): Promise<void> {
    const { error } = await this.supabase.from('service_entries').delete().eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
  }
}
