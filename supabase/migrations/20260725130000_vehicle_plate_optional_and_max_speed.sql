-- Kennzeichen ist nicht bei allen Fahrzeugarten Pflicht: selbstfahrende
-- Arbeitsmaschinen/Flurförderzeuge (Bagger, Radlader, Walze, Stapler,
-- Teleskoplader) sind laut § 18 Abs. 4 StVZO nur kennzeichenpflichtig, wenn
-- ihre Bauartgeschwindigkeit > 20 km/h liegt. Die bestehende Formatprüfung
-- bleibt erhalten und greift automatisch nicht bei NULL.
alter table public.vehicles
  alter column plate drop not null;

alter table public.vehicles
  add column max_speed_kmh integer check (max_speed_kmh >= 0);
