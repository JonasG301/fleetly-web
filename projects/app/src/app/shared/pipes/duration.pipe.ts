import { Pipe, PipeTransform } from '@angular/core';

/** Sekunden → "2h 15m" (Anzeige von Arbeitszeiten). */
@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(seconds: number | null | undefined): string {
    if (seconds == null || seconds < 0) {
      return '–';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0 && minutes === 0) {
      return '< 1m';
    }
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
}
