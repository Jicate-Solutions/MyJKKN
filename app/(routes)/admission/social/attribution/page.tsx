'use client';

// =====================================================================
// /admission/social/attribution — Phase 4 (Agent η)
// Relocated from /admin/instagram-attribution 2026-06-11 (admin-cluster
// relocation wave-2 — one module = one URL prefix).
// =====================================================================
// Two outcome-attribution drilldowns + one tunable policy:
//   1. WindowPolicyCard — edit ig.attribution_window_days (days)
//   2. AccountDrilldown — admission inquiries by Instagram account
//   3. PostDrilldown    — top performing Instagram posts
//
// Read source: v_ig_admission_attribution (Phase 4 migration).
// Write source: platform_policies row `ig.attribution_window_days`.
//
// Permission gate matches sister policy pages (super_admin writes;
// admins view).
// =====================================================================

import { Compass } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePermissions } from '@/hooks/use-permissions';

import { AccountDrilldown } from './_components/account-drilldown';
import { PostDrilldown } from './_components/post-drilldown';
import { WindowPolicyCard } from './_components/window-policy-card';

export default function InstagramAttributionPage() {
  return (
    <PermissionGuard
      module="social.attribution"
      action="view"
      fallback={
        <ContentLayout title="Instagram Attribution">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Instagram Attribution">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admission', href: '/admission' },
            { label: 'Instagram Attribution' },
          ]}
        />
        <Content />
      </ContentLayout>
    </PermissionGuard>
  );
}

function Content() {
  // canAccess returns true for super admins, so the previous behaviour is
  // preserved; other roles need the social.attribution.edit key.
  const { canAccess } = usePermissions();
  const canEditPolicy = canAccess('social.attribution', 'edit');

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Compass className="h-4 w-4" />
        <AlertTitle>How attribution works</AlertTitle>
        <AlertDescription>
          When a learner-creator&apos;s Instagram post drives an admission
          inquiry, the lead can be stamped with
          <code className="mx-1">lead_source=&apos;learner_creator_content&apos;</code>
          plus the originating
          <code className="mx-1">ig_account_id</code> and
          <code className="mx-1">ig_post_id</code>. The attribution window
          below controls how many days after the post a new lead can still
          be credited to it. Edit the window — no PR, no deploy.
        </AlertDescription>
      </Alert>

      <WindowPolicyCard canEdit={canEditPolicy} />
      <AccountDrilldown />
      <PostDrilldown />
    </div>
  );
}
