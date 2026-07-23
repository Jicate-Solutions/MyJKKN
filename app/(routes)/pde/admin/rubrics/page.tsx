// =====================================================================
// /pde/admin/rubrics — PDE rubric hub
// =====================================================================
// Previously this page redirected to the embodied rubric editor, hiding
// the cultural-civic and social-leadership namespaces — an admin landing
// here couldn't discover them without the exact subpath. This hub lists
// all three rubric namespaces as cards so each is reachable from one
// landing.
//
// Each destination already enforces super_admin via SuperAdminOnly; the
// hub mirrors that gate. Card idiom copied from /hr/admin/page.tsx.
// =====================================================================

import type { ComponentType } from 'react';
import Link from 'next/link';
import { ArrowRight, Activity, HeartHandshake, Library, Users2 } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type RubricCard = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

const CARDS: RubricCard[] = [
  {
    href: '/pde/admin/rubrics/embodied',
    icon: Activity,
    title: 'Embodied Practice',
    description:
      'Rubrics for embodied-practice disciplines — the largest namespace, graded on demonstrated physical and applied skill.',
  },
  {
    href: '/pde/admin/rubrics/cultural-civic',
    icon: HeartHandshake,
    title: 'Cultural & Civic Literacy',
    description:
      'Rubrics assessing cultural awareness and civic-literacy demonstrations.',
  },
  {
    href: '/pde/admin/rubrics/social-leadership',
    icon: Users2,
    title: 'Social & Leadership Trust',
    description:
      'Rubrics assessing social skills and leadership-trust demonstrations.',
  },
];

export default function PdeRubricsHubPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Rubrics">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. PDE rubrics
            define how demonstrations are scored across every discipline.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Rubrics">
        <div className="space-y-6">
          <PageBreadcrumb
            items={[
              { label: 'Dashboard', href: '/' },
              { label: 'Administration' },
              { label: 'PDE' },
              { label: 'Rubrics' },
            ]}
          />

          <header>
            <div className="flex items-center gap-2">
              <Library className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-semibold">PDE Rubrics</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Edit the scoring rubrics that govern how PDE demonstrations are
              graded. Pick a namespace to manage its disciplines and levels.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((card) => (
              <RubricHubCard key={card.href} {...card} />
            ))}
          </div>
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function RubricHubCard({ href, icon: Icon, title, description }: RubricCard) {
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
