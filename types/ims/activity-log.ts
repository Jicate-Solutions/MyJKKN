// types/ims/activity-log.ts
// Phase F (2026-04-28): types for IMS end-to-end audit trail.
// Schema source: supabase production ims_activity_log table.

export type ImsActivityEntityType =
  | 'indent'
  | 'grn'
  | 'shipment'
  | 'adjustment'
  | 'sale';

export type ImsActivityAction =
  | 'raised'
  | 'approved'
  | 'rejected'
  | 'verified'
  | 'dispatched'
  | 'received'
  | 'cancelled'
  | 'commented'
  | 'adjusted';

export interface ImsActivityLogEntry {
  id: string;
  institution_id: string;
  entity_type: ImsActivityEntityType;
  entity_id: string;
  action: ImsActivityAction;
  actor_id: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined via PostgREST embed
  actor?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string | null;
  } | null;
}

/**
 * Display configuration per action: badge color + verb form for timeline.
 * Used by the Activity Feed UI component.
 */
export const ACTIVITY_ACTION_LABEL: Record<ImsActivityAction, string> = {
  raised: 'raised',
  approved: 'approved',
  rejected: 'rejected',
  verified: 'verified',
  dispatched: 'dispatched',
  received: 'received',
  cancelled: 'cancelled',
  commented: 'commented on',
  adjusted: 'adjusted',
};

export const ACTIVITY_ACTION_BADGE_CLASS: Record<ImsActivityAction, string> = {
  raised: 'bg-blue-100 text-blue-800 border-blue-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  verified: 'bg-purple-100 text-purple-800 border-purple-200',
  dispatched: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  received: 'bg-teal-100 text-teal-800 border-teal-200',
  cancelled: 'bg-gray-100 text-gray-700 border-gray-200',
  commented: 'bg-slate-100 text-slate-700 border-slate-200',
  adjusted: 'bg-amber-100 text-amber-800 border-amber-200',
};
