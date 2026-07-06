import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from 'auth';
import { map } from 'rxjs';
import { ThemeMode, ThemeService } from '../../core/services/theme.service';
import { SyncIndicatorComponent } from '../../shared/components/sync-indicator/sync-indicator.component';

const THEME_ICONS: Record<ThemeMode, string> = {
  system: 'brightness_auto',
  light: 'light_mode',
  dark: 'dark_mode',
};

const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'Darstellung: System',
  light: 'Darstellung: Hell',
  dark: 'Darstellung: Dunkel',
};

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
    MatTooltipModule,
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
          <span class="wordmark"><span class="accent">HU</span>GO</span>
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
          <button
            matIconButton
            (click)="theme.cycle()"
            [attr.aria-label]="themeLabel()"
            [matTooltip]="themeLabel()"
          >
            <mat-icon>{{ themeIcon() }}</mat-icon>
          </button>
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
      --mat-sidenav-content-background-color: var(--hugo-paper);
      --mat-sidenav-content-text-color: var(--hugo-ink);
    }
    .sidenav {
      width: 240px;
      --mat-sidenav-container-background-color: var(--hugo-paper);
      --mat-sidenav-container-text-color: var(--hugo-ink);
      border-right: 1px solid var(--hugo-hairline);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 24px 16px;
    }
    .wordmark {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--hugo-ink);
    }
    .wordmark .accent {
      color: var(--hugo-accent);
    }
    .toolbar {
      display: flex;
      gap: 12px;
      --mat-toolbar-container-background-color: var(--hugo-paper);
      --mat-toolbar-container-text-color: var(--hugo-ink);
      border-bottom: 1px solid var(--hugo-hairline);
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
      --mat-list-list-item-container-color: color-mix(in srgb, var(--hugo-accent) 14%, transparent);
      --mat-list-list-item-leading-icon-color: var(--hugo-accent);
      --mat-list-list-item-label-text-color: var(--hugo-accent);
    }
  `,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);

  readonly isHandset = toSignal(
    this.breakpoints.observe(Breakpoints.Handset).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly themeIcon = computed(() => THEME_ICONS[this.theme.mode()]);
  readonly themeLabel = computed(() => THEME_LABELS[this.theme.mode()]);

  navItems(): NavItem[] {
    return NAV_ITEMS.filter((item) => !item.adminOnly || this.auth.isAdmin());
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
