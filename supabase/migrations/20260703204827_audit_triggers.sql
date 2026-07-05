-- fleetly-web: Audit-Trail (E-07 / US-16)
-- Änderungen an Zeiteinträgen, Segmenten, Profilen und Kunden landen im audit_log.

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, changed_by, old_value, new_value)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger time_entries_audit
  after insert or update or delete on public.time_entries
  for each row execute function public.write_audit_log();

create trigger time_segments_audit
  after insert or update or delete on public.time_segments
  for each row execute function public.write_audit_log();

create trigger profiles_audit
  after update or delete on public.profiles
  for each row execute function public.write_audit_log();

create trigger customers_audit
  after insert or update or delete on public.customers
  for each row execute function public.write_audit_log();
