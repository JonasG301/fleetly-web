import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Einheitlicher Fehler-Zustand fürs Laden von Listen/Details — unterscheidet
 * sich bewusst optisch vom "keine Daten"-Leerzustand, damit ein Ladefehler
 * nicht als "keine Einträge vorhanden" missverstanden wird.
 */
@Component({
  selector: 'app-load-error',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="load-error">
      <mat-icon>error_outline</mat-icon>
      <span>{{ message() }}</span>
      <button matButton (click)="retry.emit()">
        <mat-icon>refresh</mat-icon>
        Erneut versuchen
      </button>
    </div>
  `,
  styles: `
    .load-error {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      margin: 12px 0;
      background: color-mix(in srgb, var(--hugo-status-critical) 15%, var(--hugo-paper));
      color: var(--hugo-status-critical);
      border-radius: 8px;
    }
    .load-error mat-icon:first-child {
      color: var(--hugo-status-critical);
    }
    .load-error span {
      flex: 1;
    }
  `,
})
export class LoadErrorComponent {
  readonly message = input.required<string>();
  readonly retry = output<void>();
}
