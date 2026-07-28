// ============================================================================
// ID CARDS — BATCH PRINT (cohort-driven)
// ============================================================================
// Created: 2026-07-24 (Phase 3 — admission-week scale batch printing).
//
// Print ID cards for a whole cohort in one go:
//   • Freshers batch — institution + admission year.
//   • Class / section — institution + program (+ section). School classes
//     (LKG, GRADE 3, …) are programs rows, so this covers class-wise
//     printing for Nattraja Vidhyalya CBSE and JKKN Matric HSS too.
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
            Queue ID cards for a whole cohort at once — a freshers batch
            (admission year) or a school class / section. Pick the cohort,
            review the exact card count and ribbon estimate, then confirm.
            Learners without an activated account are skipped and reported.
          </p>
          <p className="mt-2">
            Every card consumes one ribbon panel and prints in roughly
            15 seconds. Large batches tie up the printer for a while — check
            ribbon stock before confirming, and watch progress on the{' '}
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
