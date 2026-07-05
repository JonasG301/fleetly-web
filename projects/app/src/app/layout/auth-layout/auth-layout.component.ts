import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, MatIconModule],
  template: `
    <div class="auth-container">
      <div class="branding">
        <mat-icon class="brand-icon">agriculture</mat-icon>
        <h1>fleetly</h1>
        <p>Fuhrpark & Zeiterfassung für moderne Landwirtschaft</p>
      </div>
      <router-outlet />
    </div>
  `,
  styles: `
    .auth-container {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 16px;
      background: #f6f5f2;
    }
    .branding {
      text-align: center;
      color: #4e944f;
    }
    .brand-icon {
      font-size: 56px;
      width: 56px;
      height: 56px;
    }
    h1 {
      margin: 8px 0 4px;
      font-size: 32px;
      font-weight: 700;
    }
    p {
      margin: 0;
      color: rgba(0, 0, 0, 0.6);
    }
  `,
})
export class AuthLayoutComponent {}
