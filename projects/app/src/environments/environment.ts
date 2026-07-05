// Dev-Konfiguration: lokale Supabase-Instanz (npx supabase start)
// Der lokale Anon-Key ist ein öffentlicher Demo-Key der Supabase CLI — kein Geheimnis.
export const environment = {
  production: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  // VAPID-Public-Key für Web-Push (US-18). Für lokale Tests ein eigenes
  // Test-Keypair erzeugen: `npx web-push generate-vapid-keys` und den
  // Public Key hier eintragen (Private Key gehört NUR in die Edge-Function-
  // Secrets, niemals ins Frontend). Leer = Push-Button zeigt Hinweis an.
  vapidPublicKey: '',
  // Cloudflare-Turnstile Site Key. Lokal leer = Captcha in der Registrierung aus.
  turnstileSiteKey: '',
};
