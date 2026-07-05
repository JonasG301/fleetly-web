import { Injectable, inject, signal } from '@angular/core';
import { Order, OrderInsert, OrderStatus } from '../../core/models/order.model';
import { MasterDataCacheService } from '../../core/services/master-data-cache.service';
import { SupabaseService } from '../../core/services/supabase.service';

export interface OrderWithVehicles extends Order {
  vehicle_ids: string[];
}

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly supabase = inject(SupabaseService);
  private readonly cache = inject(MasterDataCacheService);

  private readonly _orders = signal<OrderWithVehicles[]>([]);
  private readonly _loading = signal(false);
  private readonly _loadError = signal<string | null>(null);

  readonly orders = this._orders.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** Nicht-null, wenn das Laden fehlgeschlagen ist UND kein Cache-Stand einspringen konnte. */
  readonly loadError = this._loadError.asReadonly();

  async load(): Promise<void> {
    this._loading.set(true);
    this._loadError.set(null);
    try {
      const { data, error } = await this.supabase
        .from('orders')
        .select('*, order_vehicles(vehicle_id)')
        .order('created_at', { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      const orders = (data ?? []).map((row) => {
        const { order_vehicles, ...order } = row as Order & {
          order_vehicles: { vehicle_id: string }[];
        };
        return { ...order, vehicle_ids: (order_vehicles ?? []).map((v) => v.vehicle_id) };
      });
      this._orders.set(orders);
      void this.cache.put('orders', orders);
    } catch (err) {
      const cached = await this.cache.get<OrderWithVehicles>('orders');
      if (cached && cached.length > 0) {
        this._orders.set(cached);
      } else {
        this._loadError.set('Aufträge konnten nicht geladen werden: ' + (err as Error).message);
      }
    } finally {
      this._loading.set(false);
    }
  }

  byId(id: string): OrderWithVehicles | undefined {
    return this._orders().find((o) => o.id === id);
  }

  /** Auftrag anlegen/aktualisieren inkl. Fahrzeug-Zuordnung (US-08). */
  async save(
    order: Omit<OrderInsert, 'created_by'> & { created_by?: string | null },
    vehicleIds: string[],
    existingId?: string,
  ): Promise<void> {
    let orderId = existingId;
    if (existingId) {
      const { error } = await this.supabase.from('orders').update(order).eq('id', existingId);
      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { data, error } = await this.supabase.from('orders').insert(order).select().single();
      if (error) {
        throw new Error(error.message);
      }
      orderId = (data as Order).id;
    }
    // Fahrzeug-Zuordnung neu setzen
    const { error: delError } = await this.supabase
      .from('order_vehicles')
      .delete()
      .eq('order_id', orderId!);
    if (delError) {
      throw new Error(delError.message);
    }
    if (vehicleIds.length > 0) {
      const { error: insError } = await this.supabase
        .from('order_vehicles')
        .insert(vehicleIds.map((vehicle_id) => ({ order_id: orderId!, vehicle_id })));
      if (insError) {
        throw new Error(insError.message);
      }
    }
    await this.load();
  }

  async setStatus(id: string, status: OrderStatus): Promise<void> {
    const { error } = await this.supabase.from('orders').update({ status }).eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
  }
}
