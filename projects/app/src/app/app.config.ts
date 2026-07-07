import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAuth } from 'auth';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
    provideAnimationsAsync(),
    // Global statt nur per MatNativeDateModule-Import in den Formular-Komponenten:
    // Dialoge, die MatDialog dynamisch erzeugt (Auftrags-/Termin-Formulare), fanden den
    // DateAdapter sonst nicht (NG0201) — provideNativeDateAdapter() im Root-Environment-
    // Injector behebt das für alle Datepicker in der App.
    provideNativeDateAdapter(),
    provideAuth({
      supabaseUrl: environment.supabaseUrl,
      supabaseAnonKey: environment.supabaseAnonKey,
      captchaSiteKey: environment.turnstileSiteKey,
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
