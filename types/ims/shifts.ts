/**
 * IMS Shifts — cashier shift tracking for cash reconciliation.
 * Schema-only for now; service/hooks/UI will follow when shift
 * management features are built.
 */

export type ImsShiftStatus = 'active' | 'closed' | 'reconciled';

export interface ImsShift {
  id: string;
  store_id: string;
  cashier_id: string;
  started_at: string;
  ended_at: string | null;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  notes: string | null;
  status: ImsShiftStatus;
  created_at: string;
  updated_at: string;
}
