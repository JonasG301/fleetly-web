import { Component } from '@angular/core';
import { Routes } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { AuthService } from 'auth';
import { inject } from '@angular/core';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { NotificationSettingsComponent } from './notification-settings/notification-settings.component';
import { UserManagementComponent } from './user-management/user-management.component';

@Component({
  selector: 'app-settings',
  imports: [MatTabsModule, PageHeaderComponent, NotificationSettingsComponent, UserManagementComponent],
  template: `
    <app-page-header title="Einstellungen" />
    <mat-tab-group>
      <mat-tab label="Benachrichtigungen">
        <div class="tab-content">
          <app-notification-settings />
        </div>
      </mat-tab>
      @if (auth.isAdmin()) {
        <mat-tab label="Nutzerverwaltung">
          <div class="tab-content">
            <app-user-management />
          </div>
        </mat-tab>
      }
    </mat-tab-group>
  `,
  styles: `
    .tab-content {
      padding: 16px 0;
    }
  `,
})
export class SettingsComponent {
  readonly auth = inject(AuthService);
}

export const routes: Routes = [{ path: '', component: SettingsComponent }];
