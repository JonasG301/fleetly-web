// Fleetly-Feature: Täglicher Cron — TÜV-Fälligkeiten prüfen und Web Push senden.
// Businessregel (aus der Flutter-App):
//   nächste HU = tuv_date + (is_faster_than_40kmh ? 1 : 2 Jahre)
//   gültig bis Ende des Fälligkeitsmonats, überfällig ab dem 1. des Folgemonats
//   Schwellen: 30 / 7 / 1 Tage vor Monatsende, danach "expired"
// Dedup über tuv_notifications (UNIQUE vehicle_id + threshold + due_date).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PushSubscriptionJson, sendPush } from '../_shared/web-push.ts';

type Threshold = '30d' | '7d' | '1d' | 'expired';

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

function daysBetween(a: Date, b: Date): number {
  const dayMs = 86_400_000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / dayMs);
}

function thresholdFor(daysRemaining: number): Threshold | null {
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= 1) return '1d';
  if (daysRemaining <= 7) return '7d';
  if (daysRemaining <= 30) return '30d';
  return null;
}

const THRESHOLD_TEXT: Record<Threshold, string> = {
  '30d': 'Erinnerung',
  '7d': 'WICHTIG',
  '1d': 'DRINGEND',
  expired: 'ABGELAUFEN',
};

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // org_id mitlesen: wird unten sowohl für den tuv_notifications-INSERT
  // (Spalten-Default current_user_org() liefert unter service_role NULL,
  // da kein auth.uid() existiert) als auch zur Mandantentrennung der
  // Empfänger benötigt.
  const { data: vehicles, error } = await supabase
    .from('vehicles')
    .select('id, plate, is_faster_than_40kmh, tuv_date, org_id')
    .eq('is_active', true)
    .not('tuv_date', 'is', null);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Empfänger: alle Admins + Nutzer mit aktivierter TÜV-Erinnerung.
  // org_id wird mitgeladen, damit unten pro Fahrzeug nur an Empfänger
  // derselben Organisation gesendet wird (sonst Mandanten-Daten-Leak).
  const { data: recipients } = await supabase
    .from('profiles')
    .select('id, role, org_id, push_subscription, notification_settings(tuv_reminders_enabled)')
    .not('push_subscription', 'is', null);

  const now = new Date();
  let sent = 0;

  for (const v of vehicles ?? []) {
    const last = new Date(v.tuv_date as string);
    const years = v.is_faster_than_40kmh ? 1 : 2;
    const nextDue = new Date(last.getFullYear() + years, last.getMonth(), last.getDate());
    const dueEnd = endOfMonth(nextDue);
    const daysRemaining = daysBetween(now, dueEnd);
    const threshold = thresholdFor(daysRemaining);
    if (!threshold) {
      continue;
    }

    const dueDateIso = nextDue.toISOString().slice(0, 10);
    // Dedup: gleiche Meldung je Fahrzeug/Schwelle/Fälligkeit nur einmal.
    // org_id MUSS explizit gesetzt werden: die Spalte hat zwar
    // `default current_user_org()`, aber diese Funktion liest auth.uid(),
    // welches unter service_role (Edge Function) immer NULL ist — der
    // Default würde also gegen die NOT-NULL-Constraint verletzen bzw.
    // (falls nullable) fälschlich NULL einsetzen. Daher hier vom
    // zugehörigen Fahrzeug ableiten.
    const { error: dedupError } = await supabase
      .from('tuv_notifications')
      .insert({ vehicle_id: v.id, threshold, due_date: dueDateIso, org_id: v.org_id });
    if (dedupError) {
      continue; // bereits gesendet (unique violation) oder anderer Fehler
    }

    const dueMonth = `${String(nextDue.getMonth() + 1).padStart(2, '0')}/${nextDue.getFullYear()}`;
    const body =
      threshold === 'expired'
        ? `TÜV ist seit ${-daysRemaining} Tag(en) abgelaufen! Fälligkeitsmonat war ${dueMonth}`
        : `TÜV läuft in ${daysRemaining} Tag(en) ab. Fälligkeitsmonat: ${dueMonth}`;
    const title = `🚗 TÜV ${THRESHOLD_TEXT[threshold]} — ${v.plate}`;

    for (const r of recipients ?? []) {
      // Mandantentrennung: nur Empfänger der Organisation des Fahrzeugs
      // benachrichtigen, sonst würden Nutzer anderer Orgs TÜV-Daten
      // fremder Fuhrparks per Push erhalten.
      if (r.org_id !== v.org_id) {
        continue;
      }
      const settings = Array.isArray(r.notification_settings)
        ? r.notification_settings[0]
        : r.notification_settings;
      const wantsTuv = settings?.tuv_reminders_enabled ?? r.role === 'admin';
      if (!wantsTuv) {
        continue;
      }
      if (await sendPush(r.push_subscription as PushSubscriptionJson, title, body)) {
        sent++;
      }
    }
  }

  return new Response(JSON.stringify({ vehicles: vehicles?.length ?? 0, sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
