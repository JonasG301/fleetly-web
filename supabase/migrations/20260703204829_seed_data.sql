-- fleetly-web: Seed — Standard-Kommissionsnummern (US-13)

insert into public.commission_codes (code, label, description, color, position) values
  ('REISE', 'Reisezeit',      'An- und Abfahrt zum Einsatzort', '#1976d2', 1),
  ('WART',  'Wartung',        'Planmäßige Wartungsarbeiten',    '#2e7d32', 2),
  ('INST',  'Instandsetzung', 'Reparatur und Instandsetzung',   '#e65100', 3),
  ('WARTE', 'Wartezeit',      'Wartezeit beim Kunden',          '#546e7a', 4);
