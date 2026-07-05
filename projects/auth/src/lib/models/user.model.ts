export type UserRole = 'admin' | 'employee';

/** Eingeloggter Nutzer: auth.users + public.profiles zusammengeführt. */
export interface AuthUser {
  id: string;
  email: string | null;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}
