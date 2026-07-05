import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./commission-code-list.component').then((m) => m.CommissionCodeListComponent),
  },
];
