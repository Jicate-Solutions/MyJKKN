// ============================================================================
// Admin — HR Policies — Modern Workplace (hub page)
// Created: 2026-05-20.
//
// Why this page exists:
//   /hr/admin/policies/new previously had no page.tsx, so any director who
//   typed `/hr/admin/policies/new` (or followed an outdated link) hit a 404
//   after auth. 4 modern-workplace-policy subroutes already exist under
//   /hr/admin/policies/new/* — this page makes them discoverable from a
//   single landing instead of requiring users to know the exact subpath.
//
// Note on the directory name:
//   The "new" in the URL is a category label for newer policy areas (GenAI,
//   remote work, etc.) — NOT a "create-new" action. A future rename to
//   something like `modern-workplace` or `recent-additions` would remove the
//   ambiguity; that's out of scope for this PR (it would touch the 4 child
//   pages plus navigation manifests).
//
// What's here:
//   4 ActionCards covering modern workplace policies — data privacy & IT
//   acceptable use, GenAI usage, remote/hybrid work, social media conduct.
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
  Home,
  Lightbulb,
  MessageCircle,
  ShieldCheck,
  Sparkles,
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
    href: '/hr/admin/policies/new/data-privacy-it-acceptable-use',
    icon: ShieldCheck,
    title: 'Data Privacy & IT Acceptable Use',
    description:
      'Acceptable use of company IT systems and data privacy obligations.',
  },
  {
    href: '/hr/admin/policies/new/genai-usage',
    icon: Sparkles,
    title: 'GenAI Usage',
    description:
      'Permitted and prohibited uses of generative AI tools at work.',
  },
  {
    href: '/hr/admin/policies/new/remote-hybrid-work',
    icon: Home,
    title: 'Remote/Hybrid Work',
    description:
      'Remote and hybrid work eligibility, expectations, and review cadence.',
  },
  {
    href: '/hr/admin/policies/new/social-media-conduct',
    icon: MessageCircle,
    title: 'Social Media Conduct',
    description:
      'Personal social media conduct standards on work-related topics.',
  },
];

export default function AdminHRModernWorkplacePoliciesHubPage() {
  return (
    // Matches the hr.policies.view gate on every policies/new/* leaf. Added
    // 2026-06-19; this index page was unguarded.
    <PermissionGuard
      module="hr.policies"
      action="view"
      fallback={
        <ContentLayout title="Modern Workplace Policies">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Workplace policy configuration is restricted to HR policy administrators.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="Modern Workplace Policies">
      <div className="space-y-8">
        <header>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">
              Modern Workplace Policies
            </h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Newer policy areas covering modern workplace concerns. (Note: this
            is a category of newer policies, not a &ldquo;create-new&rdquo;
            action.)
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
