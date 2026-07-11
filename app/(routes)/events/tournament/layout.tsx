'use client';

// Sports Tournament module — canonical permission enforcement for the subtree.
// Created 2026-06-22 (Sports Tournament PR1). Every /events/tournament route is
// gated by the SAME permission it declares in MENU_PERMISSIONS, via the same
// isPageAccessible() rule the sidebar uses (see RoutePermissionGuard, PR #1512).
// No public/token pages live under /events/tournament, so the whole subtree is
// gated. (The public no-login scoreboard lives under /p/*; the student-facing
// browse page under /events/tournaments — plural — behind sports.tournaments.browse.)
//
// PLUS a per-event carve-out (2026-07-10): an appointed tournament IN-CHARGE, a
// COMMITTEE lead/member, or a checked-in VOLUNTEER is authorized per event by the
// module's RPCs and RLS, but may hold no sports.tournaments.* key — they were
// blocked here before any of that ran. fn_has_any_tournament_role() lets them into
// the module UI; per-event authorization still gates every page and API call, so
// entering the module leaks nothing. Same pattern as the induction coordinator gate.
// 'use client' is required to pass fallbackCheck to the client guard.

import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
import { hasAnyTournamentRole } from '@/lib/services/events/tournament/tournament-role-access';

// Module scope keeps the reference stable across renders (the guard requires it).
const tournamentRoleFallback = () => hasAnyTournamentRole();

export default function TournamentLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard fallbackCheck={tournamentRoleFallback}>{children}</RoutePermissionGuard>;
}
