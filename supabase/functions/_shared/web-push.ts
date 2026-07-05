// Gemeinsamer Web-Push-Helper für Edge Functions (VAPID).
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
import webpush from 'npm:web-push@3.6.7';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

let configured = false;

function ensureConfigured(): void {
  if (configured) {
    return;
  }
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY nicht gesetzt');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export async function sendPush(
  subscription: PushSubscriptionJson,
  title: string,
  body: string,
): Promise<boolean> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ notification: { title, body, icon: 'icons/icon-192x192.png' } }),
    );
    return true;
  } catch (err) {
    console.error('Push fehlgeschlagen:', err);
    return false;
  }
}
