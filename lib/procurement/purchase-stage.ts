// lib/procurement/purchase-stage.ts
//
// Where a purchase is, in words people use. A request that has become a quotation
// keeps the status 'converted' forever, so its real stage comes from that quotation
// and its orders. Shared by the Purchases list and the purchase page.

import { PR_STATUS_CONFIG } from '@/types/procurement';

export type PurchaseStage =
  | 'draft'
  | 'submitted'
  | 'returned'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'getting_quotes'
  | 'with_super_admin'
  | 'ordered'
  | 'received';

export const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  ...PR_STATUS_CONFIG,
  submitted: { label: 'Waiting item approval', color: 'amber' },
  approved: { label: 'Getting quotes', color: 'blue' },
  getting_quotes: { label: 'Getting quotes', color: 'blue' },
  with_super_admin: { label: 'Waiting final approval', color: 'amber' },
  ordered: { label: 'Ordered', color: 'green' },
  received: { label: 'Received', color: 'green' },
};

/** Stage filter options for the Purchases list, in the order the work happens. */
export const STAGE_FILTERS: Array<{ value: PurchaseStage; label: string }> = [
  { value: 'submitted', label: 'Waiting item approval' },
  { value: 'returned', label: 'Sent back for changes' },
  { value: 'getting_quotes', label: 'Getting quotes' },
  { value: 'with_super_admin', label: 'Waiting final approval' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'received', label: 'Received' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function stageOf(req: {
  status: string;
  quote_statuses?: string[] | null;
  order_statuses?: string[] | null;
}): string {
  if (req.status !== 'converted') return req.status;
  const orders = (req.order_statuses ?? []).filter((s) => s !== 'cancelled');
  if (orders.length && orders.every((s) => s === 'completed' || s === 'closed')) return 'received';
  const live = (req.quote_statuses ?? []).filter((s) => s !== 'cancelled');
  if (live.some((s) => s === 'awarded' || s === 'closed')) return 'ordered';
  if (live.includes('pending_award_approval')) return 'with_super_admin';
  return 'getting_quotes';
}
