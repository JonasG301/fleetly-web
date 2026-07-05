-- fleetly-web: Cron-Scheduling für die täglichen Edge Functions
-- check-tuv-dates und check-open-stamps laufen bisher nur, wenn sie manuell
-- oder von außen (z.B. GitHub Actions) aufgerufen werden. Diese Migration
-- richtet stattdessen pg_cron + pg_net ein, damit Postgres beide Functions
-- täglich selbst per HTTP-POST triggert.
--
-- WICHTIG — vor dem Deploy manuell anzupassen:
--   1. <PROJECT_REF> unten durch die Supabase-Projekt-Referenz ersetzen
--      (zu finden in der Projekt-URL bzw. via `supabase status`).
--   2. <SERVICE_ROLE_KEY> durch den service_role-Key des Projekts ersetzen
--      (Dashboard → Project Settings → API). Dieser Key ist ein Secret —
--      NICHT ins Git-Repo committen! Am saubersten: diese Migration lokal
--      mit den echten Werten anwenden (z.B. via `supabase db push` aus
--      einer nicht versionierten Kopie) oder die Werte per Supabase Vault
--      ablegen (vault.create_secret) und per
--      `(select decrypted_secret from vault.decrypted_secrets where name = ...)`
--      in die cron.schedule-Definition einsetzen, statt sie im Klartext zu
--      committen.
--   Alternative ohne SQL-Migration: Cron-Jobs im Supabase-Dashboard unter
--      "Database → Cron Jobs" (bzw. "Integrations → Cron") anlegen — dort
--      werden URL und Auth-Header über die UI verwaltet, nicht im Repo.
--
-- Voraussetzung bei selbstgehosteten Instanzen: pg_cron muss zusätzlich in
-- shared_preload_libraries (postgresql.conf) aktiviert sein. Auf Supabase-
-- Hosted ist das bereits vorbereitet, die Extension muss nur aktiviert
-- werden (siehe unten). Lokal (`supabase start`) sind pg_cron/pg_net evtl.
-- nicht vorinstalliert — dann greift lokal ersatzweise nur der manuelle
-- Aufruf der Functions.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────
-- check-tuv-dates: täglich 05:00 UTC
-- ─────────────────────────────────────────────────────────────────────────
-- Idempotent: bestehenden Job gleichen Namens vor dem (Neu-)Anlegen
-- entfernen. cron.unschedule() wirft einen Fehler, wenn der Job noch nicht
-- existiert (z.B. beim allerersten Anwenden dieser Migration) — das wird
-- hier abgefangen.
do $$
begin
  perform cron.unschedule('check-tuv-dates-daily');
exception when others then
  null; -- Job existierte noch nicht, kein Problem
end $$;

select cron.schedule(
  'check-tuv-dates-daily',
  '0 5 * * *',
  $cron$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/check-tuv-dates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- ─────────────────────────────────────────────────────────────────────────
-- check-open-stamps: täglich 18:00 UTC (~19–20 Uhr MEZ/MESZ)
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  perform cron.unschedule('check-open-stamps-daily');
exception when others then
  null;
end $$;

select cron.schedule(
  'check-open-stamps-daily',
  '0 18 * * *',
  $cron$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/check-open-stamps',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
