import { UserRole } from 'auth';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  push_subscription: unknown | null;
  created_at: string;
}
