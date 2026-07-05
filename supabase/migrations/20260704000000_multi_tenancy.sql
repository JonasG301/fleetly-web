-- fleetly-web: Multi-Tenancy-Fundament
-- Wandelt die Single-Pool-App in eine mandantenfähige SaaS:
--   1. Neue Tabelle organizations als Mandanten-Wurzel
--   2. org_id auf allen mandantenbezogenen Tabellen (direkt, auch auf Kind-/
--      Join-Tabellen — bewusst denormalisiert für einfache, schnelle RLS)
--   3. Helper current_user_org() (security definer, gegen RLS-Rekursion)
--   4. handle_new_user() neu: KEINE Rollenübernahme aus Client-Metadaten mehr
--      (Fix der Privilege-Escalation-Lücke: {"role":"admin"} im Signup)
--   5. Alle RLS-Policies org-gescopet (statt using(true))
--   6. Audit-Log mandantengetrennt (org_id im write_audit_log-Trigger)
-- Alle Schritte idempotent (IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT).

-- ═════════════════════════════════════════════════════════════════════════
-- 1) Organisationen (Mandanten)
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,          -- optionaler URL-Kürzel, aktuell nicht erzwungen
  created_at timestamptz not null default now()
);

-- Grants: Tabelle wurde nach den pauschalen GRANTs aus 20260703204825
-- angelegt und wird nicht automatisch exponiert → explizit vergeben.
grant select, update on public.organizations to authenticated;
grant all on public.organizations to service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 2) org_id-Spalten
-- ═════════════════════════════════════════════════════════════════════════
-- profiles zuerst (ohne Default), damit current_user_org() darauf aufsetzen
-- kann. Alle übrigen Tabellen bekommen default current_user_org(): das
-- Frontend muss org_id bei INSERTs damit NICHT mitschicken — der Default
-- füllt sie aus dem Profil des eingeloggten Nutzers. (Edge Functions mit
-- service_role haben kein auth.uid() und müssen org_id explizit setzen.)
alter table public.profiles
  add column if not exists org_id uuid references public.organizations (id);

-- ── Helper: Org des eingeloggten Nutzers ─────────────────────────────────
-- security definer + fixer search_path: umgeht RLS auf profiles und
-- verhindert Rekursion, wenn Policies die Funktion selbst nutzen.
create or replace function public.current_user_org()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid() and is_active;
$$;

-- is_admin() bleibt inhaltlich gleich: sie prüft die Rolle des EIGENEN
-- Profils. Org-Scoping entsteht dadurch, dass jede Policy zusätzlich
-- org_id = current_user_org() verlangt — ein Admin ist damit nur innerhalb
-- seiner eigenen Org Admin, niemals org-übergreifend.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

-- ── org_id auf allen Mandanten-Tabellen ──────────────────────────────────
alter table public.customers
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
alter table public.vehicles
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
alter table public.service_entries
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
alter table public.damage_reports
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
alter table public.orders
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
alter table public.order_vehicles
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
alter table public.commission_codes
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
alter table public.time_entries
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
alter table public.time_segments
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
alter table public.notification_settings
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
alter table public.tuv_notifications
  add column if not exists org_id uuid references public.organizations (id) default public.current_user_org();
-- audit_log: kein Default, wird ausschließlich vom Trigger befüllt;
-- bleibt nullable (Altbestand vor dieser Migration hat keine org_id).
alter table public.audit_log
  add column if not exists org_id uuid references public.organizations (id);

-- ═════════════════════════════════════════════════════════════════════════
-- 3) Backfill: Bestandsdaten einer Demo-Org zuordnen
-- ═════════════════════════════════════════════════════════════════════════
-- Betrifft lokale Dev-Daten und die Seeds aus 20260703204829 (Standard-
-- Kommissionsnummern), die vor dieser Migration ohne org_id entstehen.
insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Demo Organisation', 'demo')
on conflict (id) do nothing;

update public.profiles set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;

-- Kind-/Referenz-Tabellen möglichst aus dem Parent ableiten …
update public.service_entries se set org_id = v.org_id
  from public.vehicles v where se.vehicle_id = v.id and se.org_id is null and v.org_id is not null;
update public.damage_reports dr set org_id = v.org_id
  from public.vehicles v where dr.vehicle_id = v.id and dr.org_id is null and v.org_id is not null;
update public.order_vehicles ov set org_id = o.org_id
  from public.orders o where ov.order_id = o.id and ov.org_id is null and o.org_id is not null;
update public.time_entries te set org_id = p.org_id
  from public.profiles p where te.user_id = p.id and te.org_id is null and p.org_id is not null;
update public.time_segments ts set org_id = te.org_id
  from public.time_entries te where ts.time_entry_id = te.id and ts.org_id is null and te.org_id is not null;
update public.notification_settings ns set org_id = p.org_id
  from public.profiles p where ns.user_id = p.id and ns.org_id is null and p.org_id is not null;
update public.tuv_notifications tn set org_id = v.org_id
  from public.vehicles v where tn.vehicle_id = v.id and tn.org_id is null and v.org_id is not null;

-- … Rest (inkl. Stammdaten ohne Parent) auf die Demo-Org
update public.customers set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update public.vehicles set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update public.service_entries set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update public.damage_reports set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update public.orders set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update public.order_vehicles set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update public.commission_codes set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update public.time_entries set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update public.time_segments set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update public.notification_settings set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update public.tuv_notifications set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;

-- Jetzt hart machen (audit_log bewusst ausgenommen)
alter table public.profiles alter column org_id set not null;
alter table public.customers alter column org_id set not null;
alter table public.vehicles alter column org_id set not null;
alter table public.service_entries alter column org_id set not null;
alter table public.damage_reports alter column org_id set not null;
alter table public.orders alter column org_id set not null;
alter table public.order_vehicles alter column org_id set not null;
alter table public.commission_codes alter column org_id set not null;
alter table public.time_entries alter column org_id set not null;
alter table public.time_segments alter column org_id set not null;
alter table public.notification_settings alter column org_id set not null;
alter table public.tuv_notifications alter column org_id set not null;

-- ── Indizes für RLS-Filter und Joins ─────────────────────────────────────
create index if not exists profiles_org_idx on public.profiles (org_id);
create index if not exists customers_org_idx on public.customers (org_id);
create index if not exists vehicles_org_idx on public.vehicles (org_id);
create index if not exists service_entries_org_idx on public.service_entries (org_id);
create index if not exists damage_reports_org_idx on public.damage_reports (org_id);
create index if not exists orders_org_idx on public.orders (org_id);
create index if not exists order_vehicles_org_idx on public.order_vehicles (org_id);
create index if not exists commission_codes_org_idx on public.commission_codes (org_id);
create index if not exists time_entries_org_idx on public.time_entries (org_id);
create index if not exists time_segments_org_idx on public.time_segments (org_id);
create index if not exists notification_settings_org_idx on public.notification_settings (org_id);
create index if not exists tuv_notifications_org_idx on public.tuv_notifications (org_id);
create index if not exists audit_log_org_idx on public.audit_log (org_id);

-- ── Globale Unique-Constraints auf Org-Ebene umstellen ───────────────────
-- Auftragsnummern und Kommissionscodes müssen nur je Org eindeutig sein,
-- sonst blockieren sich Mandanten gegenseitig (und leaken Existenz).
alter table public.orders drop constraint if exists orders_order_number_key;
create unique index if not exists orders_org_order_number_key
  on public.orders (org_id, order_number);

alter table public.commission_codes drop constraint if exists commission_codes_code_key;
create unique index if not exists commission_codes_org_code_key
  on public.commission_codes (org_id, code);

-- client_id-Uniques (Offline-Idempotenz, client-generierte UUIDs) bleiben
-- bewusst global — Kollisionsrisiko praktisch null, Semantik unverändert.

-- ═════════════════════════════════════════════════════════════════════════
-- 4) Org-Anlage mit Standard-Stammdaten + neues Signup-Verhalten
-- ═════════════════════════════════════════════════════════════════════════
-- Legt eine Org an und kopiert die Standard-Kommissionsnummern (US-13)
-- hinein, damit jeder neue Mandant sofort arbeitsfähig ist.
create or replace function public.create_organization_with_defaults(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  insert into public.organizations (name) values (p_name) returning id into v_org;
  insert into public.commission_codes (org_id, code, label, description, color, position) values
    (v_org, 'REISE', 'Reisezeit',      'An- und Abfahrt zum Einsatzort', '#1976d2', 1),
    (v_org, 'WART',  'Wartung',        'Planmäßige Wartungsarbeiten',    '#2e7d32', 2),
    (v_org, 'INST',  'Instandsetzung', 'Reparatur und Instandsetzung',   '#e65100', 3),
    (v_org, 'WARTE', 'Wartezeit',      'Wartezeit beim Kunden',          '#546e7a', 4);
  return v_org;
end $$;

-- SICHERHEITSFIX: handle_new_user() liest die Rolle NICHT mehr aus
-- raw_user_meta_data — vorher konnte sich jeder per Signup mit
-- {"role":"admin"} sofort Admin-Rechte verschaffen.
--
-- Onboarding-Modell:
--   a) meta 'org_name' gesetzt  → neue Organisation wird angelegt, der
--      Nutzer wird 'admin' DIESER neuen (leeren) Org. Legitim: der erste
--      Nutzer ist der Org-Inhaber; Zugriff auf fremde Daten entsteht nicht.
--   b) meta 'org_id' gesetzt    → Einladung in eine bestehende Org: Rolle
--      ist IMMER 'employee', niemals admin. Ungültige/unbekannte org_id
--      fällt auf c) zurück.
--   c) Fallback (weder org_name noch org_id): nichts Privilegiertes in
--      fremden Orgs — der Nutzer erhält eine eigene, frische Organisation
--      (benannt nach seiner E-Mail) und ist deren 'admin'. Das ist die
--      unprivilegierteste Variante, die profiles.org_id NOT NULL erfüllt,
--      ohne den Signup zu brechen.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_role text;
  v_org_name text := nullif(trim(new.raw_user_meta_data ->> 'org_name'), '');
  v_invited_org text := nullif(trim(new.raw_user_meta_data ->> 'org_id'), '');
begin
  if v_org_name is not null then
    -- a) Neue Org, Nutzer ist Inhaber/Admin
    v_org_id := public.create_organization_with_defaults(v_org_name);
    v_role := 'admin';
  elsif v_invited_org is not null then
    -- b) Einladung: org_id validieren (Format + Existenz), Rolle employee
    begin
      select o.id into v_org_id
      from public.organizations o
      where o.id = v_invited_org::uuid;
    exception when invalid_text_representation then
      v_org_id := null;
    end;
    v_role := 'employee';
  end if;

  if v_org_id is null then
    -- c) Fallback: eigene neue Org, keinerlei Zugriff auf bestehende Daten
    v_org_id := public.create_organization_with_defaults(new.email);
    v_role := 'admin';
  end if;

  insert into public.profiles (id, org_id, full_name, role)
  values (
    new.id,
    v_org_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    v_role
  );
  return new;
end $$;

-- Definer-Funktionen nicht direkt über die API aufrufbar machen
revoke execute on function public.create_organization_with_defaults(text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 5) Audit-Trigger: org_id des betroffenen Datensatzes mitschreiben
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (table_name, record_id, action, changed_by, org_id, old_value, new_value)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    (v_row ->> 'org_id')::uuid,  -- Mandantentrennung auch im Audit-Trail
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- ═════════════════════════════════════════════════════════════════════════
-- 6) RLS: alle Policies org-gescopet neu aufsetzen
-- ═════════════════════════════════════════════════════════════════════════
-- Grundmuster: SELECT verlangt org_id = current_user_org(); Admin-Policies
-- verlangen is_admin() UND org_id = current_user_org() (Admin nur in der
-- eigenen Org). Feinere Bestandsregeln (24h-Fenster, Rollen-Escalation-
-- Schutz, damage_reports-Insert) bleiben erhalten, zusätzlich org-gescopet.

alter table public.organizations enable row level security;

-- ── organizations: Mitglieder sehen die eigene Org, nur Org-Admin ändert ─
drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations
  for select to authenticated using (id = public.current_user_org());
drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (public.is_admin() and id = public.current_user_org())
  with check (public.is_admin() and id = public.current_user_org());
-- INSERT/DELETE bewusst ohne Policy: Orgs entstehen nur über den
-- Signup-Trigger (security definer), gelöscht wird nur via service_role.

-- ── profiles ─────────────────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (org_id = public.current_user_org());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and org_id = public.current_user_org()  -- Org-Wechsel unmöglich
    and role = (select p.role from public.profiles p where p.id = auth.uid())  -- Rollen-Escalation-Schutz
  );
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin() and org_id = public.current_user_org())
  with check (public.is_admin() and org_id = public.current_user_org());

-- ── Stammdaten: lesen Org-Mitglieder, schreiben nur Org-Admin ────────────
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated using (org_id = public.current_user_org());
drop policy if exists customers_admin on public.customers;
create policy customers_admin on public.customers
  for all to authenticated
  using (public.is_admin() and org_id = public.current_user_org())
  with check (public.is_admin() and org_id = public.current_user_org());

drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select to authenticated using (org_id = public.current_user_org());
drop policy if exists vehicles_admin on public.vehicles;
create policy vehicles_admin on public.vehicles
  for all to authenticated
  using (public.is_admin() and org_id = public.current_user_org())
  with check (public.is_admin() and org_id = public.current_user_org());

drop policy if exists service_entries_select on public.service_entries;
create policy service_entries_select on public.service_entries
  for select to authenticated using (org_id = public.current_user_org());
drop policy if exists service_entries_admin on public.service_entries;
create policy service_entries_admin on public.service_entries
  for all to authenticated
  using (public.is_admin() and org_id = public.current_user_org())
  with check (public.is_admin() and org_id = public.current_user_org());

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated using (org_id = public.current_user_org());
drop policy if exists orders_admin on public.orders;
create policy orders_admin on public.orders
  for all to authenticated
  using (public.is_admin() and org_id = public.current_user_org())
  with check (public.is_admin() and org_id = public.current_user_org());

drop policy if exists order_vehicles_select on public.order_vehicles;
create policy order_vehicles_select on public.order_vehicles
  for select to authenticated using (org_id = public.current_user_org());
drop policy if exists order_vehicles_admin on public.order_vehicles;
create policy order_vehicles_admin on public.order_vehicles
  for all to authenticated
  using (public.is_admin() and org_id = public.current_user_org())
  with check (public.is_admin() and org_id = public.current_user_org());

drop policy if exists commission_codes_select on public.commission_codes;
create policy commission_codes_select on public.commission_codes
  for select to authenticated using (org_id = public.current_user_org());
drop policy if exists commission_codes_admin on public.commission_codes;
create policy commission_codes_admin on public.commission_codes
  for all to authenticated
  using (public.is_admin() and org_id = public.current_user_org())
  with check (public.is_admin() and org_id = public.current_user_org());

-- ── Schadensmeldungen: Org-Mitglieder melden/lesen, verwalten Org-Admin ──
drop policy if exists damage_reports_select on public.damage_reports;
create policy damage_reports_select on public.damage_reports
  for select to authenticated using (org_id = public.current_user_org());
drop policy if exists damage_reports_insert on public.damage_reports;
create policy damage_reports_insert on public.damage_reports
  for insert to authenticated with check (
    org_id = public.current_user_org()
    and (reported_by is null or reported_by = auth.uid() or public.is_admin())
  );
drop policy if exists damage_reports_admin_update on public.damage_reports;
create policy damage_reports_admin_update on public.damage_reports
  for update to authenticated
  using (public.is_admin() and org_id = public.current_user_org())
  with check (public.is_admin() and org_id = public.current_user_org());
drop policy if exists damage_reports_admin_delete on public.damage_reports;
create policy damage_reports_admin_delete on public.damage_reports
  for delete to authenticated
  using (public.is_admin() and org_id = public.current_user_org());

-- ── Zeiteinträge: nur eigene, Update im 24h-Fenster — org-gescopet ───────
drop policy if exists time_entries_select_own on public.time_entries;
create policy time_entries_select_own on public.time_entries
  for select to authenticated using (
    org_id = public.current_user_org()
    and (user_id = auth.uid() or public.is_admin())
  );
drop policy if exists time_entries_insert_own on public.time_entries;
create policy time_entries_insert_own on public.time_entries
  for insert to authenticated with check (
    org_id = public.current_user_org()
    and (user_id = auth.uid() or public.is_admin())
  );
drop policy if exists time_entries_update_own on public.time_entries;
create policy time_entries_update_own on public.time_entries
  for update to authenticated
  using (
    org_id = public.current_user_org()
    and (
      public.is_admin()
      or (user_id = auth.uid() and created_at > now() - interval '24 hours')
    )
  )
  with check (
    org_id = public.current_user_org()
    and (user_id = auth.uid() or public.is_admin())
  );
drop policy if exists time_entries_admin_delete on public.time_entries;
create policy time_entries_admin_delete on public.time_entries
  for delete to authenticated
  using (public.is_admin() and org_id = public.current_user_org());

drop policy if exists time_segments_select_own on public.time_segments;
create policy time_segments_select_own on public.time_segments
  for select to authenticated using (
    org_id = public.current_user_org()
    and (
      public.is_admin() or exists (
        select 1 from public.time_entries te
        where te.id = time_entry_id and te.user_id = auth.uid()
      )
    )
  );
drop policy if exists time_segments_write_own on public.time_segments;
create policy time_segments_write_own on public.time_segments
  for insert to authenticated with check (
    org_id = public.current_user_org()
    and (
      public.is_admin() or exists (
        select 1 from public.time_entries te
        where te.id = time_entry_id and te.user_id = auth.uid()
      )
    )
  );
drop policy if exists time_segments_update_own on public.time_segments;
create policy time_segments_update_own on public.time_segments
  for update to authenticated using (
    org_id = public.current_user_org()
    and (
      public.is_admin() or exists (
        select 1 from public.time_entries te
        where te.id = time_entry_id and te.user_id = auth.uid()
          and te.created_at > now() - interval '24 hours'
      )
    )
  );
drop policy if exists time_segments_admin_delete on public.time_segments;
create policy time_segments_admin_delete on public.time_segments
  for delete to authenticated
  using (public.is_admin() and org_id = public.current_user_org());

-- ── Audit-Log: eigene Einträge bzw. Org-Admin nur die der eigenen Org ────
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated using (
    changed_by = auth.uid()
    or (public.is_admin() and org_id = public.current_user_org())
  );

-- ── Benachrichtigungs-Einstellungen: eigene, org-gescopet ────────────────
drop policy if exists notification_settings_own on public.notification_settings;
create policy notification_settings_own on public.notification_settings
  for all to authenticated
  using (
    org_id = public.current_user_org()
    and (user_id = auth.uid() or public.is_admin())
  )
  with check (
    org_id = public.current_user_org()
    and (user_id = auth.uid() or public.is_admin())
  );

-- ── TÜV-Notifications: nur Org-Admin lesen; schreibt die Edge Function ───
drop policy if exists tuv_notifications_admin_select on public.tuv_notifications;
create policy tuv_notifications_admin_select on public.tuv_notifications
  for select to authenticated
  using (public.is_admin() and org_id = public.current_user_org());
