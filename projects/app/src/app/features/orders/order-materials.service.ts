import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from 'auth';
import { OrderMaterial, OrderMaterialInsert } from '../../core/models/material.model';
import { SupabaseService } from '../../core/services/supabase.service';

/**
 * Auf Aufträge gebuchtes Material: laden je Auftrag, buchen, löschen.
 * Bewusst nicht als globaler Cache wie die Stammdaten-Services — die Liste
 * wird pro geöffnetem Auftrags-Detail gezielt nachgeladen.
 */
@Injectable({ providedIn: 'root' })
export class OrderMaterialsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _entries = signal<OrderMaterial[]>([]);
  private readonly _loading = signal(false);

  readonly entries = this._entries.asReadonly();
  readonly loading = this._loading.asReadonly();

  async loadForOrder(orderId: string): Promise<void> {
    this._loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('order_materials')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
      if (error) {
        throw new Error(error.message);
      }
      this._entries.set((data ?? []) as OrderMaterial[]);
    } finally {
      this._loading.set(false);
    }
  }

  async add(entry: Omit<OrderMaterialInsert, 'created_by'>): Promise<void> {
    const payload: OrderMaterialInsert = {
      ...entry,
      created_by: this.auth.user()?.id ?? null,
    };
    const { error } = await this.supabase.from('order_materials').insert(payload);
    if (error) {
      throw new Error(error.message);
    }
    await this.loadForOrder(entry.order_id);
  }

  async remove(id: string, orderId: string): Promise<void> {
    const { error } = await this.supabase.from('order_materials').delete().eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    await this.loadForOrder(orderId);
  }
}
