// Student-facing tournament browse page — permission gate.
// Gated by this route's MENU_PERMISSIONS entry ('/events/tournaments' ->
// 'sports.tournaments.browse'), which the student role holds.
//
// Deliberately a SEPARATE subtree from /events/tournament (singular, admin):
// the admin detail page renders sponsors, budget, committees, volunteers and
// every entrant's payment status, so it must stay behind sports.tournaments.view.
// Created 2026-07-10 (tournament access model).
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function TournamentBrowseLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
