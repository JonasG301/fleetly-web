export type OrderStatus = 'open' | 'in_progress' | 'done';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  open: 'Offen',
  in_progress: 'Aktiv',
  done: 'Abgeschlossen',
};

export interface Order {
  id: string;
  customer_id: string;
  order_number: string;
  description: string | null;
  status: OrderStatus;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderInsert = Omit<Order, 'id' | 'created_at' | 'updated_at'>;

export interface OrderVehicle {
  order_id: string;
  vehicle_id: string;
}
