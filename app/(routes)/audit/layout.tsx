'use client';

// Audit module (CARE framework) — canonical permission enforcement.
// Created 2026-06-19. Admin audit pages (cycles, findings, dashboard,
// parameters, care setup) were unguarded and rendered to any authenticated
// user. Gated here by each route's declared MENU_PERMISSIONS permission.
//
// EXEMPTION: /audit/care/score/[token] is the blind second-scorer page reached
// by external participants via a token-validated link — they legitimately lack
// audit.* permissions. The trailing-slash prefix exempts ONLY that token child;
// the admin scorer-setup page /audit/care/score itself stays gated.
// Same contract for /audit/care/voice/[cycleId]: the SEALED participant lane
// door for learners (fn_carre_participant_context/score are the server-side
// gate — learners only, open cycles only). The parent path stays gated.
// And for /audit/care/predict/[cycleId]: the predict-then-see calibration
// mirror for team members below audit leadership (fn_carre_predict_* gate
// server-side). Parent paths stay gated in all three cases.
//
// CARVE-OUT (2026-07-30): /audit/care/new. Opening a culture audit has always
// been "any team member" by design — fn_carre_create_audit and
// fn_carre_create_classroom_audit enforce staff-only server-side and the page
// renders every denial explicitly (rule #27). But '/audit' declares
// audit.cycle.view in MENU_PERMISSIONS and the matcher inherits that down to
// every /audit/** child, so this guard silently overrode that design once it
// shipped. An ordinary Senior Learner could not reach the form to open an audit
// on their own practice.
// It is granted through the fallback on an EXACT pathname match rather than via
// exemptPrefixes, because a bare (no-trailing-slash) prefix also matches
// descendants — a future /audit/care/new/<something> would silently inherit the
// carve-out. Exact match cannot drift that way. (Review #2586, LOW 7.)
//
// OWNER CARVE-OUT (2026-07-30): the same inheritance locked a cycle's OWN lead
// auditor out of /audit/care/[cycleId] with "Required Permission:
// audit.cycle.view" — verified live against a real cycle with the test.faculty
// persona. Launch-critical for Classroom Practice, where every Senior Learner
// owns a cycle and none of them hold audit.cycle.view. The carve-out runs ONLY
// after the static check denies, and admits ONLY the lead auditor of that exact
// cycle, via the already-shipped, anon-revoked fn_carre_is_cycle_owner. Nothing
// leadership-only is widened: the sealed rollup, the compare and the evidence
// panels each gate themselves inside their own RPC, so entering the page grants
// no data the caller could not already read.
// 'use client' is required to pass the fallbackCheck function to the client
// guard (same shape as app/(routes)/events/induction/layout.tsx).

import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
import { CarreAuditService } from '@/lib/services/audit/carre-audit-service';

/**
 * A cycle detail path is /audit/care/<uuid>. Matching the UUID shape is what
 * keeps this carve-out off the sibling routes: /audit/care/coverage (the
 * leadership map), /new, /predict, /score and /voice are all also one segment
 * under /audit/care, and a looser pattern would swallow them.
 */
const CYCLE_DETAIL_PATH =
  /^\/audit\/care\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

// Module scope keeps the reference stable across renders (the guard requires it).
async function auditOwnerFallback(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname;

  // Exact match only — see the carve-out note above.
  if (pathname === '/audit/care/new') {
    return true;
  }

  const detail = CYCLE_DETAIL_PATH.exec(pathname);
  if (detail) {
    return CarreAuditService.isCycleOwner(detail[1]!);
  }

  // The list page is how an owner gets back to a cycle they already opened.
  // fn_carre_list_audits self-gates to own-plus-leadership rows, so "has at
  // least one row" is exactly the set of people the list can serve; everyone
  // else stays denied rather than being shown an empty shell.
  if (pathname === '/audit/care') {
    try {
      const rows = await CarreAuditService.listAudits();
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  return false;
}

const EXEMPT_PREFIXES = [
  '/audit/care/score/',
  '/audit/care/voice/',
  '/audit/care/predict/',
];

export default function AuditLayout({ children }: { children: ReactNode }) {
  return (
    <RoutePermissionGuard
      exemptPrefixes={EXEMPT_PREFIXES}
      fallbackCheck={auditOwnerFallback}
    >
      {children}
    </RoutePermissionGuard>
  );
}
