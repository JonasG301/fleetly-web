-- fleetly-web: Integrität der Zeiterfassung (Abrechnungsbetrug verhindern)
--
-- Problem: duration_seconds und alle Zeitstempel wurden bisher clientseitig
-- berechnet und ungeprüft gespeichert. Ein Mitarbeiter konnte per direktem
-- API-Aufruf beliebige Dauern (z. B. duration_seconds = 999999) oder gefälschte
-- Start-/Endzeiten eintragen und so Arbeitszeit fälschen.
--
-- Lösung: Dauer und Zeitstempel werden serverseitig per Trigger validiert und
-- neu berechnet. Der Client-Wert für duration_seconds wird immer überschrieben.
-- Kleine Toleranz (5 Min) gegen abweichende Geräteuhren (Clock-Skew).

-- ── 1) Segmente validieren + Dauer serverseitig berechnen ─────────────────
create or replace function public.validate_time_segment()
returns trigger language plpgsql as $$
begin
  if new.segment_start > now() + interval '5 minutes' then
    raise exception 'segment_start darf nicht in der Zukunft liegen';
  end if;
  if new.segment_end is not null then
    if new.segment_end < new.segment_start then
      raise exception 'segment_end liegt vor segment_start';
    end if;
    if new.segment_end > now() + interval '5 minutes' then
      raise exception 'segment_end darf nicht in der Zukunft liegen';
    end if;
    -- Client-Wert ignorieren, Dauer aus den Zeitstempeln ableiten
    new.duration_seconds := floor(extract(epoch from (new.segment_end - new.segment_start)));
  else
    new.duration_seconds := null;
  end if;
  return new;
end $$;

drop trigger if exists time_segments_validate on public.time_segments;
create trigger time_segments_validate
  before insert or update on public.time_segments
  for each row execute function public.validate_time_segment();

-- ── 2) Entry-Dauer aus den Segmenten neu berechnen (maßgeblich) ───────────
-- Läuft nach jeder Segment-Änderung; robust auch bei Offline-Sync, bei dem
-- Segmente ggf. nach dem Entry eintreffen.
create or replace function public.recompute_entry_duration()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.time_entry_id, old.time_entry_id);
begin
  update public.time_entries te
    set duration_seconds = (
      select coalesce(sum(s.duration_seconds), 0)
      from public.time_segments s
      where s.time_entry_id = target and s.segment_end is not null
    )
  where te.id = target;
  return coalesce(new, old);
end $$;

drop trigger if exists time_segments_recompute on public.time_segments;
create trigger time_segments_recompute
  after insert or update or delete on public.time_segments
  for each row execute function public.recompute_entry_duration();

-- ── 3) Zeiteinträge validieren ────────────────────────────────────────────
-- - Zeitstempel dürfen nicht in der Zukunft / verdreht sein.
-- - Referenzen (Auftrag, Kommission, Fahrzeug) müssen zur eigenen Org gehören
--   → verhindert das Buchen auf fremde Aufträge über geratene UUIDs.
-- - Dauer: mit Segmenten = deren Summe; ohne Segmente (manuelle Nacherfassung)
--   = höchstens die Wanduhrzeit stopped_at - started_at (keine Überhöhung).
create or replace function public.validate_time_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wallclock integer;
begin
  if new.started_at > now() + interval '5 minutes' then
    raise exception 'started_at darf nicht in der Zukunft liegen';
  end if;
  if new.stopped_at is not null then
    if new.stopped_at < new.started_at then
      raise exception 'stopped_at liegt vor started_at';
    end if;
    if new.stopped_at > now() + interval '5 minutes' then
      raise exception 'stopped_at darf nicht in der Zukunft liegen';
    end if;
  end if;

  -- Referenz-Integrität gegen die eigene Organisation
  if not exists (
    select 1 from public.orders o where o.id = new.order_id and o.org_id = new.org_id
  ) then
    raise exception 'Auftrag gehört nicht zur eigenen Organisation';
  end if;
  if not exists (
    select 1 from public.commission_codes c
    where c.id = new.commission_code_id and c.org_id = new.org_id
  ) then
    raise exception 'Kommissionsnummer gehört nicht zur eigenen Organisation';
  end if;
  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id = new.vehicle_id and v.org_id = new.org_id
  ) then
    raise exception 'Fahrzeug gehört nicht zur eigenen Organisation';
  end if;

  -- Dauer serverseitig festlegen
  if exists (select 1 from public.time_segments s where s.time_entry_id = new.id) then
    new.duration_seconds := (
      select coalesce(sum(s.duration_seconds), 0)
      from public.time_segments s
      where s.time_entry_id = new.id and s.segment_end is not null
    );
  elsif new.stopped_at is not null then
    wallclock := floor(extract(epoch from (new.stopped_at - new.started_at)));
    -- Client-Wert nie über der Wanduhrzeit; ohne Wert = Wanduhrzeit
    new.duration_seconds := least(coalesce(new.duration_seconds, wallclock), wallclock);
  end if;

  return new;
end $$;

drop trigger if exists time_entries_validate on public.time_entries;
create trigger time_entries_validate
  before insert or update on public.time_entries
  for each row execute function public.validate_time_entry();

-- ── 4) RLS-Härtung: org_id des Eintrags muss die eigene Org sein ──────────
-- Verhindert, dass ein Nutzer beim INSERT eine fremde org_id angibt.
drop policy if exists time_entries_insert_own on public.time_entries;
create policy time_entries_insert_own on public.time_entries
  for insert to authenticated
  with check (
    org_id = public.current_user_org()
    and (user_id = auth.uid() or public.is_admin())
  );
