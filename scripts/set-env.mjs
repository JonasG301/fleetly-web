// Ersetzt die Platzhalter in environment.prod.ts durch Netlify-Env-Vars
// (SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY) — läuft vor dem
// Production-Build (siehe netlify.toml).
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../projects/app/src/environments/environment.prod.ts', import.meta.url);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
// Optional: ohne gesetzten VAPID-Key bleibt der Platzhalter leer und die
// Push-Funktion zeigt dem Nutzer einen Hinweis statt zu crashen (siehe
// notification-settings.component.ts → enablePush()).
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? '';
// Optional: ohne Site Key bleibt das Captcha in der Registrierung deaktiviert.
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY ?? '';

if (!url || !key) {
  console.error('SUPABASE_URL und SUPABASE_ANON_KEY müssen als Env-Vars gesetzt sein.');
  process.exit(1);
}
if (!process.env.VAPID_PUBLIC_KEY) {
  console.warn(
    'VAPID_PUBLIC_KEY ist nicht gesetzt — Web-Push bleibt in diesem Build deaktiviert. ' +
      'Keypair erzeugen mit: npx web-push generate-vapid-keys',
  );
}

let content = readFileSync(file, 'utf8');
content = content
  .replace('SUPABASE_URL_PLACEHOLDER', url)
  .replace('SUPABASE_ANON_KEY_PLACEHOLDER', key)
  .replace('VAPID_PUBLIC_KEY_PLACEHOLDER', vapidPublicKey)
  .replace('TURNSTILE_SITE_KEY_PLACEHOLDER', turnstileSiteKey);
writeFileSync(file, content);
console.log('environment.prod.ts mit Supabase-Konfiguration befüllt.');
