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
        <div className="space-y-4">
          <ol className="grid gap-3 sm:grid-cols-3">
            <li className="flex gap-3 rounded-lg border bg-background/70 p-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                1
              </span>
              <div>
                <p className="font-medium text-foreground">Choose the cohort</p>
                <p className="mt-0.5 text-xs">
                  A freshers batch (admission year) or one or more classes, with an optional
                  section.
                </p>
              </div>
            </li>
            <li className="flex gap-3 rounded-lg border bg-background/70 p-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                2
              </span>
              <div>
                <p className="font-medium text-foreground">Review the learners</p>
                <p className="mt-0.5 text-xs">
                  Everyone who matches is listed with photo and roll number, all ticked. Untick
                  anyone who should not get a card.
                </p>
              </div>
            </li>
            <li className="flex gap-3 rounded-lg border bg-background/70 p-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                3
              </span>
              <div>
                <p className="font-medium text-foreground">Preview &amp; print</p>
                <p className="mt-0.5 text-xs">
                  Every card is rendered and checked first. Download the PDF, print on A4, or queue
                  the Evolis card printer from inside the preview.
                </p>
              </div>
            </li>
          </ol>
          <p className="text-xs">
            Missing or wrong data — a blank photo, roll number or address the{' '}
            <strong>Address Check</strong> rules flag — is framed in{' '}
            <span className="font-semibold text-red-600">red</span> on the card and listed at the
            top of the preview. Learners without an activated account are skipped and reported.
            Each card uses one ribbon panel and takes about 15 seconds; follow progress on the{' '}
            <strong>Print Queue</strong> page.
          </p>
        </div>
      }
      permissionKey="id_cards.jobs.manage"
    >
      <IdCardBatchPrint />
    </PolicyPageShell>
  );
}
