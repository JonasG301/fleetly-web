import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { confirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog.component';

/**
 * Komponenten mit ungespeicherten Änderungen implementieren dieses Interface.
 * Gibt `hasUnsavedChanges()` true zurück, fragt der Guard vor dem Verlassen nach.
 */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Generischer CanDeactivate-Guard: schützt vor versehentlichem Datenverlust,
 * wenn ein Formular ungespeicherte Änderungen enthält. Nutzt den bestehenden
 * Bestätigungsdialog.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = async (component) => {
  if (!component?.hasUnsavedChanges?.()) {
    return true;
  }
  const dialog = inject(MatDialog);
  return confirmDialog(dialog, {
    title: 'Änderungen verwerfen?',
    message: 'Es gibt ungespeicherte Änderungen. Möchtest du die Seite wirklich verlassen?',
    confirmLabel: 'Verwerfen',
    cancelLabel: 'Weiter bearbeiten',
    destructive: true,
  });
};
