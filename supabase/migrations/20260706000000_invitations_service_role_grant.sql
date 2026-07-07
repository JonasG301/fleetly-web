-- fleetly-web: fehlenden service_role-Grant auf invitations nachtragen.
--
-- 20260705000000_invitations.sql hat nur `grant ... to authenticated` gesetzt.
-- Die Tabelle wurde nach den pauschalen Grants aus 20260703204825_rls_policies.sql
-- angelegt (die nur zu diesem Zeitpunkt existierende Tabellen erfasst), analog zu
-- dashboard_preferences fehlte hier der explizite service_role-Grant. Ohne ihn
-- scheitert der Insert der Edge Function invite-user (service_role) mit
-- "permission denied for table invitations".
grant all on public.invitations to service_role;