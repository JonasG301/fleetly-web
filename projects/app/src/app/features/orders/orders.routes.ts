import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./order-list/order-list.component').then((m) => m.OrderListComponent),
  },
];
