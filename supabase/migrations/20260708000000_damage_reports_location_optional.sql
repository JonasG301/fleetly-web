-- fleetly-web: Ort des Schadens ist kein Pflichtfeld mehr.
alter table public.damage_reports alter column location drop not null;
