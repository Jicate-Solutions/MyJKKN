'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PermissionError } from '@/components/errors/permission-error';
import { MenuLoopBoard } from './_components/menu-loop-board';

/**
 * Choose Your Menu loop — chairperson verdict board (PR3).
 *
 * Lists the generator's `proposed` recommendations for a tier, lets the
 * chairperson Accept / Reject / mark Edited (the loop's CONTROL LABEL), and
 * renders the causal-validity guard. Ships DARK/backend-mostly: the generator
 * (PR2) and the loop master switch are off, so the board shows a graceful empty
 * state until a pilot hostel is fueled.
 *
 * Gate: `campus_living.settings.view` — same section key the rest of the
 * campus-living settings surfaces use (rule #27: explicit denial, no silent
 * redirect). Super-admins bypass.
 */
export default function MenuLoopPage() {
  return (
    <PermissionGuard
      module='campus_living.settings'
      action='view'
      fallback={
        <ContentLayout title='Menu Loop'>
          <PermissionError
            message='The Choose Your Menu loop is restricted to hostel administrators.'
            requiredPermission='campus_living.settings.view'
          />
        </ContentLayout>
      }
    >
      <ContentLayout title='Menu Loop'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/campus-living'>Campus Living</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/campus-living/mess'>Mess</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Menu Loop</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='text-2xl font-bold'>Choose Your Menu — Self-Improving Loop</h1>
            <p className='text-muted-foreground'>
              Review the menu proposals the loop generates from residents&apos; votes, ratings, and
              waste, then accept, reject, or mark them edited. Your verdict keeps you in control and
              acts as the control label that proves measured improvement is real — not regression to
              the mean.
            </p>
          </div>

          <MenuLoopBoard />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
