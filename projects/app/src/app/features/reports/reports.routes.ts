import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-report/admin-report.component').then((m) => m.AdminReportComponent),
  },
];
