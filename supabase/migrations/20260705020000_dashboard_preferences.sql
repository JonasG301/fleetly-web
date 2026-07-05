-- fleetly-web: Personalisierbares Dashboard
-- Speichert pro Nutzer Anordnung und Sichtbarkeit der Dashboard-Widgets
-- (KPI-Kacheln + Navigations-Kacheln) als JSONB. Eine Zeile je Nutzer,
-- das Frontend schreibt per Upsert auf user_id.
-- Layout-Format (Version im JSON, damit das Frontend migrieren kann):
--   { "version": 1,
--     "kpis":  [{ "id": "tuv", "hidden": false }, ...],
--     "cards": [{ "id": "/zeiterfassung", "hidden": false }, ...] }
-- Alle Schritte idempotent (IF NOT EXISTS / DROP IF EXISTS).

create table if not exists public.dashboard_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) default public.current_user_org(),
  layout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabelle entsteht nach den pauschalen GRANTs aus 20260703204825 → explizit.
grant select, insert, update, delete on public.dashboard_preferences to authenticated;
grant all on public.dashboard_preferences to service_role;

create index if not exists dashboard_preferences_org_idx
  on public.dashboard_preferences (org_id);

drop trigger if exists dashboard_preferences_updated_at on public.dashboard_preferences;
create trigger dashboard_preferences_updated_at before update on public.dashboard_preferences
  for each row execute function public.set_updated_at();

-- ── RLS: rein persönliche Einstellung — nur der Nutzer selbst ────────────
-- Bewusst OHNE is_admin()-Ausnahme: das Dashboard-Layout anderer Nutzer
-- geht auch Admins nichts an.
alter table public.dashboard_preferences enable row level security;

drop policy if exists dashboard_preferences_own on public.dashboard_preferences;
create policy dashboard_preferences_own on public.dashboard_preferences
  for all to authenticated
  using (user_id = auth.uid() and org_id = public.current_user_org())
  with check (user_id = auth.uid() and org_id = public.current_user_org());
