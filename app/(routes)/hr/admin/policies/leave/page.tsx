// ============================================================================
// Admin — HR Policies — Leave (hub page)
// Created: 2026-05-20.
//
// Why this page exists:
//   /hr/admin/policies/leave previously had no page.tsx, so any director who
//   typed `/hr/admin/policies/leave` (or followed an outdated link) hit a 404
//   after auth. 7 leave-category subroutes already exist under
//   /hr/admin/policies/leave/* — this page makes them discoverable from a
//   single landing instead of requiring users to know the exact subpath.
//
// What's here:
//   7 ActionCards — one per leave category (casual, compensatory, half-pay,
//   holidays-and-lop, marriage, on-duty, vacation).
//
// Audience gating:
//   Routing into /admin/* is gated by middleware. Cards render permissively
//   for any user the middleware allowed through; each destination page
//   enforces its own role checks. Keeping the hub permissive avoids
//   re-encoding gates in two places.
// ============================================================================

import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgePercent,
  Briefcase,
  CalendarDays,
  CalendarOff,
  Coffee,
  Heart,
  Palmtree,
  RotateCcw,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';

type ActionCardProps = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

const CARDS: ActionCardProps[] = [
  {
    href: '/hr/admin/policies/leave/casual',
    icon: Coffee,
    title: 'Casual Leave',
    description:
      'Day-off cap, accrual schedule, and approval rules for casual leave.',
  },
  {
    href: '/hr/admin/policies/leave/compensatory',
    icon: RotateCcw,
    title: 'Compensatory Leave',
    description: 'Comp-off accumulation rules and consumption windows.',
  },
  {
    href: '/hr/admin/policies/leave/half-pay',
    icon: BadgePercent,
    title: 'Half-Pay Leave',
    description:
      'Half-pay leave eligibility and conversion-to-LOP behavior.',
  },
  {
    href: '/hr/admin/policies/leave/holidays-and-lop',
    icon: CalendarOff,
    title: 'Holidays & LOP',
    description: 'Public holiday calendar and loss-of-pay rules.',
  },
  {
    href: '/hr/admin/policies/leave/marriage',
    icon: Heart,
    title: 'Marriage Leave',
    description:
      'One-time marriage leave entitlement and eligibility window.',
  },
  {
    href: '/hr/admin/policies/leave/on-duty',
    icon: Briefcase,
    title: 'On-Duty Leave',
    description:
      'OD leave for official travel, conferences, and external duty.',
  },
  {
    href: '/hr/admin/policies/leave/vacation',
    icon: Palmtree,
    title: 'Vacation Leave',
    description:
      'Annual vacation entitlement, blackout windows, and rollover rules.',
  },
];

export default function AdminHRLeavePoliciesHubPage() {
  return (
    // Matches the hr.policies.view gate on every policies/leave/* leaf. Added
    // 2026-06-19; this index page was unguarded and listed the leave policies.
    <PermissionGuard
      module="hr.policies"
      action="view"
      fallback={
        <ContentLayout title="Leave Policies">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Leave policy configuration is restricted to HR policy administrators.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="Leave Policies">
      <div className="space-y-8">
        <header>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">Leave Policies</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Policy configuration for each leave category — caps, accrual
            rules, eligibility, and approval routes.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <ActionCard key={card.href} {...card} />
          ))}
        </div>
      </div>
    </ContentLayout>
    </PermissionGuard>
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
