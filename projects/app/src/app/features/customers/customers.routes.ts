import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./customer-list/customer-list.component').then((m) => m.CustomerListComponent),
  },
];
