// ============================================================================
// /cohorts/coordinators — Cohort Coordinators
// ============================================================================
// Director decision, 2026-08-02: ONE page that appoints coordinators for EVERY
// cohort in MyJKKN — School of Influence, Solve for 100, MBA Associates, and the
// three kinds not yet in use. Before this there was no such screen anywhere, and
// all five live cohorts had nobody recorded as running them.
//
// ACCESS — super administrators only, gated at four layers that all say the same
// thing (a gate on only one of them yields a screen that opens and returns empty,
// which reads as "no data" rather than "no access"):
//   1. this page               — the server guard below
//   2. app/api/cohorts/coordinators/_guard.ts
//   3. RLS on public.cohort_coordinators / cohort_coordinator_events
//   4. COALESCE(is_super_admin(), false) inside every RPC
// Refusal renders an explicit panel naming who to contact — never a silent
// redirect (CLAUDE.md rule 27).
// ============================================================================

export const dynamic = 'force-dynamic';
export const navMeta = { label: 'Cohort Coordinators', icon: 'UserCog' } as const;

import { ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/server';

import { CoordinatorsConsole } from './_components/coordinators-console';

export default async function CohortCoordinatorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isSuperAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();
    // `=== true` on purpose: a NULL must not fall through as permitted.
    isSuperAdmin = profile?.is_super_admin === true;
  }

  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Cohorts' },
          { label: 'Coordinators' },
        ]}
      />
      <div className="mt-6">
        {isSuperAdmin ? (
          <CoordinatorsConsole />
        ) : (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>You do not have access to Cohort Coordinators</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                This page decides who runs each cohort across every programme — School of
                Influence, Solve for 100, MBA Associates, Foundations, CDC Training and
                Trainer Development. Appointing someone here gives them standing over a
                whole programme, so it is limited to super administrators.
              </p>
              <p>
                If you need a coordinator appointed or stepped down, ask a super
                administrator to do it. You can find who they are on{' '}
                <strong>Users → Role Management</strong>. Being granted a cohort permission
                on its own will not open this page.
              </p>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ContentLayout>
  );
}
