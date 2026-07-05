import { Routes } from '@angular/router';
import { adminGuard } from '../../core/guards/role.guard';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./vehicle-list/vehicle-list.component').then((m) => m.VehicleListComponent),
  },
  {
    path: 'tuv',
    loadComponent: () =>
      import('./tuv-status/tuv-status.component').then((m) => m.TuvStatusComponent),
  },
  {
    path: 'neu',
    canActivate: [adminGuard],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () =>
      import('./vehicle-form/vehicle-form.component').then((m) => m.VehicleFormComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./vehicle-detail/vehicle-detail.component').then((m) => m.VehicleDetailComponent),
  },
  {
    path: ':id/bearbeiten',
    canActivate: [adminGuard],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () =>
      import('./vehicle-form/vehicle-form.component').then((m) => m.VehicleFormComponent),
  },
];
