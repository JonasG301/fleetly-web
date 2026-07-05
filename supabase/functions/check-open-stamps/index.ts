// US-18: Täglicher Cron — prüft offene Stempelungen gegen die konfigurierten
// Schwellen (max. Arbeitsdauer, späteste Uhrzeit) und sendet Web Push.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PushSubscriptionJson, sendPush } from '../_shared/web-push.ts';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // org_id mitladen: wird unten benötigt, um die Admin-Kopie (notify_admin)
  // strikt auf Admins derselben Organisation zu beschränken — sonst würden
  // Admins fremder Mandanten über offene Stempelungen anderer Firmen
  // informiert (Mandanten-Daten-Leak). Diese Function schreibt selbst
  // keine Zeilen in Mandanten-Tabellen, daher ist hier kein INSERT mit
  // org_id nötig — nur die Leseseite muss org-gescopet werden.
  const { data: openEntries, error } = await supabase
    .from('time_entries')
    .select('id, user_id, started_at, org_id')
    .in('status', ['open', 'paused']);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const now = new Date();
  let sent = 0;

  for (const entry of openEntries ?? []) {
    const { data: settings } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', entry.user_id)
      .maybeSingle();
    if (settings && !settings.is_enabled) {
      continue;
    }
    const maxHours = settings?.max_duration_hours ?? 10;
    const latestTime = (settings?.latest_time as string | undefined) ?? '20:00';

    const hoursOpen = (now.getTime() - new Date(entry.started_at).getTime()) / 3_600_000;
    const [lh, lm] = latestTime.split(':').map(Number);
    const pastLatest = now.getHours() > lh || (now.getHours() === lh && now.getMinutes() >= lm);

    if (hoursOpen < maxHours && !pastLatest) {
      continue;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, push_subscription')
      .eq('id', entry.user_id)
      .single();

    const message = `Du hast seit ${Math.floor(hoursOpen)} Stunden nicht abgestempelt.`;
    if (profile?.push_subscription) {
      if (await sendPush(profile.push_subscription as PushSubscriptionJson, '⏱ Abstempeln vergessen?', message)) {
        sent++;
      }
    }

    // Optional: Kopie an alle Admins (US-18) — nur innerhalb derselben Org
    if (settings?.notify_admin) {
      const { data: admins } = await supabase
        .from('profiles')
        .select('push_subscription')
        .eq('role', 'admin')
        .eq('org_id', entry.org_id)
        .not('push_subscription', 'is', null);
      for (const admin of admins ?? []) {
        await sendPush(
          admin.push_subscription as PushSubscriptionJson,
          '⏱ Offene Stempelung',
          `${profile?.full_name ?? 'Ein Mitarbeiter'} hat seit ${Math.floor(hoursOpen)} h nicht abgestempelt.`,
        );
      }
    }
  }

  return new Response(JSON.stringify({ checked: openEntries?.length ?? 0, sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
