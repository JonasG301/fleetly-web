/** Katalog-Artikel (Verbrauchsmaterial / Schüttgut), org-gescoped, admin-verwaltet. */
export interface Material {
  id: string;
  name: string;
  unit: string;
  unit_price: number;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export type MaterialInsert = Pick<
  Material,
  'name' | 'unit' | 'unit_price' | 'is_active' | 'position'
>;

/**
 * Auf einen Auftrag gebuchtes Material. `material_name`, `unit` und
 * `unit_price` sind Snapshots vom Buchungszeitpunkt — spätere Katalog-
 * Änderungen wirken sich nicht rückwirkend aus.
 */
export interface OrderMaterial {
  id: string;
  order_id: string;
  material_id: string | null;
  material_name: string;
  unit: string;
  unit_price: number;
  quantity: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderMaterialInsert = Pick<
  OrderMaterial,
  'order_id' | 'material_id' | 'material_name' | 'unit' | 'unit_price' | 'quantity'
> & { created_by?: string | null };
