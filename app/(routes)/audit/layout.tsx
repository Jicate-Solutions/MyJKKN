// Audit module (CARE framework) — canonical permission enforcement.
// Created 2026-06-19. Admin audit pages (cycles, findings, dashboard,
// parameters, care setup) were unguarded and rendered to any authenticated
// user. Gated here by each route's declared MENU_PERMISSIONS permission.
//
// EXEMPTION: /audit/care/score/[token] is the blind second-scorer page reached
// by external participants via a token-validated link — they legitimately lack
// audit.* permissions. The trailing-slash prefix exempts ONLY that token child;
// the admin scorer-setup page /audit/care/score itself stays gated.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
export default function AuditLayout({ children }: { children: ReactNode }) {
  return (
    <RoutePermissionGuard exemptPrefixes={['/audit/care/score/']}>
      {children}
    </RoutePermissionGuard>
  );
}
