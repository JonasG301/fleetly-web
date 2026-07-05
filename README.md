# fleetly-web

Fuhrpark-Verwaltung und Zeiterfassung als Progressive Web App — Migration der
Fleetly-Flutter-App, zusammengeführt mit der Zeiterfassung-Spezifikation
(User Stories v2.0).

**Stack:** Angular 20 (Standalone Components, Signals) · Angular Material ·
Supabase (PostgreSQL, Auth, RLS, Edge Functions) · Netlify · PWA mit
IndexedDB-Offline-Queue

## Projektstruktur

- `projects/app` — Haupt-App (Feature-Slices unter `src/app/features/`)
- `projects/auth` — wiederverwendbare Auth-Library (US-03)
- `supabase/` — Migrationen und Edge Functions

## Entwicklung

```bash
npm install
npx supabase start        # lokale Supabase-Instanz (Docker Desktop nötig)
npx ng serve app          # Dev-Server auf http://localhost:4200
```

Die Dev-Umgebung (`src/environments/environment.ts`) zeigt auf die lokale
Supabase-Instanz (`http://127.0.0.1:54321`).

### Testnutzer anlegen

Supabase Studio öffnen (`http://127.0.0.1:54323`) → Authentication → Add user.
Die Rolle steht im Profil (`profiles.role`: `admin` | `employee`); neue Nutzer
bekommen automatisch ein Profil (Trigger `on_auth_user_created`).

## Tests & Build

```bash
npx ng test app --watch=false --browsers=ChromeHeadless   # ggf. CHROME_BIN auf Edge setzen
npx ng build app --configuration production
npx ng build auth
```

## Deployment (Netlify)

`netlify.toml` baut das SPA und ersetzt vorher die Supabase-/Push-Platzhalter
in `environment.prod.ts` über `scripts/set-env.mjs`. Folgende Env-Vars im
Netlify-Dashboard setzen:

| Env-Var | Zweck |
|---|---|
| `SUPABASE_URL` | URL des Supabase-Projekts |
| `SUPABASE_ANON_KEY` | Anon-Key des Supabase-Projekts (öffentlich, aber projektgebunden) |
| `VAPID_PUBLIC_KEY` | Public Key für Web-Push (optional — ohne diesen Wert bleibt der Push-Button deaktiviert, siehe unten) |

### Supabase (Edge Functions & Cron)

Damit Web-Push tatsächlich funktioniert, müssen zusätzlich zum Frontend-Key
die Edge-Function-Secrets gesetzt werden (`supabase secrets set …` bzw.
Dashboard → Edge Functions → Secrets):

| Secret | Zweck |
|---|---|
| `VAPID_PUBLIC_KEY` | derselbe Public Key wie oben im Frontend |
| `VAPID_PRIVATE_KEY` | privater Schlüssel — niemals im Frontend/Repo! |
| `VAPID_SUBJECT` | `mailto:`-Adresse für Push-Fehlerreports (Default: `mailto:admin@example.com`) |

Ein Keypair erzeugen:

```bash
npx web-push generate-vapid-keys
```

Die beiden täglichen Edge Functions (`check-tuv-dates`, `check-open-stamps`)
werden über die Migration `supabase/migrations/20260704010000_cron_jobs.sql`
per `pg_cron`/`pg_net` geplant. Vor dem Anwenden müssen dort die Platzhalter
`<PROJECT_REF>` und `<SERVICE_ROLE_KEY>` durch die echten Projektwerte ersetzt
werden (siehe Kommentare in der Datei) — alternativ die Cron-Jobs direkt im
Supabase-Dashboard unter „Database → Cron Jobs“ anlegen, ohne Secrets im
Migrations-SQL zu committen.

Für die Signup-Bestätigungsmails (E-Mail-Verifizierung) muss zudem ein SMTP-
Provider im Supabase-Dashboard (Project Settings → Auth → SMTP Settings)
hinterlegt werden — ohne eigenen SMTP-Server limitiert Supabase den
Auth-Mailversand stark (Rate-Limits, Absenderadresse `noreply@supabase.io`).

## Roadmap

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Fundament: Workspace, Auth, Schema, Shell, PWA | ✅ implementiert |
| 2 | Kunden, Fuhrpark, TÜV-Status, Schadensmeldungen | ✅ implementiert |
| 3 | Aufträge, Kommissionsnummern | ✅ implementiert |
| 4 | Zeiterfassung (START/PAUSE/STOP), Offline-Queue | ✅ implementiert |
| 5 | Auswertung, Korrekturen, Push-Benachrichtigungen | ✅ implementiert (Push-Zustellung erfordert VAPID-Keys + Cron, siehe „Deployment“) |
| 6 | Export, Fahrtenbuch, UVV, Schadenfotos | teilweise offen — Export/Fahrtenbuch/UVV-Reports gegen die reale Datenlage prüfen |

Zusätzlich zur ursprünglichen Roadmap wurde die App auf **Multi-Tenancy**
umgestellt (`organizations`-Tabelle, `org_id` auf allen mandantenbezogenen
Tabellen, org-gescopte RLS-Policies, sicheres Signup-/Einladungsmodell ohne
Rollen-Privilege-Escalation) — siehe
`supabase/migrations/20260704000000_multi_tenancy.sql`. Die
**Registrierung** neuer Organisationen/Nutzer läuft über den Supabase-
Auth-Signup-Trigger `handle_new_user()` (Details in derselben Migration).
