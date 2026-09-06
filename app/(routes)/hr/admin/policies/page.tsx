// =====================================================================
// /hr/admin/policies — Wave 3 policy editor index
// =====================================================================
// Wave 3 (Policy-Driven HR Manual Replacement) substrate index page.
// Top-level catalog of every editor that ships across M1-M10 batches.
//
// Standing rule (2026-04-29 platform_policies pattern, extended 2026-05-15
// for Wave 3): every policy decision = config-table row + super_admin UI.
// Edits land in `platform_policies` via the Draft → Publish workflow
// (W3-M0 substrate). The HR Manual then renders itself from policy state.
//
// Permission: super_admin / admin only (PermissionGuard).
// =====================================================================
import Link from 'next/link';
import { ArrowRight, ScrollText, History, Sparkles } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { createClient } from '@/lib/supabase/server';

// Force dynamic — the pending-promotion banner is a live count.
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Editor catalog — Wave 3 batches M1-M10. New routes get added here as
// sibling agents ship them.
// ---------------------------------------------------------------------------

interface PolicyEditorEntry {
  href: string;
  title: string;
  description: string;
  classification: 'operational' | 'major';
  scope: 'institution' | 'global';
  batch: string; // e.g. 'W3-M1'
}

const POLICY_EDITORS: ReadonlyArray<PolicyEditorEntry> = [
  // W3-M1 — Institutional substrate
  {
    href: '/hr/admin/policies/institution-meta',
    title: 'Institution identity',
    description: 'College name, founding year, accreditations, leadership.',
    classification: 'major',
    scope: 'institution',
    batch: 'W3-M1',
  },
  {
    href: '/hr/admin/policies/facilities',
    title: 'Facilities',
    description: 'Campus facilities staff have access to and welfare amenities.',
    classification: 'operational',
    scope: 'institution',
    batch: 'W3-M1',
  },
  {
    href: '/hr/admin/policies/cadres',
    title: 'Cadres',
    description: 'Faculty + admin cadre lists used by recruitment and payroll.',
    classification: 'major',
    scope: 'institution',
    batch: 'W3-M1',
  },
  {
    href: '/hr/admin/policies/working-schedule',
    title: 'Working schedule',
    description: 'Working hours per role-type, grace periods, break windows.',
    classification: 'operational',
    scope: 'institution',
    batch: 'W3-M1',
  },
  {
    href: '/hr/admin/policies/welfare',
    title: 'Welfare activities',
    description: 'Annual welfare calendar — celebrations, family days, retreats.',
    classification: 'operational',
    scope: 'institution',
    batch: 'W3-M1',
  },

  // W3-M2 — Roles + academic + teaching artifacts
  {
    href: '/hr/admin/policies/roles-responsibilities',
    title: 'Roles & responsibilities',
    description: 'Job descriptions, reporting lines, RACI matrices per role.',
    classification: 'major',
    scope: 'institution',
    batch: 'W3-M2',
  },
  {
    href: '/hr/admin/policies/academic-scope',
    title: 'Academic scope',
    description: 'Disciplines taught, research areas, accreditation bands.',
    classification: 'major',
    scope: 'institution',
    batch: 'W3-M2',
  },
  {
    href: '/hr/admin/policies/teaching-artifacts',
    title: 'Teaching artifacts',
    description: 'Required teaching deliverables — lesson plans, rubrics, OBE.',
    classification: 'operational',
    scope: 'institution',
    batch: 'W3-M2',
  },

  // W3-M4 — Compensation (M3 R&D pages ship next-batch; not listed yet)
  {
    href: '/hr/admin/policies/pay-scales',
    title: 'Pay scales',
    description: 'Salary bands per cadre + grade; revision history.',
    classification: 'major',
    scope: 'institution',
    batch: 'W3-M4',
  },
  {
    href: '/hr/admin/policies/allowances-and-increments',
    title: 'Allowances & increments',
    description: 'HRA, DA, conveyance, special allowances + increment rules.',
    classification: 'major',
    scope: 'institution',
    batch: 'W3-M4',
  },
  {
    href: '/hr/admin/policies/motivation-fund',
    title: 'Motivation fund',
    description: 'Performance-linked motivation fund eligibility + amounts.',
    classification: 'operational',
    scope: 'institution',
    batch: 'W3-M4',
  },
];

// ---------------------------------------------------------------------------
// Page wrapper
// ---------------------------------------------------------------------------

export default function HrPoliciesIndexPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policies">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
          ]}
        />
        <HrPoliciesIndexContent />
      </ContentLayout>
    </PermissionGuard>
  );
}

async function HrPoliciesIndexContent() {
  // Live count of pending W3-M10 promotion suggestions for the banner.
  // RLS lets every authenticated user read; non-admins still see the count
  // so they can ask the Director to weigh in if useful.
  const supabase = await createClient();
  const { count: pendingPromotionCount } = await supabase
    .from('hr_policy_promotion_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Alert>
          <ScrollText className="h-4 w-4" />
          <AlertTitle>HR Policies</AlertTitle>
          <AlertDescription>
            When the rules change here, the HR Manual updates automatically. No
            code changes, no developer involvement. Every edit goes through
            Draft → Publish with a mandatory reason recorded in the audit log.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/hr/admin/policies/audit-log">
            <History className="h-4 w-4 mr-2" />
            View audit log
          </Link>
        </Button>
      </div>

      {pendingPromotionCount !== null && pendingPromotionCount > 0 && (
        <PromotionSuggestionsBanner count={pendingPromotionCount} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {POLICY_EDITORS.map((entry) => (
          <PolicyEditorCard key={entry.href} entry={entry} />
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        More editors ship across Wave 3 batches M3 / M5 / M6 / M8. Sibling
        agents add new cards to this index as each batch lands.
      </p>
    </div>
  );
}

function PromotionSuggestionsBanner({ count }: { count: number }) {
  return (
    <Alert>
      <Sparkles className="h-4 w-4" />
      <AlertTitle>
        {count} promotion suggestion{count === 1 ? '' : 's'} waiting
      </AlertTitle>
      <AlertDescription className="flex items-start justify-between gap-3">
        <span>
          The weekly auto-promote detector flagged {count === 1 ? 'a policy' : 'policies'} that
          {' '}{count === 1 ? 'has' : 'have'} been identical across every institution for at
          least six months. Review and decide whether to promote {count === 1 ? 'it' : 'them'} to
          a global default.
        </span>
        <Button asChild size="sm" variant="default" className="shrink-0">
          <Link href="/hr/admin/policies/promotion-suggestions">
            <ArrowRight className="h-4 w-4 mr-1" />
            Review
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function PolicyEditorCard({ entry }: { entry: PolicyEditorEntry }) {
  return (
    <Link
      href={entry.href}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      <Card className="h-full transition-colors hover:bg-accent/40">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{entry.title}</CardTitle>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
          </div>
          <CardDescription>{entry.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{entry.batch}</Badge>
            <Badge variant="outline">scope: {entry.scope}</Badge>
            <Badge
              variant={entry.classification === 'operational' ? 'outline' : 'default'}
            >
              {entry.classification}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
