-- fleetly-web: Schadensposition auf dem Fahrzeug-Diagramm
-- Prozent-Koordinaten (0-100) relativ zur je Fahrzeugkategorie angezeigten
-- Silhouette. Optional — bestehende Meldungen bleiben ohne Position gültig.
alter table public.damage_reports
  add column if not exists position_x numeric(5, 2)
    check (position_x is null or (position_x >= 0 and position_x <= 100)),
  add column if not exists position_y numeric(5, 2)
    check (position_y is null or (position_y >= 0 and position_y <= 100));
