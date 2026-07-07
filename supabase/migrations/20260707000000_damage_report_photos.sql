-- fleetly-web: Fotos zu Schadensmeldungen
-- Ergänzt Schadensmeldungen um persistierte Foto-Dokumentation:
--   1. Tabelle damage_report_photos (Metadaten je Foto, org-gescopet wie damage_reports)
--   2. Privater Storage-Bucket "damage-photos" für die Bilddateien
--   3. RLS auf Tabelle UND storage.objects, jeweils org-gescopet über
--      current_user_org() (aus 20260704000000_multi_tenancy.sql)
-- Pfadkonvention im Bucket: {damage_report_id}/{uuid}-{dateiname}
-- Das Frontend kennt org_id grundsätzlich nicht (bleibt serverseitig via
-- current_user_org()-Default) — daher prüft die Storage-RLS über die Helper-
-- Funktion user_can_access_damage_report() gegen damage_reports.org_id,
-- statt org_id im Pfad zu verlangen.
-- Idempotent (IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT).

create table if not exists public.damage_report_photos (
  id uuid primary key default gen_random_uuid(),
  damage_report_id uuid not null references public.damage_reports (id) on delete cascade,
  org_id uuid not null references public.organizations (id) default public.current_user_org(),
  storage_path text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists damage_report_photos_report_idx
  on public.damage_report_photos (damage_report_id);
create index if not exists damage_report_photos_org_idx
  on public.damage_report_photos (org_id);

grant select, insert, delete on public.damage_report_photos to authenticated;
grant all on public.damage_report_photos to service_role;

alter table public.damage_report_photos enable row level security;

drop policy if exists damage_report_photos_select on public.damage_report_photos;
create policy damage_report_photos_select on public.damage_report_photos
  for select to authenticated using (org_id = public.current_user_org());

drop policy if exists damage_report_photos_insert on public.damage_report_photos;
create policy damage_report_photos_insert on public.damage_report_photos
  for insert to authenticated with check (
    org_id = public.current_user_org()
    and (uploaded_by is null or uploaded_by = auth.uid() or public.is_admin())
  );

-- Löschen: eigene Uploads oder Org-Admin (analog Schadensmeldungen).
drop policy if exists damage_report_photos_delete on public.damage_report_photos;
create policy damage_report_photos_delete on public.damage_report_photos
  for delete to authenticated using (
    org_id = public.current_user_org()
    and (uploaded_by = auth.uid() or public.is_admin())
  );

-- ── Helper: Zugriff auf eine Schadensmeldung über die eigene Org ─────────
-- security definer, damit die Storage-RLS (die keinen Zugriff auf
-- damage_reports voraussetzt) ohne rekursive Policy-Auswertung joinen kann.
create or replace function public.user_can_access_damage_report(report_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.damage_reports
    where id = report_id and org_id = public.current_user_org()
  );
$$;

-- ── Storage-Bucket ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'damage-photos',
  'damage-photos',
  false,
  10485760, -- 10 MiB je Foto
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Erstes Pfadsegment = damage_report_id.
drop policy if exists damage_photos_select on storage.objects;
create policy damage_photos_select on storage.objects
  for select to authenticated using (
    bucket_id = 'damage-photos'
    and public.user_can_access_damage_report(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists damage_photos_insert on storage.objects;
create policy damage_photos_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'damage-photos'
    and public.user_can_access_damage_report(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists damage_photos_delete on storage.objects;
create policy damage_photos_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'damage-photos'
    and public.user_can_access_damage_report(((storage.foldername(name))[1])::uuid)
    and (public.is_admin() or owner = auth.uid())
  );
