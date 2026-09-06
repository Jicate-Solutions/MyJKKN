// Sports Tournaments — shared status badge styling for the list table,
// row-actions "Change Status" submenu and the mobile card. Kept in its own
// module so columns.tsx ↔ row-actions.tsx don't import each other.
//
// 2026-07-15: tournaments moved to a 2-state model — Draft <-> Active (see
// TOURNAMENT_STATUS_* in types/tournament.ts). Draft closes public
// registration; Active ('live' in the DB) opens it. The shared 8-state event
// lifecycle still exists for marathon / induction / startup-studio, so this
// maps any legacy tournament row onto the two states rather than assuming the
// old values can never appear.

import { tournamentStatusLabel } from '@/types/tournament';

export interface StatusBadge {
  label: string;
  color: string;
  bg: string;
}

/** Draft vs Active badge styling for a tournament row. */
export function tournamentStatusBadge(status: string): StatusBadge {
  return status === 'draft'
    ? { label: tournamentStatusLabel(status), color: 'text-gray-600', bg: 'bg-gray-100' }
    : { label: tournamentStatusLabel(status), color: 'text-emerald-700', bg: 'bg-emerald-50' };
}
