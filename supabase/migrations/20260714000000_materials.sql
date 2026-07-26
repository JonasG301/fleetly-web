-- fleetly-web: Materialliste (Verbrauchsmaterial / Schüttgut)
--   1. Tabelle materials: org-gescopter Katalog aus Verbrauchsartikeln mit
--      Einheit und Preis pro Einheit. Verwaltung nur durch Org-Admins
--      (Schreib-RLS analog commission_codes), Auswahl durch alle Bediener.
--   2. Tabelle order_materials: je Auftrag gebuchtes Material mit Menge.
--      Preis, Einheit und Bezeichnung werden beim Buchen als Snapshot
--      kopiert, damit spätere Katalog-Änderungen bestehende Aufträge nicht
--      rückwirkend verändern. Jeder Bediener bucht (Schreib-RLS analog
--      damage_reports: eigene Einträge oder Admin).
-- Idempotent (CREATE ... IF NOT EXISTS / DROP ... IF EXISTS).

-- ── 1) Materialstamm (Katalog) ───────────────────────────────────────────
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) default public.current_user_org(),
  name text not null,
  unit text not null,
  unit_price numeric(10, 2) not null default 0,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists materials_org_idx on public.materials (org_id);
create unique index if not exists materials_org_name_key on public.materials (org_id, name);

drop trigger if exists materials_updated_at on public.materials;
create trigger materials_updated_at before update on public.materials
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.materials to authenticated;
grant all on public.materials to service_role;

alter table public.materials enable row level security;

drop policy if exists materials_select on public.materials;
create policy materials_select on public.materials
  for select to authenticated using (org_id = public.current_user_org());

-- Anlegen/Ändern/Löschen des Katalogs nur durch Org-Admins.
drop policy if exists materials_admin on public.materials;
create policy materials_admin on public.materials
  for all to authenticated
  using (public.is_admin() and org_id = public.current_user_org())
  with check (public.is_admin() and org_id = public.current_user_org());

-- ── 2) Auf Aufträge gebuchtes Material ───────────────────────────────────
create table if not exists public.order_materials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) default public.current_user_org(),
  order_id uuid not null references public.orders (id) on delete cascade,
  material_id uuid references public.materials (id) on delete set null,
  -- Snapshots beim Buchen: bleiben stabil, auch wenn der Katalog sich ändert.
  material_name text not null,
  unit text not null,
  unit_price numeric(10, 2) not null,
  quantity numeric(10, 3) not null check (quantity > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_materials_order_idx on public.order_materials (order_id);
create index if not exists order_materials_org_idx on public.order_materials (org_id);

drop trigger if exists order_materials_updated_at on public.order_materials;
create trigger order_materials_updated_at before update on public.order_materials
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.order_materials to authenticated;
grant all on public.order_materials to service_role;

alter table public.order_materials enable row level security;

drop policy if exists order_materials_select on public.order_materials;
create policy order_materials_select on public.order_materials
  for select to authenticated using (org_id = public.current_user_org());

drop policy if exists order_materials_insert on public.order_materials;
create policy order_materials_insert on public.order_materials
  for insert to authenticated with check (
    org_id = public.current_user_org()
    and (created_by is null or created_by = auth.uid() or public.is_admin())
  );

-- Ändern/Löschen: eigene Buchungen oder Org-Admin.
drop policy if exists order_materials_update on public.order_materials;
create policy order_materials_update on public.order_materials
  for update to authenticated
  using (org_id = public.current_user_org() and (created_by = auth.uid() or public.is_admin()))
  with check (org_id = public.current_user_org());

drop policy if exists order_materials_delete on public.order_materials;
create policy order_materials_delete on public.order_materials
  for delete to authenticated
  using (org_id = public.current_user_org() and (created_by = auth.uid() or public.is_admin()));
