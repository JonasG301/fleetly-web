// Fleetly – In-App-Nutzereinladung (Multi-Tenancy).
// Ein Admin lädt einen neuen Mitarbeiter in die EIGENE Organisation ein.
//
// Sicherheit: inviteUserByEmail braucht den Service-Role-Key, der niemals in den
// Client gehört. Deshalb läuft die Einladung hier serverseitig. Die org_id wird
// NICHT vom Client übernommen, sondern aus dem JWT des aufrufenden Admins
// abgeleitet – so kann niemand in eine fremde Organisation einladen.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) Aufrufer authentifizieren (JWT aus dem Authorization-Header).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Nicht authentifiziert.' }, 401);
  }
  const admin = createClient(supabaseUrl, serviceKey);
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (userError || !user) {
    return json({ error: 'Nicht authentifiziert.' }, 401);
  }

  // 2) Prüfen, dass der Aufrufer Admin einer Organisation ist; org_id ableiten.
  const { data: profile } = await admin
    .from('profiles')
    .select('org_id, role, is_active')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return json({ error: 'Nur aktive Administratoren dürfen einladen.' }, 403);
  }

  // 3) Eingabe validieren.
  let payload: { email?: string; full_name?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Ungültige Anfrage.' }, 400);
  }
  const email = payload.email?.trim().toLowerCase();
  const fullName = payload.full_name?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Keine gültige E-Mail-Adresse.' }, 400);
  }

  // 4) Einmaliges Einladungs-Token erzeugen (org_id kommt serverseitig aus dem
  //    Profil des Admins, nie vom Client). Der DB-Trigger handle_new_user löst
  //    beim Signup das Token auf und setzt org_id + Rolle daraus.
  const { data: invitation, error: invError } = await admin
    .from('invitations')
    .insert({
      org_id: profile.org_id,
      email,
      role: 'employee',
      invited_by: user.id,
    })
    .select('token')
    .single();
  if (invError || !invitation) {
    return json({ error: invError?.message ?? 'Einladung konnte nicht angelegt werden.' }, 400);
  }

  // 5) Einladungs-E-Mail verschicken; Token als Metadatum mitgeben.
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invitation_token: invitation.token, full_name: fullName || email },
    redirectTo: `${Deno.env.get('SITE_URL') ?? supabaseUrl}/passwort-neu`,
  });
  if (inviteError) {
    return json({ error: inviteError.message }, 400);
  }

  return json({ ok: true });
});
