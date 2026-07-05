-- fleetly-web: Initiales Schema
-- Vereinigtes Datenmodell aus TimeStamp (Zeiterfassung) + Fleetly (Fuhrpark/TÜV/Schäden)

create extension if not exists "pgcrypto";

-- ── Profile (→ auth.users) ──────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  is_active boolean not null default true,
  push_subscription jsonb,
  created_at timestamptz not null default now()
);

-- ── Kunden (E-02) ───────────────────────────────────────────────────────
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  address text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Fahrzeuge (E-03, vereinigt TimeStamp + Fleetly) ─────────────────────
-- customer_id NULL = eigener Fuhrpark; gesetzt = Kundenfahrzeug
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete restrict,
  plate text not null check (plate ~ '^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2} [0-9]{1,4}$'),
  type text,
  make text not null,
  model text not null,
  internal_name text,
  is_active boolean not null default true,
  -- Fleetly-Felder
  is_faster_than_40kmh boolean not null default true, -- bestimmt TÜV-Intervall (1 vs 2 Jahre)
  operating_hours integer check (operating_hours >= 0),
  vin text,
  first_registration date,
  construction_year integer check (construction_year between 1900 and 2100),
  color text,
  fuel_type text check (fuel_type in ('diesel','petrol','electric','hybrid','plugin_hybrid','lpg','cng','hydrogen')),
  transmission text,
  tuv_date date,  -- letzte HU; nächste = tuv_date + 1|2 Jahre
  uvv_date date,
  mileage integer check (mileage >= 0),
  next_service_date date,
  service_interval integer,
  insurance_company text,
  insurance_number text,
  insurance_expiry_date date,
  yearly_tax numeric(10,2),
  leasing_rate numeric(10,2),
  leasing_end date,
  leasing_mileage integer,
  cost_center text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vehicles_customer_idx on public.vehicles (customer_id);

-- ── Service-Historie ────────────────────────────────────────────────────
create table public.service_entries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  service_date date not null,
  mileage integer,
  description text not null,
  cost numeric(10,2),
  workshop text,
  created_at timestamptz not null default now()
);
create index service_entries_vehicle_idx on public.service_entries (vehicle_id);

-- ── Schadensmeldungen (Fleetly) ─────────────────────────────────────────
create table public.damage_reports (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  description text not null,
  location text not null,
  reporter_name text not null,
  reported_by uuid references public.profiles (id) on delete set null,
  damage_date date not null,
  report_date timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','in_repair','resolved')),
  client_id uuid unique,  -- Idempotenz-Key für Offline-Sync
  created_at timestamptz not null default now()
);
create index damage_reports_vehicle_idx on public.damage_reports (vehicle_id);

-- ── Aufträge (E-04) ─────────────────────────────────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  order_number text not null unique,
  description text,
  status text not null default 'open' check (status in ('open','in_progress','done')),
  start_date date,
  end_date date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_vehicles (
  order_id uuid not null references public.orders (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  primary key (order_id, vehicle_id)
);

-- ── Kommissionsnummern (E-06) ───────────────────────────────────────────
create table public.commission_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  description text,
  color text,
  is_active boolean not null default true,
  position integer not null default 0
);

-- ── Zeiterfassung (E-05) ────────────────────────────────────────────────
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete restrict,
  commission_code_id uuid not null references public.commission_codes (id) on delete restrict,
  started_at timestamptz not null,
  stopped_at timestamptz,
  duration_seconds integer, -- Summe aktiver Segmente, beim STOP berechnet
  status text not null default 'open' check (status in ('open','paused','closed','cancelled')),
  correction_note text,
  client_id uuid unique, -- Idempotenz-Key für Offline-Sync
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index time_entries_user_idx on public.time_entries (user_id, started_at desc);
create index time_entries_order_idx on public.time_entries (order_id);

create table public.time_segments (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  segment_start timestamptz not null,
  segment_end timestamptz,
  duration_seconds integer,
  client_id uuid unique,
  created_at timestamptz not null default now()
);
create index time_segments_entry_idx on public.time_segments (time_entry_id);

-- ── Audit-Log (E-07) ────────────────────────────────────────────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_value jsonb,
  new_value jsonb
);

-- ── Benachrichtigungen (US-18 + TÜV) ────────────────────────────────────
create table public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  max_duration_hours integer not null default 10,
  latest_time time not null default '20:00',
  notify_admin boolean not null default false,
  is_enabled boolean not null default true,
  tuv_reminders_enabled boolean not null default true
);

-- Dedup: verhindert doppelte TÜV-Pushes je Schwelle & Fälligkeit
create table public.tuv_notifications (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  threshold text not null check (threshold in ('30d','7d','1d','expired')),
  due_date date not null,
  sent_at timestamptz not null default now(),
  unique (vehicle_id, threshold, due_date)
);

-- ── updated_at-Trigger ──────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger time_entries_updated_at before update on public.time_entries
  for each row execute function public.set_updated_at();

-- ── Profil automatisch bei Signup anlegen ───────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'employee')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
