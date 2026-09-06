// ============================================================================
// ID CARDS — PHOTO CHECK
// ============================================================================
// Created: 2026-08-26.
//
// The list behind Guard 3. The endpoint refuses to print a card for anyone with
// no photograph (lib/services/id-cards/reprint-eligibility.ts), which is right
// and, on its own, useless to the office: it fires one person at a time, at the
// counter, after they have already queued. This page answers the question that
// refusal creates — "who else?" — before anyone walks up.
//
// Read-only by design: the fix is a photograph somebody has to take, so the
// page detects, counts and links out to the learner's own edit screen rather
// than changing anything itself.
//
// Lives beside Batch Print and Address Check because the audience is the same
// office, on the same day, doing the same job. Gated on id_cards.jobs.view, the
// same key Address Check uses, so everyone who can see the ID Cards menu can
// also see who is about to be turned away.
// ============================================================================

export const navMeta = { label: 'Photo Check', icon: 'Camera' } as const;

import { PolicyPageShell } from '@/lib/admin/policy-shell';
import { IdCardPhotoCheck } from '@/components/admin/id-cards/id-card-photo-check';

export default function IdCardPhotoCheckPage() {
  return (
    <PolicyPageShell
      title="Photo Check"
      explainer={
        <>
          <h3 className="mb-2 text-sm font-semibold">What this page does</h3>
          <p>
            An ID card is not printed for anyone who has no photograph. The QR on the card
            carries only a number, and a photograph of somebody else&apos;s card scans exactly
            the same — so the picture, and a person looking at it, is what actually checks
            who is holding it. A card showing initials where a face belongs proves nothing.
          </p>
          <p className="mt-2">
            This page lists, for one college at a time, the learners a card cannot be printed
            for yet, so the photo drive can work down a list instead of finding out one
            person at a time at the counter.
          </p>
          <p className="mt-2">
            Three states are separated here. <strong>No photograph</strong> means no card can
            be printed at all until somebody takes one.{' '}
            <strong>Account picture only</strong> means a card <em>will</em> print, but using
            whatever picture is on the learner&apos;s own login account rather than one the
            institution took — it prints after an extra confirmation, and is worth replacing.{' '}
            <strong>Ready to print</strong> needs nothing.
          </p>
          <p className="mt-2">
            Nothing here edits a record or queues a card. Use <strong>Open</strong> to add the
            photograph on the learner&apos;s own screen, then <strong>Re-check</strong>.
            <strong> Export</strong> gives the current list as a spreadsheet for the drive.
          </p>
        </>
      }
      permissionKey="id_cards.jobs.view"
    >
      <IdCardPhotoCheck />
    </PolicyPageShell>
  );
}
