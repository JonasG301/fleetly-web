-- fleetly-web: Kalender-Feature — Uhrzeit für freie Termine
--   calendar_entries waren bislang immer ganztägig (nur start_date/end_date).
--   Für die Tagesansicht sollen Termine optional eine Uhrzeit haben und dann
--   im Stundenraster statt in der Ganztägig-Zeile erscheinen.
--   start_time/end_time bleiben NULL => Termin ist weiterhin ganztägig.
-- Idempotent (ADD COLUMN IF NOT EXISTS).

alter table public.calendar_entries
  add column if not exists start_time time,
  add column if not exists end_time time;
