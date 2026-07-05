export interface CommissionCode {
  id: string;
  code: string;
  label: string;
  description: string | null;
  color: string | null;
  is_active: boolean;
  position: number;
}

export type CommissionCodeInsert = Omit<CommissionCode, 'id'>;
