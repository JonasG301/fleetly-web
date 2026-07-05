/**
 * Übersetzt die häufigsten Supabase-Auth-Fehlermeldungen in verständliches
 * Deutsch. Unbekannte Meldungen werden unverändert durchgereicht (Fallback).
 */
export function mapAuthError(message: string): string {
  const msg = message.toLowerCase();

  if (msg.includes('invalid login credentials')) {
    return 'E-Mail oder Passwort ist falsch.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
  }
  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return 'Für diese E-Mail-Adresse existiert bereits ein Konto.';
  }
  const minLength = /password should be at least (\d+)/.exec(msg);
  if (minLength) {
    return `Das Passwort muss mindestens ${minLength[1]} Zeichen lang sein.`;
  }
  if (msg.includes('new password should be different')) {
    return 'Das neue Passwort muss sich vom alten unterscheiden.';
  }
  if (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('for security purposes')
  ) {
    const seconds = /after (\d+) seconds/.exec(msg);
    return seconds
      ? `Zu viele Versuche. Bitte warte ${seconds[1]} Sekunden und versuche es erneut.`
      : 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.';
  }
  if (msg.includes('unable to validate email address') || msg.includes('invalid format')) {
    return 'Keine gültige E-Mail-Adresse.';
  }
  if (msg.includes('auth session missing') || msg.includes('session missing')) {
    return 'Keine gültige Sitzung. Bitte fordere einen neuen Link an.';
  }
  if (msg.includes('token has expired') || msg.includes('otp_expired') || msg.includes('link is invalid')) {
    return 'Der Link ist abgelaufen oder ungültig. Bitte fordere einen neuen an.';
  }
  if (msg.includes('signup is disabled') || msg.includes('signups not allowed')) {
    return 'Die Registrierung ist derzeit deaktiviert.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Verbindung zum Server fehlgeschlagen. Bitte prüfe deine Internetverbindung.';
  }
  return message;
}
