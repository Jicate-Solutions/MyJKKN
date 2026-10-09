'use client';

/**
 * /hr/playbooks — HR duty playbooks, the proposals waiting for the HR head,
 * and the credit list (20271007161139).
 *
 * Reached from the "How this is done" card on each HR duty screen (the card's
 * link carries ?duty=<code>); it has no sidebar row, so it is listed in
 * NAV_EXCLUDE in scripts/check-nav-reachability.ts.
 *
 * Open to every signed-in person at the route (MENU_PERMISSIONS 'view_profile',
 * Director 8 Oct: every team member reads, only HR changes). The database still
 * answers only someone with a staff row (or a super admin, admin or holder of
 * the manage key) and refuses a learner or parent, whose tabs then show that
 * refusal. Only the Proposals tab needs hr.harness.playbooks.manage.
 */

import { Suspense } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';

import { PlaybooksView } from './_components/playbooks-view';

export default function HrPlaybooksPage() {
  return (
    <ContentLayout title='HR Playbooks'>
      <PageBreadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'HR', href: '/hr' },
          { label: 'Playbooks' },
        ]}
      />
      <div className='space-y-2 pb-4'>
        <h1 className='text-2xl font-semibold text-foreground'>How HR duties are done</h1>
        <p className='max-w-2xl text-sm text-muted-foreground'>
          Short steps for each duty, written by the people who do it. Every line names who wrote it. Repeated
          rejection reasons become proposed lines, and the HR head accepts, edits or declines each one. No message is
          sent to anyone.
        </p>
      </div>
      <Suspense fallback={<p className='text-sm text-muted-foreground'>Loading…</p>}>
        <PlaybooksView />
      </Suspense>
    </ContentLayout>
  );
}
