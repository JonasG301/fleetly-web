import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialsService } from '../../materials/materials.service';
import { OrderMaterialsService } from '../order-materials.service';

/** Material auf einen Auftrag buchen: Artikel wählen + Menge erfassen. */
@Component({
  selector: 'app-order-material-dialog',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Material buchen</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="order-material-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Artikel</mat-label>
          <mat-select formControlName="materialId" required>
            @for (m of materials.activeMaterials(); track m.id) {
              <mat-option [value]="m.id">
                {{ m.name }} ({{ m.unit_price | currency: 'EUR' : 'symbol' : '1.2-2' : 'de' }} /
                {{ m.unit }})
              </mat-option>
            }
          </mat-select>
          <mat-error>Bitte einen Artikel wählen</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Menge</mat-label>
          <input matInput type="number" formControlName="quantity" min="0" step="0.001" required />
          @if (selected(); as s) {
            <span matTextSuffix>{{ s.unit }}</span>
          }
          <mat-error>Menge muss größer als 0 sein</mat-error>
        </mat-form-field>

        @if (selected(); as s) {
          <p class="sum">
            Summe:
            <strong>{{ lineTotal() | currency: 'EUR' : 'symbol' : '1.2-2' : 'de' }}</strong>
          </p>
        }
      </form>
      @if (materials.activeMaterials().length === 0) {
        <p class="empty">Kein aktives Material im Katalog. Bitte zuerst unter „Material" anlegen.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Abbrechen</button>
      <button
        matButton="filled"
        form="order-material-form"
        type="submit"
        [disabled]="form.invalid || saving()"
      >
        Buchen
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .full-width {
      width: 100%;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(400px, 80vw);
      padding-top: 8px;
    }
    .sum {
      margin: 4px 0 0;
      font-size: 14px;
      color: var(--hugo-ink-muted);
    }
    .empty {
      color: var(--hugo-ink-muted);
      font-size: 13px;
    }
  `,
})
export class OrderMaterialDialogComponent {
  readonly materials = inject(MaterialsService);
  private readonly orderMaterials = inject(OrderMaterialsService);
  private readonly dialogRef = inject(MatDialogRef<OrderMaterialDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  private readonly orderId = inject<string>(MAT_DIALOG_DATA);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    materialId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(0.001)]],
  });

  private readonly materialId = signal(this.form.controls.materialId.value);
  private readonly quantity = signal(this.form.controls.quantity.value);

  readonly selected = computed(() => this.materials.byId(this.materialId()));
  readonly lineTotal = computed(() => (this.selected()?.unit_price ?? 0) * (this.quantity() || 0));

  constructor() {
    void this.materials.load();
    this.form.controls.materialId.valueChanges.subscribe((v) => this.materialId.set(v));
    this.form.controls.quantity.valueChanges.subscribe((v) => this.quantity.set(Number(v) || 0));
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    const material = this.selected();
    if (!material) {
      return;
    }
    this.saving.set(true);
    try {
      await this.orderMaterials.add({
        order_id: this.orderId,
        material_id: material.id,
        material_name: material.name,
        unit: material.unit,
        unit_price: material.unit_price,
        quantity: Number(this.form.controls.quantity.value),
      });
      this.dialogRef.close(true);
    } catch (err) {
      this.snackBar.open('Buchen fehlgeschlagen: ' + (err as Error).message, 'OK', {
        duration: 5000,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
