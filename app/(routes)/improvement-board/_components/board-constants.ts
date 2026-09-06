/**
 * Shared display + transition constants for the Improvement Board.
 * The RPC `fn_improvement_set_status` is the real authority on legal moves;
 * ALLOWED_MANAGER_TRANSITIONS only decides which options the UI offers.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Inbox,
  Search,
  CheckCircle2,
  Rocket,
  BadgeCheck,
  Archive
} from 'lucide-react';
import type { ImprovementIdeaStatus } from '@/lib/services/improvement/improvement-service';

/** The six kanban columns, in pipeline order. */
export const BOARD_COLUMNS: {
  status: ImprovementIdeaStatus;
  title: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}[] = [
  { status: 'logged', title: 'Logged', icon: Inbox, color: 'text-slate-600', bgColor: 'bg-slate-50' },
  { status: 'under_review', title: 'Under Review', icon: Search, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  { status: 'approved', title: 'Approved', icon: CheckCircle2, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  { status: 'applied', title: 'Applied', icon: Rocket, color: 'text-violet-600', bgColor: 'bg-violet-50' },
  { status: 'verified', title: 'Verified', icon: BadgeCheck, color: 'text-green-700', bgColor: 'bg-green-50' },
  { status: 'closed', title: 'Closed', icon: Archive, color: 'text-gray-600', bgColor: 'bg-gray-50' }
];

export const STATUS_LABEL: Record<ImprovementIdeaStatus, string> = {
  logged: 'Logged',
  under_review: 'Under Review',
  approved: 'Approved',
  applied: 'Applied',
  verified: 'Verified',
  closed: 'Closed',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  not_pursued: 'Not Pursued'
};

export const STATUS_BADGE_CLASS: Record<ImprovementIdeaStatus, string> = {
  logged: 'bg-slate-100 text-slate-800 border-slate-200',
  under_review: 'bg-blue-100 text-blue-800 border-blue-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  applied: 'bg-violet-100 text-violet-800 border-violet-200',
  verified: 'bg-green-100 text-green-800 border-green-200',
  closed: 'bg-gray-100 text-gray-800 border-gray-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  withdrawn: 'bg-gray-100 text-gray-700 border-gray-200',
  not_pursued: 'bg-amber-100 text-amber-800 border-amber-200'
};

/**
 * Forward moves a manager may offer from each status. The RPC still validates
 * every move server-side; this is only the UI's proposed set.
 *
 * This MUST stay a subset of the transition guard inside fn_improvement_set_status.
 * Offering a move the RPC rejects renders a button that throws 'invalid transition'
 * when pressed — two such dead buttons shipped here until 2026-09-01
 * (logged -> not_pursued, and approved -> rejected). __tests__/lib/improvement-board/
 * manager-transitions.test.ts pins this against the RPC's graph; update both together.
 *
 * 'withdrawn' is deliberately absent from every row. The RPC reserves it for the
 * AUTHOR of an idea, pre-approval — it means "I am pulling my own idea", not
 * "a manager closed it". A manager rejects or does not pursue instead.
 */
export const ALLOWED_MANAGER_TRANSITIONS: Record<
  ImprovementIdeaStatus,
  ImprovementIdeaStatus[]
> = {
  logged: ['under_review', 'rejected'],
  under_review: ['approved', 'not_pursued', 'rejected'],
  approved: ['applied', 'not_pursued'],
  applied: ['verified', 'closed'],
  verified: ['closed'],
  closed: [],
  rejected: [],
  withdrawn: [],
  not_pursued: []
};
