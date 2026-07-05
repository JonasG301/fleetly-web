import { Routes } from '@angular/router';
import { LoginComponent, RegisterComponent, ResetPasswordComponent, authGuard } from 'auth';
import { adminGuard } from './core/guards/role.guard';
import { AuthLayoutComponent } from './layout/auth-layout/auth-layout.component';
import { ShellComponent } from './layout/shell/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    component: AuthLayoutComponent,
    children: [{ path: '', component: LoginComponent }],
  },
  {
    path: 'registrieren',
    component: AuthLayoutComponent,
    children: [{ path: '', component: RegisterComponent }],
  },
  {
    path: 'passwort-neu',
    component: AuthLayoutComponent,
    children: [{ path: '', component: ResetPasswordComponent }],
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'kunden',
        canActivate: [adminGuard],
        loadChildren: () => import('./features/customers/customers.routes').then((m) => m.routes),
      },
      {
        path: 'fuhrpark',
        loadChildren: () => import('./features/fleet/fleet.routes').then((m) => m.routes),
      },
      {
        path: 'schaeden',
        loadChildren: () =>
          import('./features/fleet/damage-report/damage-report.routes').then((m) => m.routes),
      },
      {
        path: 'auftraege',
        loadChildren: () => import('./features/orders/orders.routes').then((m) => m.routes),
      },
      {
        path: 'kommissionsnummern',
        canActivate: [adminGuard],
        loadChildren: () =>
          import('./features/commission-codes/commission-codes.routes').then((m) => m.routes),
      },
      {
        path: 'zeiterfassung',
        loadChildren: () =>
          import('./features/time-tracking/time-tracking.routes').then((m) => m.stampRoutes),
      },
      {
        path: 'meine-zeiten',
        loadChildren: () =>
          import('./features/time-tracking/time-tracking.routes').then((m) => m.myEntriesRoutes),
      },
      {
        path: 'auswertung',
        canActivate: [adminGuard],
        loadChildren: () => import('./features/reports/reports.routes').then((m) => m.routes),
      },
      {
        path: 'einstellungen',
        loadChildren: () => import('./features/settings/settings.routes').then((m) => m.routes),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
