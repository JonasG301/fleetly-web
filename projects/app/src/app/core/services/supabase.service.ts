import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from 'auth';

/** Dünner Zugriffspunkt auf den app-weit einzigen Supabase-Client. */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = inject(SUPABASE_CLIENT);

  from(table: string) {
    return this.client.from(table);
  }
}
