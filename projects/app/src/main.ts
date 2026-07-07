import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// 'de' wird explizit an Angular-Pipes übergeben (z. B. CalendarDatePipe im Kalender),
// dafür muss die Locale hier einmalig registriert sein — sonst wirft formatDate().
registerLocaleData(localeDe);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
