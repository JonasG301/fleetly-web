import { Injectable, inject, signal } from '@angular/core';
import { Customer, CustomerInsert } from '../../core/models/customer.model';
import { SupabaseService } from '../../core/services/supabase.service';

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly supabase = inject(SupabaseService);

  private readonly _customers = signal<Customer[]>([]);
  private readonly _loading = signal(false);

  readonly customers = this._customers.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('customers')
        .select('*')
        .order('company_name');
      if (error) {
        throw new Error(error.message);
      }
      this._customers.set((data ?? []) as Customer[]);
    } finally {
      this._loading.set(false);
    }
  }

  /** Duplikat-Warnung (US-04): existiert bereits ein Kunde mit diesem Namen? */
  hasDuplicateName(companyName: string, excludeId?: string): boolean {
    const needle = companyName.trim().toLowerCase();
    return this._customers().some(
      (c) => c.id !== excludeId && c.company_name.trim().toLowerCase() === needle,
    );
  }

  async create(customer: CustomerInsert): Promise<Customer> {
    const { data, error } = await this.supabase
      .from('customers')
      .insert(customer)
      .select()
      .single();
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
    return data as Customer;
  }

  async update(id: string, changes: Partial<CustomerInsert>): Promise<void> {
    const { error } = await this.supabase.from('customers').update(changes).eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    await this.load();
  }

  /** Löschen nur ohne offene Aufträge (US-05). */
  async delete(id: string): Promise<{ error: string | null }> {
    const { count } = await this.supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', id)
      .neq('status', 'done');
    if ((count ?? 0) > 0) {
      return { error: 'Kunde hat offene Aufträge und kann nicht gelöscht werden.' };
    }
    const { error } = await this.supabase.from('customers').delete().eq('id', id);
    if (error) {
      return { error: error.message };
    }
    await this.load();
    return { error: null };
  }
}
