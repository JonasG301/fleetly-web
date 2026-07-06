import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet],
  template: `
    <div class="auth-container">
      <div class="branding">
        <h1><span class="accent">HU</span>GO</h1>
        <p class="tagline">HU · UVV · Geräte · Organisation</p>
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
      background: var(--hugo-paper);
    }
    .branding {
      text-align: center;
      color: var(--hugo-ink);
    }
    h1 {
      margin: 0 0 4px;
      font-size: 36px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    h1 .accent {
      color: var(--hugo-accent);
    }
    .tagline {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: var(--hugo-ink-muted);
    }
    p {
      margin: 0;
      color: var(--hugo-ink-muted);
    }
  `,
})
export class AuthLayoutComponent {}
