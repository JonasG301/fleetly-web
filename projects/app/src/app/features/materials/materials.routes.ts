import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./material-list.component').then((m) => m.MaterialListComponent),
  },
];
