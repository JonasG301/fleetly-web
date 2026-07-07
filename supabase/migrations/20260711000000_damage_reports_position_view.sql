-- fleetly-web: Perspektive (Front/Rear/Left/Right/Side), auf der position_x/
-- position_y erfasst wurden, damit die Schadensposition beim Anzeigen auf
-- der passenden Fahrzeugansicht dargestellt werden kann.
alter table public.damage_reports
  add column if not exists position_view text;
