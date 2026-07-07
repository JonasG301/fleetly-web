-- fleetly-web: Kalender-Feature
--   1. orders_auto_end_date-Trigger: end_date wird beim Abschließen (status
--      'done') automatisch auf das heutige Datum gesetzt, sofern noch keins
--      gesetzt war. Greift unabhängig davon, ob der Statuswechsel über
--      OrdersService.setStatus() (Kanban-Drag) oder OrdersService.save()
--      (Formular) ausgelöst wird.
--   2. Neue Tabelle calendar_entries für freie, org-gescopte Kalendereinträge
--      (z. B. Werkstatt, Urlaub), optional mit Fahrzeug-Verknüpfung. RLS/
--      Grants analog 20260707000000_damage_report_photos.sql.
-- Idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS).

-- ── 1) Auto-End-Datum bei Auftragsabschluss ─────────────────────────────
create or replace function public.set_order_end_date()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and new.end_date is null then
    new.end_date := current_date;
  end if;
  return new;
end $$;

drop trigger if exists orders_auto_end_date on public.orders;
create trigger orders_auto_end_date before insert or update on public.orders
  for each row execute function public.set_order_end_date();

-- ── 2) Freie Kalendereinträge ────────────────────────────────────────────
create table if not exists public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) default public.current_user_org(),
  title text not null,
  start_date date not null,
  end_date date not null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_entries_org_idx on public.calendar_entries (org_id);
create index if not exists calendar_entries_vehicle_idx on public.calendar_entries (vehicle_id);

drop trigger if exists calendar_entries_updated_at on public.calendar_entries;
create trigger calendar_entries_updated_at before update on public.calendar_entries
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.calendar_entries to authenticated;
grant all on public.calendar_entries to service_role;

alter table public.calendar_entries enable row level security;

drop policy if exists calendar_entries_select on public.calendar_entries;
create policy calendar_entries_select on public.calendar_entries
  for select to authenticated using (org_id = public.current_user_org());

drop policy if exists calendar_entries_write on public.calendar_entries;
create policy calendar_entries_write on public.calendar_entries
  for all to authenticated
  using (org_id = public.current_user_org())
  with check (org_id = public.current_user_org());
