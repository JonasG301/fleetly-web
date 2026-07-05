-- fleetly-web: Einladungs-Token-Modell (Sicherheits-Härtung)
--
-- Bisher konnte sich ein neuer Nutzer per raw_user_meta_data.org_id einer
-- beliebigen Organisation zuordnen, wenn er deren UUID kannte (UUIDs sind
-- nicht ratbar, aber leakbar). Ab jetzt läuft der Beitritt ausschließlich
-- über einmalige, ablaufende Einladungs-Token, die serverseitig (Edge
-- Function invite-user mit service_role) erzeugt werden. Eine vom Client
-- gesetzte org_id wird NICHT mehr beachtet.

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);
create index if not exists invitations_token_idx on public.invitations (token);
create index if not exists invitations_org_idx on public.invitations (org_id);

alter table public.invitations enable row level security;
grant select, insert, update, delete on public.invitations to authenticated;

-- Org-Admins sehen und verwalten nur Einladungen der eigenen Organisation.
drop policy if exists invitations_admin on public.invitations;
create policy invitations_admin on public.invitations
  for all to authenticated
  using (public.is_admin() and org_id = public.current_user_org())
  with check (public.is_admin() and org_id = public.current_user_org());

-- ── handle_new_user neu: Beitritt nur noch über gültiges Einladungs-Token ─
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_role text;
  v_org_name text := nullif(trim(new.raw_user_meta_data ->> 'org_name'), '');
  v_token text := nullif(trim(new.raw_user_meta_data ->> 'invitation_token'), '');
  v_inv public.invitations;
begin
  -- a) Einladung: gültiges, nicht abgelaufenes, nicht eingelöstes Token
  if v_token is not null then
    begin
      select * into v_inv
      from public.invitations
      where token = v_token::uuid
        and accepted_at is null
        and expires_at > now()
      limit 1;
    exception when invalid_text_representation then
      v_inv.id := null;
    end;
    if v_inv.id is not null then
      v_org_id := v_inv.org_id;
      v_role := v_inv.role;
      update public.invitations set accepted_at = now() where id = v_inv.id;
    end if;
  end if;

  -- b) Neue Firma: org_name gesetzt → Nutzer wird Admin der neuen Org
  if v_org_id is null and v_org_name is not null then
    v_org_id := public.create_organization_with_defaults(v_org_name);
    v_role := 'admin';
  end if;

  -- c) Fallback: eigene, leere Org (kein Zugriff auf fremde Daten)
  if v_org_id is null then
    v_org_id := public.create_organization_with_defaults(new.email);
    v_role := 'admin';
  end if;

  insert into public.profiles (id, org_id, full_name, role)
  values (
    new.id,
    v_org_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    v_role
  );
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
