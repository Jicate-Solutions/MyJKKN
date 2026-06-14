// =====================================================================
// /pde/admin/policies — PDE policy hub
// =====================================================================
// Previously this page just redirect()'d to /pde/admin/policies/scoring,
// which hid the other four policy editors — a director landing here had
// no way to discover rollout, visibility, quests, or governance without
// knowing the exact subpath. This hub lists all five editors as cards so
// every PDE policy area is reachable from one landing.
//
// Each destination already enforces super_admin via SuperAdminOnly; the
// hub mirrors that gate so the cards never surface to non-admins.
//
// Card idiom copied from /hr/admin/page.tsx (the canonical admin hub).
// =====================================================================

import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Eye,
  Rocket,
  ShieldCheck,
  Sliders,
  Swords,
  Target,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type PolicyCard = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

const CARDS: PolicyCard[] = [
  {
    href: '/pde/admin/policies/scoring',
    icon: Sliders,
    title: 'Scoring & Integrity',
    description:
      'How demonstrations are graded — peer-bias detection, validator audits, and AI deliverable credit.',
  },
  {
    href: '/pde/admin/policies/rollout',
    icon: Rocket,
    title: 'Rollout & Compliance',
    description:
      'Phase rollout schedule, mandatory-participation rules, and per-institution compliance thresholds.',
  },
  {
    href: '/pde/admin/policies/visibility',
    icon: Eye,
    title: 'Visibility & Transparency',
    description:
      'What learners, faculty, and admins can see — score visibility, leaderboards, and disclosure rules.',
  },
  {
    href: '/pde/admin/policies/quests',
    icon: Target,
    title: 'Quests & Supply',
    description:
      'Quest catalogue supply rules — how many quests are offered, their cadence, and enrolment limits.',
  },
  {
    href: '/pde/admin/policies/governance',
    icon: Swords,
    title: 'Gamification & Defense',
    description:
      'Gamification mechanics and anti-gaming defenses that keep points, badges, and streaks honest.',
  },
];

export default function PdePoliciesHubPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Policies">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. PDE policies
            govern scoring, rollout, visibility, quests, and gamification
            across all institutions.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Policies">
        <div className="space-y-6">
          <PageBreadcrumb
            items={[
              { label: 'Dashboard', href: '/' },
              { label: 'Administration' },
              { label: 'PDE' },
              { label: 'Policies' },
            ]}
          />

          <header>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-semibold">PDE Policies</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Configure how the Personal Development Engine behaves across all
              institutions. Pick a policy area to edit its rules — changes take
              effect on the next demonstration without a redeploy.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((card) => (
              <PolicyHubCard key={card.href} {...card} />
            ))}
          </div>
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function PolicyHubCard({ href, icon: Icon, title, description }: PolicyCard) {
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
