-- Zulässiges Gesamtgewicht (kg) — bestimmt bei Kategorie "lkw" das HU-Intervall
-- (≤ 3.500 kg: 24 Monate wie PKW, > 3.500 kg: 12 Monate gemäß StVZO Anlage VIII).
alter table public.vehicles
  add column max_weight_kg integer check (max_weight_kg >= 0);
