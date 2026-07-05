import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./damage-report-list.component').then((m) => m.DamageReportListComponent),
  },
  {
    path: 'neu',
    loadComponent: () =>
      import('./damage-report-form.component').then((m) => m.DamageReportFormComponent),
  },
];
