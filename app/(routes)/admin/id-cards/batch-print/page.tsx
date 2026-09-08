// ============================================================================
// ID CARDS — BATCH PRINT (cohort-driven)
// ============================================================================
// Created: 2026-07-24 (Phase 3 — admission-week scale batch printing).
//
// Print ID cards for a whole cohort in one go:
//   • Freshers batch — institution + admission year.
//   • Class / section — institution + program (+ semester, + section). School
//     classes (LKG, GRADE 3, …) are programs rows, so this covers class-wise
//     printing for Nattraja Vidhyalya CBSE and JKKN Matric HSS too.
//
// Preview is mandatory (2026-09-07): the batch opens IdCardPreviewDialog —
// student-wise front/back order, red data-issue highlighting, Address Check
// integration, PDF download — and the card-printer queue is reached only
// from inside it.
//
// Gated by id_cards.jobs.manage via Role Management (registrar / admission /
// custom roles), with the jobs API enforcing writer roles server-side.
// ============================================================================

export const navMeta = { label: 'Batch ID-Card Print', icon: 'Printer' } as const;

import { PolicyPageShell } from '@/lib/admin/policy-shell';
import { IdCardBatchPrint } from '@/components/admin/id-cards/id-card-batch-print';

export default function IdCardBatchPrintPage() {
  return (
    <PolicyPageShell
      title="Batch ID-Card Printing"
      explainer={
        <>
          <h3 className="mb-2 text-sm font-semibold">What this page does</h3>
          <p>
            Print ID cards for a whole cohort at once — a freshers batch
            (admission year) or a class / semester / section. Pick the cohort,
            then <strong>Preview &amp; print</strong>: every card is rendered
            learner by learner (front, then back, then the next learner) and
            checked before anything prints. Learners without an activated
            account are skipped and reported.
          </p>
          <p className="mt-2">
            Missing or wrong data — a blank photo, roll number or study period,
            an address the <strong>Address Check</strong> rules flag — is framed
            in <span className="font-semibold text-red-600">red</span> on the
            card and listed by learner and field at the top of the preview. Fix
            the record, regenerate, then <strong>Download PDF</strong> or print
            on A4. The PDF and the printed sheets are exactly what the preview
            shows.
          </p>
          <p className="mt-2">
            The Evolis card printer is queued from inside the preview. Every
            card consumes one ribbon panel and prints in roughly 15 seconds —
            check ribbon stock before confirming, and watch progress on the{' '}
            <strong>Print Queue</strong> page.
          </p>
        </>
      }
      permissionKey="id_cards.jobs.manage"
    >
      <IdCardBatchPrint />
    </PolicyPageShell>
  );
}
