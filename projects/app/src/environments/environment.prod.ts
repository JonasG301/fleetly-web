// Produktions-Konfiguration: Werte werden vor dem Netlify-Build aus
// Environment-Variablen ersetzt (siehe netlify.toml → scripts/set-env).
export const environment = {
  production: true,
  supabaseUrl: 'SUPABASE_URL_PLACEHOLDER',
  supabaseAnonKey: 'SUPABASE_ANON_KEY_PLACEHOLDER',
  // VAPID-Public-Key für Web-Push (US-18) — wird von scripts/set-env.mjs aus
  // der Env-Var VAPID_PUBLIC_KEY befüllt. Der zugehörige Private Key ist ein
  // Secret der Edge Functions (VAPID_PRIVATE_KEY) und taucht hier NIE auf.
  // Siehe README.md → Abschnitt "Deployment".
  vapidPublicKey: 'VAPID_PUBLIC_KEY_PLACEHOLDER',
  // Cloudflare-Turnstile Site Key gegen Bot-Registrierungen. Leer = Captcha aus.
  // Wird von scripts/set-env.mjs aus der Env-Var TURNSTILE_SITE_KEY befüllt;
  // das zugehörige Secret gehört in die Supabase-Auth-Config (nie ins Frontend).
  turnstileSiteKey: 'TURNSTILE_SITE_KEY_PLACEHOLDER',
};
