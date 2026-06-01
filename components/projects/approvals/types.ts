/**
 * Local display helpers for the Approvals feature.
 * Re-exports service types so components only import from one place.
 */

export type { ApprovalStep } from '@/lib/services/projects/approval-service';

export const REQUEST_STATUS_OPTIONS = [
  { key: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  { key: 'approved', label: 'Approved', color: 'bg-green-100 text-green-800' },
  { key: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-800' },
] as const;

export type RequestStatusKey = (typeof REQUEST_STATUS_OPTIONS)[number]['key'];

export const ESCALATION_STATUS_OPTIONS = [
  { key: 'none', label: 'None' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'escalated', label: 'Escalated' },
] as const;

export function statusBadgeClass(status: string): string {
  return (
    REQUEST_STATUS_OPTIONS.find((s) => s.key === status)?.color ??
    'bg-gray-100 text-gray-700'
  );
}

export function statusLabel(status: string): string {
  return REQUEST_STATUS_OPTIONS.find((s) => s.key === status)?.label ?? status;
}
