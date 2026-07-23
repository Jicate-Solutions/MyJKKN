// ============================================================================
// Admin — HR Policies — R&D (hub page)
// Created: 2026-05-20.
//
// Why this page exists:
//   /hr/admin/policies/rd previously had no page.tsx, so any director who
//   typed `/hr/admin/policies/rd` (or followed an outdated link) hit a 404
//   after auth. 5 R&D-policy subroutes already exist under
//   /hr/admin/policies/rd/* — this page makes them discoverable from a single
//   landing instead of requiring users to know the exact subpath.
//
// What's here:
//   5 ActionCards covering research and development policies — excursion,
//   incentive authority, publication incentives, research leave, and WFH
//   rules for research-track faculty.
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
  Award,
  BookOpen,
  FlaskConical,
  Home,
  Microscope,
  Plane,
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
    href: '/hr/admin/policies/rd/excursion',
    icon: Plane,
    title: 'Excursion (R&D)',
    description:
      'Conference travel, field-research excursion eligibility and reimbursement.',
  },
  {
    href: '/hr/admin/policies/rd/incentive-authority',
    icon: Award,
    title: 'Incentive Authority',
    description:
      'Approval authority matrix for R&D incentive payouts by amount.',
  },
  {
    href: '/hr/admin/policies/rd/publication-incentives',
    icon: BookOpen,
    title: 'Publication Incentives',
    description: 'Per-publication incentive amounts by indexing tier.',
  },
  {
    href: '/hr/admin/policies/rd/research-leave',
    icon: Microscope,
    title: 'Research Leave',
    description:
      'Sabbatical and dedicated-research leave eligibility and tenure.',
  },
  {
    href: '/hr/admin/policies/rd/wfh-rules',
    icon: Home,
    title: 'WFH Rules',
    description:
      'Work-from-home rules specific to research-track faculty.',
  },
];

export default function AdminHRRDPoliciesHubPage() {
  return (
    // Matches the hr.policies.view gate on every policies/rd/* leaf. Added
    // 2026-06-19; this index page was unguarded.
    <PermissionGuard
      module="hr.policies"
      action="view"
      fallback={
        <ContentLayout title="R&D Policies">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            R&amp;D policy configuration is restricted to HR policy administrators.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="R&D Policies">
      <div className="space-y-8">
        <header>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">R&D Policies</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Research and development incentives, leave types, and authority
            matrix.
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
