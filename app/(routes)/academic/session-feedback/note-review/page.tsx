// ============================================================================
// LEARNER NOTE REVIEW — the named reviewer's queue (note-safety loop Phase 0)
// ============================================================================
// Created: 2026-07-26 (Director decision: ONE named reviewer —
// krishnaveni_a@jkkn.ac.in, Coordinator for Academic Excellence and Innovation
// in Learning Facilitation — gets her own review dashboard).
//
// The scf-learner-notes cron drafts a short, warm, PRIVATE support note for
// every learner on a downward understanding trend. A learner NEVER sees a note
// until a human approves it. This page opens that human gate beyond super
// admins: it is gated on the 'scf.notes.review' permission (note-safety spec
// §6.3), held today by the scf_note_reviewer role.
//
// Phase 0 guarantees:
//   * humans decide everything — no auto-approve rides this phase; the AI
//     judge stays in shadow.
//   * every verdict written here is stamped calibrate/holdout server-side
//     inside fn_scf_learner_notes_review (spec §7.1) — the split is never
//     exposed or decided in the UI.
//
// Reuse, not reinvention: this page renders the SAME queue component as the
// super-admin surface (/admin/learner-notes) over the SAME API + RPCs
// (fn_scf_learner_notes_pending / fn_scf_learner_notes_review, both gated
// is_super_admin() OR user_has_permission('scf.notes.review') server-side).
// ============================================================================

export const navMeta = { label: 'Learner Note Review', icon: 'ClipboardCheck' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { LearnerNotesApprovalQueue } from '@/app/(routes)/admin/learner-notes/_components/learner-notes-approval-queue';

export default function LearnerNoteReviewPage() {
  return (
    <ContentLayout title="Learner Note Review">
      <PermissionGuard
        module="scf.notes"
        action="review"
        loading={
          // Never `return null` while permissions load — visible skeletons
          // keep the layout stable (no shift when the queue mounts).
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        }
        fallback={
          // Explicit denial, never a silent redirect: the person can see WHY
          // and who to contact (CLAUDE.md rule 27).
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You don&apos;t have access to the learner-note review queue. It is
            reserved for the named note reviewer (the &lsquo;scf.notes.review&rsquo;
            permission). If you should be reviewing these notes, contact the
            Director or a super admin to grant you the SCF Note Reviewer role.
          </div>
        }
      >
        <LearnerNotesApprovalQueue />
      </PermissionGuard>
    </ContentLayout>
  );
}
