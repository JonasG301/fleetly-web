import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from 'auth';

/** Nur für Admins zugängliche Routen (US-02, US-15). */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.isAdmin() ? true : router.createUrlTree(['/']);
};
