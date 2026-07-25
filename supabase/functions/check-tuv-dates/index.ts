// Fleetly-Feature: Täglicher Cron — TÜV-Fälligkeiten prüfen und Web Push senden.
// Businessregel (Kategorie-Regeln, siehe projects/app/.../core/models/vehicle.model.ts
// effectiveHuIntervalMonths — hier dupliziert, da Edge Functions kein Frontend-Bundling teilen):
//   PKW: 24 Monate, außer Neuwagen (Erstzulassung < 3 Jahre) → 36 Monate
//   LKW: ≤ 3.500 kg → 24 Monate, sonst 12 Monate
//   Traktor/Anhänger/Bagger/Radlader/Walze/Teleskoplader/Sonstiges: 24 Monate
//   Stapler: keine HU-Pflicht (kein Cron-Eintrag)
//   nächste HU = tuv_date + Intervall, gültig bis Ende des Fälligkeitsmonats,
//   überfällig ab dem 1. des Folgemonats. Schwellen: 30 / 7 / 1 Tage vor Monatsende.
// Dedup über tuv_notifications (UNIQUE vehicle_id + threshold + due_date).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PushSubscriptionJson, sendPush } from '../_shared/web-push.ts';

type Threshold = '30d' | '7d' | '1d' | 'expired';

const MAX_WEIGHT_HU_THRESHOLD_KG = 3500;

function isNeuwagen(firstRegistration: string | null, today: Date): boolean {
  if (!firstRegistration) return false;
  const fr = new Date(firstRegistration);
  const threeYearsAfter = new Date(fr.getFullYear() + 3, fr.getMonth(), fr.getDate());
  return today < threeYearsAfter;
}

function huIntervalMonths(
  category: string | null,
  firstRegistration: string | null,
  maxWeightKg: number | null,
  today: Date,
): number | null {
  switch (category) {
    case 'stapler':
      return null;
    case 'pkw':
      return isNeuwagen(firstRegistration, today) ? 36 : 24;
    case 'lkw':
      return maxWeightKg != null && maxWeightKg <= MAX_WEIGHT_HU_THRESHOLD_KG ? 24 : 12;
    default:
      return 24;
  }
}

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
    .select('id, plate, type, first_registration, max_weight_kg, tuv_date, org_id')
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
    const months = huIntervalMonths(v.type, v.first_registration, v.max_weight_kg, now);
    if (months == null) {
      continue;
    }
    const last = new Date(v.tuv_date as string);
    const nextDue = new Date(last.getFullYear(), last.getMonth() + months, last.getDate());
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
