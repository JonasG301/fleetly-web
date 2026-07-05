import { InjectionToken, Provider } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/** Konfiguration je Projekt-Instanz (US-03): eigene Supabase-Instanz via Env. */
export interface AuthConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Cloudflare-Turnstile Site Key. Leer/undefined = Captcha in der Registrierung aus. */
  captchaSiteKey?: string;
}

export const AUTH_CONFIG = new InjectionToken<AuthConfig>('fleetly.auth.config');

/**
 * App-weit einziger Supabase-Client. Auth-Library und App teilen sich diesen
 * Client, damit Session-State nicht doppelt verwaltet wird.
 */
export const SUPABASE_CLIENT = new InjectionToken<SupabaseClient>('fleetly.supabase.client');

export function provideAuth(config: AuthConfig): Provider[] {
  return [
    { provide: AUTH_CONFIG, useValue: config },
    {
      provide: SUPABASE_CLIENT,
      useFactory: () => createClient(config.supabaseUrl, config.supabaseAnonKey),
    },
  ];
}
