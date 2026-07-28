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
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
export default function AuditLayout({ children }: { children: ReactNode }) {
  return (
    <RoutePermissionGuard
      exemptPrefixes={[
        '/audit/care/score/',
        '/audit/care/voice/',
        '/audit/care/predict/',
      ]}
    >
      {children}
    </RoutePermissionGuard>
  );
}
