// ============================================================================
// LEARNER NOTES — APPROVAL QUEUE (Super-Admin)
// ============================================================================
// Created: 2026-07-03
// The scf-learner-notes cron drafts a short, warm, PRIVATE support note for
// every learner on a downward understanding trend. Since the approval-queue
// migration (20260703091300) those notes land as status='draft' and a learner
// NEVER sees one until a super admin approves it here (per-note or bulk).
//
// This page is the human gate on AI-written student-facing content: it shows
// every pending draft IN FULL (who it goes to, which course/week, the exact
// wording) with Approve / Reject per row and a confirm-gated "Approve all".
//
// API:
//   GET  /api/admin/learner-notes          — pending drafts (fn_scf_learner_notes_pending)
//   POST /api/admin/learner-notes          — { ids, action } bulk review
//                                            (fn_scf_learner_notes_review)
// ============================================================================

export const navMeta = { label: 'Learner Notes', icon: 'ClipboardCheck' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { LearnerNotesApprovalQueue } from './_components/learner-notes-approval-queue';
import { AutoPublishedSpotCheck } from './_components/auto-published-spotcheck';

export default function LearnerNotesApprovalPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Learner Notes">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. It approves or
            rejects AI-drafted support notes before struggling students see
            them, so it is locked tight.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Learner Notes — Approval Queue">
        <LearnerNotesApprovalQueue />
        <AutoPublishedSpotCheck />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
