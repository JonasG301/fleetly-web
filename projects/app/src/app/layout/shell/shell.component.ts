import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from 'auth';
import { map } from 'rxjs';
import { SyncIndicatorComponent } from '../../shared/components/sync-indicator/sync-indicator.component';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', route: '/' },
  { label: 'Zeiterfassung', icon: 'timer', route: '/zeiterfassung' },
  { label: 'Meine Zeiten', icon: 'history', route: '/meine-zeiten' },
  { label: 'Kunden', icon: 'business', route: '/kunden', adminOnly: true },
  { label: 'Fuhrpark', icon: 'agriculture', route: '/fuhrpark' },
  { label: 'Schäden', icon: 'report_problem', route: '/schaeden' },
  { label: 'Aufträge', icon: 'assignment', route: '/auftraege' },
  { label: 'Kommissionsnummern', icon: 'tag', route: '/kommissionsnummern', adminOnly: true },
  { label: 'Auswertung', icon: 'bar_chart', route: '/auswertung', adminOnly: true },
  { label: 'Einstellungen', icon: 'settings', route: '/einstellungen' },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    SyncIndicatorComponent,
  ],
  template: `
    <mat-sidenav-container class="shell-container">
      <mat-sidenav
        #sidenav
        [mode]="isHandset() ? 'over' : 'side'"
        [opened]="!isHandset()"
        class="sidenav"
      >
        <div class="logo">
          <mat-icon>agriculture</mat-icon>
          <span>fleetly</span>
        </div>
        <mat-nav-list>
          @for (item of navItems(); track item.route) {
            <a
              mat-list-item
              [routerLink]="item.route"
              routerLinkActive="active-link"
              [routerLinkActiveOptions]="{ exact: item.route === '/' }"
              (click)="isHandset() && sidenav.close()"
            >
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content>
        <mat-toolbar class="toolbar">
          @if (isHandset()) {
            <button matIconButton (click)="sidenav.toggle()" aria-label="Menü">
              <mat-icon>menu</mat-icon>
            </button>
          }
          <span class="spacer"></span>
          <app-sync-indicator />
          <span class="user-name">{{ auth.user()?.fullName }}</span>
          <button matIconButton (click)="logout()" aria-label="Abmelden" title="Abmelden">
            <mat-icon>logout</mat-icon>
          </button>
        </mat-toolbar>
        <main class="content">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .shell-container {
      height: 100vh;
    }
    .sidenav {
      width: 240px;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 16px;
      font-size: 22px;
      font-weight: 700;
      color: #4e944f;
    }
    .toolbar {
      display: flex;
      gap: 12px;
      background: #4e944f;
      color: white;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .spacer {
      flex: 1;
    }
    .user-name {
      font-size: 14px;
      font-weight: 500;
    }
    .content {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .active-link {
      --mat-list-list-item-container-color: rgba(78, 148, 79, 0.14);
      --mat-list-list-item-leading-icon-color: #4e944f;
      --mat-list-list-item-label-text-color: #35683a;
    }
  `,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);

  readonly isHandset = toSignal(
    this.breakpoints.observe(Breakpoints.Handset).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  navItems(): NavItem[] {
    return NAV_ITEMS.filter((item) => !item.adminOnly || this.auth.isAdmin());
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
