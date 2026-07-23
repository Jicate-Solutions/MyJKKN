// ============================================================================
// Admin — HR Payroll (hub page)
// Created: 2026-05-20.
//
// Why this page exists:
//   /hr/admin/payroll previously had no page.tsx, so any director who typed
//   the URL (or followed an outdated link) hit a 404. Same 404 class as
//   PR #1008 which fixed the parent /hr/admin. Two subroutes already exist
//   under /hr/admin/payroll/* — this page makes them discoverable from one
//   landing instead of requiring users to know the exact subpath.
//
// What's here:
//   Two ActionCards:
//   - "Payroll Periods"  → /hr/admin/payroll/periods
//   - "Payroll Preview"  → /hr/admin/payroll/preview
//
// Audience gating:
//   Routing into /admin/* is gated by middleware — destination pages enforce
//   their own role gates; hub stays permissive to avoid double-gating.
// ============================================================================

import type { ComponentType } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, Wallet } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

type ActionCardProps = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

const CARDS: ActionCardProps[] = [
  {
    href: '/hr/admin/payroll/periods',
    icon: Banknote,
    title: 'Payroll Periods',
    description:
      'Prepare, review, and approve each pay period through the 7-stage workflow.',
  },
  {
    href: '/hr/admin/payroll/preview',
    icon: Wallet,
    title: 'Payroll Preview',
    description:
      'Live preview of pay components, deductions, and net pay before period prepare.',
  },
];

export default function AdminHRPayrollPage() {
  return (
    // Restricted to super admins / HR Admin — matches the SuperAdminOnly gate on
    // every payroll/* leaf. Added 2026-06-19; the hub was previously unguarded.
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Payroll">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Payroll administration is restricted to super administrators / HR Admin.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="HR Payroll">
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Payroll Administration</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Monthly pay period preparation, approval, and payslip preview.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {CARDS.map((card) => (
            <ActionCard key={card.href} {...card} />
          ))}
        </div>
      </div>
    </ContentLayout>
    </SuperAdminOnly>
  );
}

function ActionCard({ href, icon: Icon, title, description }: ActionCardProps) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:border-primary hover:bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
