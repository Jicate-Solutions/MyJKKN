// Billing module — canonical permission enforcement.
// Created 2026-06-19. Billing admin/config pages (categories, refunds,
// discounts, schedules, reports) were unguarded. Gated by declared
// MENU_PERMISSIONS permission. The /billing/payment/* callbacks (success/failed)
// are intentionally reachable by paying students who lack billing.payment.view,
// so they are exempted from gating — they confirm a completed payment, not
// admin data.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
export default function BillingLayout({ children }: { children: ReactNode }) {
  return (
    <RoutePermissionGuard exemptPrefixes={['/billing/payment']}>
      {children}
    </RoutePermissionGuard>
  );
}
