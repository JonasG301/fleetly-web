import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { catchError, of } from 'rxjs';
import { VehicleCategory } from '../../../core/models/vehicle.model';

/**
 * Fahrzeugansicht (Perspektive). "side" ist die Standardansicht und deckungsgleich
 * mit der Datei ohne Suffix (z. B. damage-diagrams/traktor.svg). Weitere Ansichten
 * verwenden ein Suffix (z. B. damage-diagrams/traktor-front.svg).
 */
export type VehicleDiagramView = 'side' | 'front' | 'rear' | 'left' | 'right';

export const VEHICLE_DIAGRAM_VIEWS: VehicleDiagramView[] = ['front', 'rear', 'left', 'right'];

export const VEHICLE_DIAGRAM_VIEW_LABELS: Record<VehicleDiagramView, string> = {
  side: 'Seite',
  front: 'Front',
  rear: 'Heck',
  left: 'Links',
  right: 'Rechts',
};

const ASSET_BASE = 'damage-diagrams';

/**
 * Dateiname unter /public/damage-diagrams/ je Kategorie. Weicht vom
 * Kategorie-Schlüssel ab, wo die hochgeladenen Illustrationen einen anderen
 * Namen verwenden (z. B. "car" statt "pkw"). Kategorien ohne Eintrag nutzen
 * den Kategorie-Schlüssel selbst als Dateiname (z. B. "traktor").
 */
const ASSET_FILE_NAME: Partial<Record<VehicleCategory, string>> = {
  pkw: 'car',
  lkw: 'transporter',
  teleskoplader: 'tele',
};

/*
 * Icon-Pfade von game-icons.net (CC BY 3.0, https://creativecommons.org/licenses/by/3.0/):
 *   Delapouite      – city-car, truck, bulldozer, forklift
 *   Caro Asercion   – bucket-wheel-excavator, steamroller
 *   Skoll           – flatbed
 * Fallback für Kategorien, für die noch keine eigene Illustration unter
 * /public/damage-diagrams/ hinterlegt wurde. Es wird nur der reine Icon-Pfad
 * übernommen (ohne den quadratischen Kachel-Hintergrund der Originaldateien),
 * Füllfarbe folgt --hugo-ink.
 */
const VEHICLE_ICON_PATHS: Record<VehicleCategory, string> = {
  pkw: 'M188.287 169.428c-28.644-.076-60.908 2.228-98.457 8.01-4.432.62-47.132 24.977-58.644 41.788-11.512 16.812-15.45 48.813-15.45 48.813-3.108 13.105-1.22 34.766-.353 36.872 1.17 4.56 7.78 8.387 19.133 11.154C35.84 295.008 53.29 278.6 74.39 278.574c22.092 0 40 17.91 40 40-.014 1.764-.145 3.525-.392 5.272.59.008 1.26.024 1.82.03l239.266 1.99c-.453-2.405-.685-4.845-.693-7.292 0-22.09 17.91-40 40-40 22.092 0 40 17.91 40 40 0 2.668-.266 5.33-.796 7.944l62.186.517c1.318-22.812 6.86-46.77-7.024-66.72-5.456-7.84-31.93-22.038-99.03-32.66-34.668-17.41-68.503-37.15-105.35-48.462-28.41-5.635-59.26-9.668-96.09-9.765zm-17.197 11.984c5.998.044 11.5.29 16.014.81l7.287 48.352c-41.43-5.093-83.647-9.663-105.964-27.5.35-5.5 7.96-13.462 16.506-16.506 4.84-1.724 40.167-5.346 66.158-5.156zm34.625.348c25.012.264 62.032 2.69 87.502 13.94 12.202 5.65 35.174 18.874 50.537 30.55l-6.35 10.535c-41.706-1.88-97.288-4.203-120.1-6.78l-11.59-48.245zM74.39 294.574a24 24 0 0 0-24 24 24 24 0 0 0 24 24 24 24 0 0 0 24-24 24 24 0 0 0-24-24zm320 0a24 24 0 0 0-24 24 24 24 0 0 0 24 24 24 24 0 0 0 24-24 24 24 0 0 0-24-24z',
  traktor: 'M152.864 59l-4.21 20h33.816l-4.211-20zm3.698 38v14h18V97zm-30.715 32l-7.78 94h17.145l6-80h130.545l-2-14zm302.715 23v74.602a593.471 593.471 0 0 1 18 1.666V152zm-270.65 9l-4.651 62h6.3c10.003 0 19.544 4.28 29 10.645V161zm48.65 0v84.26l78 8.681v-21.296L274.327 161zm-121 80c-8 0-23.292 6.759-37.377 18.027-10.908 8.726-21.254 19.89-28.747 31.166l16.813 4.203C56.271 269.225 87.129 253 121.561 253c50.594 0 93.48 35.024 105.586 82h20.409c-9.132-18.739-23.077-40.212-38.323-57.889-9.33-10.819-19.063-20.19-27.945-26.601-8.881-6.412-16.88-9.51-21.726-9.51zm217 .059V351h32.15c9.085-30.155 26.196-50.771 49.125-61.193 12.31-5.596 25.987-8.305 40.736-8.578 11.399-.212 23.445 1.049 35.989 3.54v-36.49c-11.495-1.781-25.084-3.178-39.633-4.203-40.207-2.831-86.16-3-118.367-3.017zm176 10.814V351h14v-13.41c-3.978-2.698-9.906-4.606-14-5.717zM222.7 265.168c.054.063.11.123.164.186 19.996 23.183 37.843 51.59 47.086 75.386l4.762 12.26h-44.53c.247 2.97.38 5.97.38 9 0 7.178-.713 14.198-2.057 21h56.057V272.055zM121.562 271c-50.081 0-91 40.92-91 91s40.919 91 91 91c50.08 0 91-40.92 91-91s-40.92-91-91-91zm357 18v14h14v-14zm-357 4c38.16 0 69 30.84 69 69s-30.84 69-69 69c-38.161 0-69-30.84-69-69s30.839-69 69-69zm307.603 6.27c-12.894.164-27.37 2.264-37.879 6.923-16.839 7.654-29.674 21.545-37.691 44.807h10.57c13.936-22.718 39.012-38 67.397-38a77.97 77.97 0 0 1 29 5.6v-15.448c-11.185-2.416-21.683-3.723-31.397-3.882zM121.562 311c-28.588 0-51 22.413-51 51s22.412 51 51 51c28.587 0 51-22.413 51-51s-22.413-51-51-51zm357 10v7.67a80.334 80.334 0 0 1 14 13.357V321zm-47 10c-33.493 0-61 27.508-61 61 0 33.492 27.507 61 61 61 33.492 0 61-27.508 61-61 0-33.492-27.508-61-61-61zm0 22c21.516 0 39 17.484 39 39s-17.484 39-39 39c-21.517 0-39-17.484-39-39s17.483-39 39-39zm-129 16v15.377l50.01 8.334c-.003-.237-.01-.473-.01-.711 0-7.988 1.219-15.71 3.464-23zm129 2c-12.095 0-21 8.905-21 21s8.905 21 21 21c12.094 0 21-8.905 21-21s-8.906-21-21-21z',
  anhaenger: 'M97.597 296.31l-60.152-6.047v-23.826h81.745a54.402 54.402 0 0 0-21.593 29.872zM491 311.183a36.866 36.866 0 1 1-36.876-36.866A36.866 36.866 0 0 1 491 311.184zm-6.433 0a30.443 30.443 0 1 0-30.443 30.443 30.474 30.474 0 0 0 30.453-30.443zm-30.433-13.142a13.1 13.1 0 1 0 13.1 13.101 13.1 13.1 0 0 0-13.1-13.1zm-267.543 13.142a36.866 36.866 0 1 1-36.876-36.866 36.866 36.866 0 0 1 36.876 36.866zm-36.876-30.473a30.443 30.443 0 1 0 30.443 30.442 30.474 30.474 0 0 0-30.443-30.442zm0 17.331a13.1 13.1 0 1 0 13.1 13.101 13.1 13.1 0 0 0-13.1-13.1zm118.713-103.767H21v55.85h247.428v-55.85zm219.626 64.393v10.287a54.167 54.167 0 0 0-88.138 42.24H282.1a25.57 25.57 0 0 0-22.256-13.153h-57.522a54.371 54.371 0 0 0-22.113-31.605h104.705v-93.572a12.51 12.51 0 0 1 12.51-12.51h67.604a12.51 12.51 0 0 1 12.51 12.51v2.723h-7.922v44.695h80.093a38.385 38.385 0 0 1 38.345 38.375zm-125.748-83.08H309.29V228h53.016v-52.413z',
  lkw: 'M188.287 169.428c-28.644-.076-60.908 2.228-98.457 8.01-4.432.62-47.132 24.977-58.644 41.788-11.512 16.812-15.45 48.813-15.45 48.813-3.108 13.105-1.22 34.766-.353 36.872 1.17 4.56 7.78 8.387 19.133 11.154C35.84 295.008 53.29 278.6 74.39 278.574c22.092 0 40 17.91 40 40-.014 1.764-.145 3.525-.392 5.272.59.008 1.26.024 1.82.03l239.266 1.99c-.453-2.405-.685-4.845-.693-7.292 0-22.09 17.91-40 40-40 22.092 0 40 17.91 40 40 0 2.668-.266 5.33-.796 7.944l62.186.517c1.318-22.812 6.86-46.77-7.024-66.72-5.456-7.84-31.93-22.038-99.03-32.66-34.668-17.41-68.503-37.15-105.35-48.462-28.41-5.635-59.26-9.668-96.09-9.765z',
  bagger: 'M123.241 448.98h186.552v-16.66H123.241zm20-36.66h146.552v-33.337H143.241zm204.782-157.87 24.012 30.665 50.64 3.329v59.358l-104.194.489-2.371 10.604 20.722-2.53 12.457 39.758 16.68-12.551 30.668 28.198 8.17-19.205 40.661 9.091-2.53-20.722 39.759-12.457-12.552-16.68 28.203-30.668-19.21-8.17 9.091-40.661-20.721 2.53-12.458-39.759-16.68 12.552-30.668-28.203-8.17 19.21-40.661-9.091 2.53 20.721zm-66.493 94.014-4.537 15.47h-34.975l-3.632-15.267zm-146.337-90.573L104.112 94.166H247.08l.819 19.246h-42l-3.462 14.087h-68.793l27.748 140.232 27.541 10.343 34.83-151.741 122.003 1.403-6.836 26.417 32.053 65.283-15.642-3.497-21.876-44.554-13.756 46.904-11.907-15.207 13.592-42.189-67.782-.744 112.851 135.039 45.795 3.011v39.235l-213.552 1.002-5.852 25.498-37.57-.214-7.635-40.215-125.612-61.618 7.511-13.01 67.714-132.465z',
  radlader: 'M94.071 92.535v85.772c5.493.912 10.978 1.915 16.346 3.062 1.052-16.604 6.311-33.717 19.521-47.064 14.006-14.151 36.123-23.201 68.34-24.377l-1.838-17.393zm290.104 24.387l-17.938 1.496 3.451 41.416 17.961-1.209zm-184 10.963c-29.839.853-47.228 8.759-57.444 19.08-10.324 10.431-14.198 24.227-14.498 39.074 16.892 7.201 32.876 13.728 34.407 32.443l48.607 14.243zm64.564 15.851v50.268h16.135v-50.268zm124.407 32.828l-17.963 1.207 3.11 37.336L353.2 227.47l2.43 19.437 20.322-11.908 6.37 76.422c4.133-8.828 9.474-17.361 15.949-25.34zm-332.26 18.737l-30.067 75.166 15.672 26.12 27.926-49.024 43.803.826 163.758 49.17 27.59 32.978h42.378l-14.875-118.99-106.627-6.272 3.526 33.371 58.347 17.397-5.142 17.248c-46.641-13.699-94.304-28.4-140.537-41.912 3.413-15.453 1.87-18.897-11.332-24.932-24.049-10.298-47.517-9.563-74.42-11.146zm23.88 70.459l-57.8 101.474 32.762 48.635h213.005l43.418-49.41-44.517-53.211-156.225-46.91zm311.5 11.56c-27.812 30.32-34.254 70.426-16.715 98.655 7.529 12.117 27.669 20.92 51.041 25.056 12.635 2.236 25.873 3.169 38.076 3.354-30.21-21.402-48.91-41.992-59.601-63.692-10.052-20.402-12.867-41.244-12.801-63.373zm-311.5 6.44c-4.562 0-8.067 3.504-8.067 8.066 0 4.562 3.505 8.069 8.067 8.069s8.068-3.507 8.068-8.069c0-4.562-3.506-8.066-8.068-8.066zm130.74 25.63c21.985 0 40 18.016 40 40 0 21.985-18.015 40-40 40s-40-18.015-40-40c0-21.984 18.015-40 40-40zM81.962 335.73c17.843 0 32.5 14.657 32.5 32.5 0 17.842-14.655 32.5-32.498 32.5-17.843 0-32.5-14.658-32.5-32.5 0-17.843 14.655-32.5 32.498-32.5zm153.91 6.74c-12.258 0-22.002 9.744-22.002 22.002s9.744 22 22.002 22 22.002-9.742 22.002-22-9.744-22.002-22.002-22.002zm84.752 6.066l15.236 18.211-13.173 14.992h53.322c-3.336-10.645-4.5-21.877-3.65-33.203zm-238.662 5.192c-8.116 0-14.5 6.386-14.5 14.502 0 8.115 6.386 14.501 14.502 14.501s14.5-6.386 14.5-14.501c0-8.116-6.386-14.502-14.502-14.502z',
  walze: 'M194.8 114.6l-21.8 4.6-4 22.8 13.1 8.2-12.5 87.6c-71.85 9.7-106.95 58.9-106.95 58.9s34.1-27.6 100.45-26.2l31.7 35.7h73.3l57.9-51.9 6.4-18.2H324l-10.7-89.2 3.7-5.8v-18.7zm10 39.1l85.7.7 10.6 81-107.6.2zm181.5 112.8c-33 0-61.9 19.2-75.5 47.1H462c-13.7-27.9-42.4-47.1-75.7-47.1zm-236.2 26.8l-6.2.4c-93.55 5.5-117.15 59.7-117.15 59.7l-1.2 2.5V401h25v-39c5.1-8 27.9-37.5 88.55-42.9l24.9 29.2 8.1 9.5 19.2-16.3zm67.7 35.8v16.7h38.5v-16.7zm68.2 1.2l-12.1 20.4 12.1 20.4h135.2l64.3-23v-17.8zm-171.1 12.9c-24.75 0-44.95 20.2-44.95 45S90.15 433 114.9 433c25 0 45.1-20 45.1-44.8 0-24.8-20.1-45-45.1-45zm102.9 18l.1 16.7h38.4v-16.7zm-102.9 7c11.1 0 20.1 9 20.1 20 0 11.1-9 19.8-20.1 19.8-11 0-19.95-8.7-19.95-19.8 0-11 8.95-20 19.95-20zm352.9 3.9l-43.7 15.6H310.7c13.7 28.3 42.5 47.3 75.6 47.3 39.2 0 72-27 81.5-62.9zm-249.9 21.2V410h38.4v-16.7z',
  stapler: 'M33 120v127.648c5.023 1.863 9.31 5.103 12.68 8.682 5.238 5.562 9.034 12.113 12.498 18.242 3.463 6.13 6.61 11.886 9.343 15.446C70.257 293.578 71.618 294 72 294c.59 0 .78.075 2.36-1.8 1.583-1.877 3.57-5.405 5.683-9.405 2.114-4 4.356-8.472 7.832-12.596 3.476-4.125 9.172-8.2 16.125-8.2 6.953 0 12.65 4.075 16.125 8.2 3.476 4.123 5.718 8.595 7.832 12.595s4.1 7.528 5.682 9.404c1.58 1.875 1.77 1.8 2.36 1.8.59 0 .78.075 2.36-1.8 1.583-1.877 3.57-5.405 5.683-9.405 2.114-4 4.356-8.472 7.832-12.596 3.476-4.125 9.172-8.2 16.125-8.2 6.953 0 12.65 4.075 16.125 8.2 3.476 4.123 5.718 8.595 7.832 12.595s4.1 7.528 5.682 9.404c1.58 1.875 1.77 1.8 2.36 1.8.59 0 .78.075 2.36-1.8 1.583-1.877 3.57-5.405 5.683-9.405 2.114-4 4.356-8.472 7.832-12.596 3.476-4.125 9.172-8.2 16.125-8.2 6.953 0 12.65 4.075 16.125 8.2 3.476 4.123 5.718 8.595 7.832 12.595s4.1 7.528 5.682 9.404c1.58 1.875 1.77 1.8 2.36 1.8.59 0 .78.075 2.36-1.8 1.583-1.877 3.57-5.405 5.683-9.405 2.114-4 4.356-8.472 7.832-12.596 3.476-4.125 9.172-8.2 16.125-8.2 6.953 0 12.448 3.3 17.025 7.004 2.142 1.733 4.125 3.638 5.975 5.617V120H33zm320 49.377v140.27l8-.026V326h3.81c9.298-18.914 28.774-32 51.19-32 19.463 0 36.707 9.867 47 24.846V262h16v-36.275l-28.256-42.385L353 169.377zM72 310c-22.537 0-41 18.463-41 41s18.463 41 41 41 41-18.463 41-41-18.463-41-41-41zm104 0c-22.537 0-41 18.463-41 41s18.463 41 41 41 41-18.463 41-41-18.463-41-41-41zm240 0c-22.537 0-41 18.463-41 41s18.463 41 41 41 41-18.463 41-41-18.463-41-41-41zM72 328c12.81 0 23 10.19 23 23s-10.19 23-23 23-23-10.19-23-23 10.19-23 23-23zm104 0c12.81 0 23 10.19 23 23s-10.19 23-23 23-23-10.19-23-23 10.19-23 23-23zm240 0c12.81 0 23 10.19 23 23s-10.19 23-23 23-23-10.19-23-23 10.19-23 23-23z',
  teleskoplader: '',
  sonstiges: '',
};

const FALLBACK_LABEL = 'sonstiges';

/** In-Memory-Cache über alle Komponenteninstanzen hinweg — jede Datei wird nur einmal geladen. */
const svgMarkupCache = new Map<string, SafeHtml | null>();

/**
 * Entfernt width/height vom äußeren <svg>-Tag (z. B. exportieren manche Tools
 * ungültige Werte wie height="auto", was die Browser-Konsole mit Fehlern
 * flutet) — die Größe wird ausschließlich über CSS gesteuert.
 */
function stripRootSvgSize(svgText: string): string {
  return svgText.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/gi, ''));
}

/**
 * Klickbare Fahrzeug-Silhouette je Kategorie und Perspektive (Schadensposition
 * markieren). Eigene Illustrationen werden aus /public/damage-diagrams/
 * geladen und inline gerendert (statt als <img>), damit die Füllfarbe über
 * --hugo-ink automatisch hell/dunkel folgt — dafür reicht eine Datei pro
 * Motiv. Gibt es für eine Kategorie/Ansicht noch keine eigene Datei, fällt die
 * Komponente auf ein generisches Icon (nur für "side") bzw. eine einfache
 * Platzhaltersilhouette zurück.
 * Position wird als Prozent-Koordinate (0–100) relativ zum Diagramm emittiert/
 * angezeigt, damit sie unabhängig von der tatsächlichen Darstellungsgröße ist.
 */
@Component({
  selector: 'app-vehicle-damage-diagram',
  template: `
    <div
      class="diagram"
      [class.interactive]="interactive()"
      [class.fill]="fill()"
      [style.max-width.px]="fill() ? null : maxWidthPx()"
      (click)="onClick($event)"
    >
      @if (illustrationMarkup(); as markup) {
        <div class="illustration" [innerHTML]="markup"></div>
      } @else if (illustrationLoading()) {
        <div class="illustration-loading"></div>
      } @else if (iconPath()) {
        <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
          <path [attr.d]="iconPath()" class="glyph" />
        </svg>
      } @else {
        <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg">
          <rect x="45" y="70" width="210" height="40" rx="6" class="fallback-body" />
          <circle cx="95" cy="122" r="15" class="fallback-body" />
          <circle cx="205" cy="122" r="15" class="fallback-body" />
        </svg>
      }
      @if (x() !== null && y() !== null) {
        <div class="marker" [style.left.%]="x()" [style.top.%]="y()"></div>
      }
      @for (m of markers(); track m.id) {
        <div
          class="marker clickable"
          [style.left.%]="m.x"
          [style.top.%]="m.y"
          (click)="onMarkerClick($event, m.id)"
        ></div>
      }
    </div>
  `,
  styles: `
    /* Kein festes Seitenverhältnis (kein aspect-ratio/height) mehr — die Box
       passt sich der Höhe des jeweils gerenderten SVGs an (dessen eigenes
       viewBox-Seitenverhältnis bestimmt via height:auto die Höhe), statt ein
       eigenes Quadrat vorzugeben. */
    .diagram {
      position: relative;
      display: block;
      width: 100%;
      line-height: 0;
      border: 1px solid color-mix(in srgb, var(--hugo-ink) 15%, transparent);
      border-radius: 8px;
      background: var(--hugo-paper);
      overflow: hidden;
    }
    .diagram.interactive {
      cursor: crosshair;
    }
    /* fill: Box nimmt die volle Größe des Elternelements ein (z. B. im
       Vollbild-Dialog), statt sich nur an der Breite zu orientieren. Die
       SVGs bekommen dann ebenfalls height:100% — das Standard-
       preserveAspectRatio ("xMidYMid meet") skaliert sie automatisch so
       groß wie möglich in die verfügbare Fläche, ohne zu verzerren. */
    .diagram.fill {
      width: 100%;
      height: 100%;
    }
    svg {
      width: 100%;
      height: auto;
      display: block;
      padding: 12px;
      box-sizing: border-box;
    }
    .diagram.fill > svg {
      height: 100%;
    }
    .illustration {
      width: 100%;
      padding: 8px;
      box-sizing: border-box;
    }
    .diagram.fill .illustration {
      height: 100%;
    }
    .illustration-loading {
      width: 100%;
      aspect-ratio: 16 / 9;
    }
    .diagram.fill .illustration-loading {
      height: 100%;
      aspect-ratio: auto;
    }
    /* Eigene Illustrationen sind grau schattierte Zeichnungen mit vielen
       Graustufen (kein einfarbiger Umriss) — die Schattierung muss erhalten
       bleiben, daher keine Neueinfärbung per fill. Im Darkmode wird die
       Graustufen-Grafik stattdessen invertiert, damit hell/dunkel ohne
       Zweitdatei funktioniert. ::ng-deep ist hier nötig, weil per [innerHTML]
       eingefügte Elemente keine Angular-Scoping-Attribute besitzen. */
    .illustration ::ng-deep svg {
      width: 100%;
      height: auto;
      display: block;
      padding: 0;
    }
    .diagram.fill .illustration ::ng-deep svg {
      height: 100%;
    }
    :host-context(html[data-theme='dark']) .illustration ::ng-deep svg {
      filter: invert(1);
    }
    @media (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme='light'])) .illustration ::ng-deep svg {
        filter: invert(1);
      }
    }
    .glyph {
      fill: var(--hugo-ink);
    }
    .fallback-body {
      fill: none;
      stroke: var(--hugo-ink);
      stroke-width: 1.75;
    }
    .marker {
      position: absolute;
      width: 18px;
      height: 18px;
      margin: -9px 0 0 -9px;
      border-radius: 50%;
      background: var(--hugo-status-critical, #d32f2f);
      border: 2px solid white;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
      pointer-events: none;
    }
    .marker.clickable {
      pointer-events: auto;
      cursor: pointer;
    }
  `,
})
export class VehicleDamageDiagramComponent {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  /** Freitext-Kategorie vom Fahrzeug (vehicles.type) — unbekannte Werte fallen auf die generische Silhouette zurück. */
  readonly rawCategory = input<string | null>(null, { alias: 'category' });
  readonly view = input<VehicleDiagramView>('front');
  readonly x = input<number | null>(null);
  readonly y = input<number | null>(null);
  readonly interactive = input(false);
  readonly maxWidthPx = input(420);
  /** Füllt die volle Höhe/Breite des Elternelements statt sich an maxWidthPx zu orientieren. */
  readonly fill = input(false);
  /** Mehrere klickbare Marker (z. B. alle Schäden eines Fahrzeugs auf einer Ansicht). */
  readonly markers = input<{ id: string; x: number; y: number }[]>([]);

  readonly pick = output<{ x: number; y: number }>();
  readonly markerClick = output<string>();

  readonly category = computed<VehicleCategory>(() => {
    const raw = this.rawCategory();
    return raw && raw in VEHICLE_ICON_PATHS ? (raw as VehicleCategory) : FALLBACK_LABEL;
  });

  readonly iconPath = computed(() => VEHICLE_ICON_PATHS[this.category()] || null);

  private readonly assetUrl = computed(() => {
    const cat = this.category();
    const fileName = ASSET_FILE_NAME[cat] ?? cat;
    const view = this.view();
    const suffix = view === 'side' ? '' : `-${view}`;
    return `${ASSET_BASE}/${fileName}${suffix}.svg`;
  });

  private readonly loadedMarkup = signal<SafeHtml | null>(null);
  readonly illustrationLoading = signal(false);
  readonly illustrationMarkup = computed(() => this.loadedMarkup());

  private requestId = 0;

  constructor() {
    // Lädt bei Kategorie-/Ansichtswechsel die passende SVG-Datei (mit Cache).
    // Fehlt die Datei (404), bleibt loadedMarkup null und die Fallback-Kette greift.
    effect(() => {
      const url = this.assetUrl();
      this.loadIllustration(url);
    });
  }

  private loadIllustration(url: string): void {
    if (svgMarkupCache.has(url)) {
      this.loadedMarkup.set(svgMarkupCache.get(url) ?? null);
      this.illustrationLoading.set(false);
      return;
    }

    const myRequestId = ++this.requestId;
    this.loadedMarkup.set(null);
    this.illustrationLoading.set(true);

    this.http
      .get(url, { responseType: 'text' })
      .pipe(catchError(() => of(null)))
      .subscribe((svgText) => {
        const markup = svgText
          ? this.sanitizer.bypassSecurityTrustHtml(stripRootSvgSize(svgText))
          : null;
        svgMarkupCache.set(url, markup);
        if (this.requestId === myRequestId) {
          this.loadedMarkup.set(markup);
          this.illustrationLoading.set(false);
        }
      });
  }

  onClick(event: MouseEvent): void {
    if (!this.interactive()) return;
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    this.pick.emit({
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
    });
  }

  onMarkerClick(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.markerClick.emit(id);
  }
}
