// app/(routes)/solutions/paradigm-shift/confirmations/page.tsx
// ============================================================================
// "Confirm our department's part" — Director decision D3 (2026-09-18).
//
// WHY THIS SCREEN EXISTS. When Pharmacy records a health camp and names Nursing
// and Dental as having taken part, those two land `pending` in
// sh_community_engagement_participants. Each named department's own head must
// confirm their part, with the hours their people actually gave. A
// named-but-unconfirmed department counts for NOTHING, anywhere.
//
// That rule is the entire defence against decision D2 — every participating
// college shows the FULL beneficiary count, shared rather than divided — being
// gamed by typing department names into a form. Without this screen the
// confirmation can never happen, so D2 would be freely gameable and D3 would be
// a rule with no way to obey it.
//
// THE GUARD IS A NOTICE, NEVER A REDIRECT (CLAUDE.md rule 27). PermissionGuard's
// default fallback renders PermissionNotice — an explicit "this is not open to
// you, here is the key to ask for". A `redirect()` on a failed check turns a
// missing permission, or a null department, into an infinite bounce the viewer
// cannot diagnose. The department-missing case is handled the same way inside
// the panel.
// ============================================================================

'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { ConfirmationsPanel } from './_components/confirmations-panel';

/**
 * navMeta — read by the nav-coverage detector. `/solutions/paradigm-shift` is
 * where a head arrives from; this screen hangs off it.
 *
 * NOTE, stated rather than implied: this is NOT the same thing as a clickable
 * chip. `scripts/check-nav-reachability.ts` ignores navMeta on purpose ("only
 * actual chip-click reachability counts"), and the Solutions module has its own
 * nav-config.ts, which suppresses auto-rendered chips. Until a child entry is
 * added to that file's "More" group this route is reachable only by URL. That
 * one-line addition is named as a follow-up in this PR's body — it lives in a
 * file this change is not authorised to touch.
 */
export const navMeta = {
  invokedFrom: '/solutions/paradigm-shift',
} as const;

export default function ParticipationConfirmationsPage() {
  const { profile } = useAuth();
  const { can, isSuperAdmin } = usePermissions();

  const departmentId = profile?.department_id ?? null;
  const canConfirm = isSuperAdmin || can('solutions.societal.confirm');

  return (
    <PermissionGuard module='solutions.societal' action='confirm'>
      <ContentLayout title='Confirm our part'>
        <PageBreadcrumb
          items={[
            { label: 'Solutions', href: '/solutions' },
            { label: 'Paradigm Shift', href: '/solutions/paradigm-shift' },
            { label: 'Confirm our part' },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>
              Community initiatives that named your department
            </CardTitle>
            <p className='text-sm text-muted-foreground'>
              When another department records community work and says your people
              took part, it lands here for you to answer. Confirm it with the
              hours your department actually gave, or decline it with a note.
              Until you answer, your department counts for nothing on that
              initiative — which is what keeps the shared beneficiary figure
              honest.
            </p>
          </CardHeader>
          <CardContent>
            <ConfirmationsPanel departmentId={departmentId} canConfirm={canConfirm} />
          </CardContent>
        </Card>
      </ContentLayout>
    </PermissionGuard>
  );
}
