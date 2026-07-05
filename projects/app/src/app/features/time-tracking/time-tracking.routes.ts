import { Routes } from '@angular/router';

export const stampRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./stamp/stamp.component').then((m) => m.StampComponent),
  },
];

export const myEntriesRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./my-entries/my-entries.component').then((m) => m.MyEntriesComponent),
  },
  {
    path: 'neu',
    loadComponent: () =>
      import('./manual-entry/manual-entry.component').then((m) => m.ManualEntryComponent),
  },
];
