import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { AuthService } from 'auth';
import { SupabaseService } from './supabase.service';

/**
 * Web-Push-Registrierung (US-18). Der VAPID-Public-Key wird in Phase 5
 * zusammen mit den Edge Functions konfiguriert.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly swPush = inject(SwPush);
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  readonly isSupported = this.swPush.isEnabled;

  async subscribe(vapidPublicKey: string): Promise<boolean> {
    const userId = this.auth.user()?.id;
    if (!this.swPush.isEnabled || !userId) {
      return false;
    }
    try {
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: vapidPublicKey,
      });
      const { error } = await this.supabase
        .from('profiles')
        .update({ push_subscription: subscription.toJSON() })
        .eq('id', userId);
      return !error;
    } catch {
      return false;
    }
  }

  async unsubscribe(): Promise<void> {
    const userId = this.auth.user()?.id;
    await this.swPush.unsubscribe().catch(() => undefined);
    if (userId) {
      await this.supabase.from('profiles').update({ push_subscription: null }).eq('id', userId);
    }
  }
}
