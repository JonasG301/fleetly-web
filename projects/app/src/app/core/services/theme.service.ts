import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'hugo-theme';
const ORDER: ThemeMode[] = ['system', 'light', 'dark'];

/** Steuert den manuellen Hell/Dunkel-Umschalter — persistiert in localStorage, wirkt über `data-theme` am html-Element. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.readStored());

  constructor() {
    effect(() => this.apply(this.mode()));
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }

  cycle(): void {
    const next = ORDER[(ORDER.indexOf(this.mode()) + 1) % ORDER.length];
    this.setMode(next);
  }

  private readStored(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  }

  private apply(mode: ThemeMode): void {
    const root = document.documentElement;
    if (mode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }
  }
}
