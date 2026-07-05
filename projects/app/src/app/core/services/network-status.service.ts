import { Injectable, NgZone, inject, signal } from '@angular/core';

/**
 * Online/Offline als Signal (US-19). navigator.onLine ist nur ein Hinweis —
 * der Sync-Service behandelt fehlgeschlagene Requests zusätzlich als offline.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly zone = inject(NgZone);
  private readonly _isOnline = signal(navigator.onLine);

  readonly isOnline = this._isOnline.asReadonly();

  constructor() {
    window.addEventListener('online', () => this.zone.run(() => this._isOnline.set(true)));
    window.addEventListener('offline', () => this.zone.run(() => this._isOnline.set(false)));
  }

  /** Vom Sync-Service gemeldet, wenn Requests trotz onLine=true scheitern. */
  reportConnectivity(online: boolean): void {
    this._isOnline.set(online);
  }
}
