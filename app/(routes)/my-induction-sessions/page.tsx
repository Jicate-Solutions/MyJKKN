'use client';

// My Induction Sessions — a resource person's own lane on the value signal.
//
// UNGATED by design: no RoutePermissionGuard layout and NO MENU_PERMISSIONS entry,
// so it's reachable by ANY authenticated user. The underlying RPCs
// (fn_induction_my_sessions_feedback / _my_session_comments) self-scope to the
// sessions you were CREDITED on (event_session_speakers.profile_id = auth.uid()),
// so a non-presenter simply sees the empty state — there is nothing to leak.
//
// This is the home for STAFF resource persons (who have no induction.view and so
// can't use the coordinator console at /events/induction). Senior-student
// presenters see the same card on their /learners/my-induction page.
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SessionsLedCard } from '@/app/(routes)/learners/my-induction/_components/sessions-led-card';

export default function MyInductionSessionsPage() {
  return (
    <ContentLayout title="My Induction Sessions">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My Induction Sessions' }]} />
      <div className="mx-auto max-w-3xl py-4">
        <SessionsLedCard showEmptyState />
      </div>
    </ContentLayout>
  );
}
