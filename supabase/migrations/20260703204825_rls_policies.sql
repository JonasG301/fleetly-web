-- fleetly-web: Row Level Security
-- Mitarbeiter: eigene Zeiteinträge, lesender Zugriff auf Stammdaten.
-- Admin: Vollzugriff. Helper is_admin() als security definer gegen RLS-Rekursion.

-- Tabellen-Privilegien: RLS regelt die Zeilen, GRANTs den Tabellenzugriff.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.service_entries enable row level security;
alter table public.damage_reports enable row level security;
alter table public.orders enable row level security;
alter table public.order_vehicles enable row level security;
alter table public.commission_codes enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_segments enable row level security;
alter table public.audit_log enable row level security;
alter table public.notification_settings enable row level security;
alter table public.tuv_notifications enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────
-- Alle eingeloggten Nutzer dürfen Namen sehen (für Anzeige in Reports)
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── Stammdaten: lesen alle, schreiben nur Admin ─────────────────────────
create policy customers_select on public.customers for select to authenticated using (true);
create policy customers_admin on public.customers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy vehicles_select on public.vehicles for select to authenticated using (true);
create policy vehicles_admin on public.vehicles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy service_entries_select on public.service_entries for select to authenticated using (true);
create policy service_entries_admin on public.service_entries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy orders_select on public.orders for select to authenticated using (true);
create policy orders_admin on public.orders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy order_vehicles_select on public.order_vehicles for select to authenticated using (true);
create policy order_vehicles_admin on public.order_vehicles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy commission_codes_select on public.commission_codes for select to authenticated using (true);
create policy commission_codes_admin on public.commission_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Schadensmeldungen: jeder darf melden und lesen, verwalten nur Admin ─
create policy damage_reports_select on public.damage_reports for select to authenticated using (true);
create policy damage_reports_insert on public.damage_reports for insert to authenticated
  with check (reported_by is null or reported_by = auth.uid() or public.is_admin());
create policy damage_reports_admin_update on public.damage_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy damage_reports_admin_delete on public.damage_reports for delete to authenticated
  using (public.is_admin());

-- ── Zeiteinträge: Mitarbeiter nur eigene; Update nur im 24h-Fenster ─────
create policy time_entries_select_own on public.time_entries
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy time_entries_insert_own on public.time_entries
  for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
create policy time_entries_update_own on public.time_entries
  for update to authenticated
  using (
    public.is_admin()
    or (user_id = auth.uid() and created_at > now() - interval '24 hours')
  )
  with check (user_id = auth.uid() or public.is_admin());
create policy time_entries_admin_delete on public.time_entries
  for delete to authenticated using (public.is_admin());

create policy time_segments_select_own on public.time_segments
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.time_entries te
      where te.id = time_entry_id and te.user_id = auth.uid()
    )
  );
create policy time_segments_write_own on public.time_segments
  for insert to authenticated with check (
    public.is_admin() or exists (
      select 1 from public.time_entries te
      where te.id = time_entry_id and te.user_id = auth.uid()
    )
  );
create policy time_segments_update_own on public.time_segments
  for update to authenticated using (
    public.is_admin() or exists (
      select 1 from public.time_entries te
      where te.id = time_entry_id and te.user_id = auth.uid()
        and te.created_at > now() - interval '24 hours'
    )
  );
create policy time_segments_admin_delete on public.time_segments
  for delete to authenticated using (public.is_admin());

-- ── Audit-Log: lesen (eigene bzw. Admin alle), schreiben nur Trigger ────
create policy audit_log_select on public.audit_log
  for select to authenticated using (changed_by = auth.uid() or public.is_admin());

-- ── Benachrichtigungs-Einstellungen: eigene ─────────────────────────────
create policy notification_settings_own on public.notification_settings
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ── TÜV-Notifications: nur Admin lesen; schreibt nur die Edge Function ──
create policy tuv_notifications_admin_select on public.tuv_notifications
  for select to authenticated using (public.is_admin());
