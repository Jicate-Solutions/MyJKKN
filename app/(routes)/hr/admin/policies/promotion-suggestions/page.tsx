// =====================================================================
// /hr/admin/policies/promotion-suggestions — Wave 3 M10
// =====================================================================
// Director-confirm UI for the weekly auto-promote detector cron
// (/api/cron/hr-policy-promote-detector). Lists every pending
// hr_policy_promotion_suggestions row and lets the Director either
// promote the policy_key to scope_type='global' OR dismiss the suggestion
// with a recorded reason.
//
// Both actions are recorded in hr_policy_audit_log under
// action='promote_to_global' so the audit-log page can show the full
// promotion history alongside Save/Publish/Reclassify events.
//
// Server component shell + PromotionSuggestionsClient island. The shell
// queries the table (RLS scoped to authenticated users) and the client
// island handles the approve/dismiss interactions.
//
// Permission: super_admin / admin only via PermissionGuard.
// =====================================================================

import Link from 'next/link';
import { ArrowLeft, History, Sparkles } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { createClient } from '@/lib/supabase/server';

import { PromotionSuggestionsClient } from './promotion-suggestions-client';
import type { PromotionSuggestionRow } from './types';

export const dynamic = 'force-dynamic';

export default function HrPoliciesPromotionSuggestionsPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policies — Promotion suggestions">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies', href: '/hr/admin/policies' },
            { label: 'Promotion suggestions' },
          ]}
        />
        <PromotionSuggestionsContent />
      </ContentLayout>
    </PermissionGuard>
  );
}

async function PromotionSuggestionsContent() {
  const supabase = await createClient();

  const { data: rawRows, error } = await supabase
    .from('hr_policy_promotion_suggestions')
    .select(
      'id, policy_key, suggested_at, snapshot_value, snapshot_classification, identical_institution_count, identical_days, status'
    )
    .eq('status', 'pending')
    .order('suggested_at', { ascending: false })
    .limit(100);

  const rows: PromotionSuggestionRow[] = (rawRows ?? []).map((r) => ({
    id: r.id,
    policy_key: r.policy_key,
    suggested_at: r.suggested_at,
    snapshot_value: r.snapshot_value,
    snapshot_classification: r.snapshot_classification,
    identical_institution_count: r.identical_institution_count,
    identical_days: r.identical_days,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle>System-suggested promotions</AlertTitle>
          <AlertDescription>
            When a policy has held identical values across every institution
            for at least six months with no edits, the system flags it as a
            candidate for promotion to a global default. You decide whether to
            promote it or dismiss the suggestion. Either way, the action is
            recorded in the audit log.
          </AlertDescription>
        </Alert>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline">
            <Link href="/hr/admin/policies/audit-log">
              <History className="h-4 w-4 mr-2" />
              Audit log
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/hr/admin/policies">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to policies
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Failed to load promotion suggestions: {error.message}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <PromotionSuggestionsClient rows={rows} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-2">
        <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
        <h3 className="text-base font-medium">No promotion suggestions waiting</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          The weekly detector runs every Monday at 02:00 UTC. When it finds a
          policy that has been identical across all institutions for six months,
          you will see it here for review.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/hr/admin/policies">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to policies
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
