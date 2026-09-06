// ============================================================================
// ID CARDS — ADDRESS CHECK
// ============================================================================
// Created: 2026-08-14.
//
// Finds the permanent addresses that will print wrong BEFORE the cards are
// printed, per college, ranked worst first. Read-only by design: the defects
// that matter (a record carrying two different PIN codes, a mobile number
// pasted into the street) need a person to decide which value is right, so the
// page detects, explains and links out to the learner's own edit screen rather
// than correcting anything itself.
//
// Lives beside Print Queue and Batch Print because the audience is the same
// office, on the same day, doing the same job. Gated on id_cards.jobs.view so
// everyone who can see the ID Cards menu can also see what is about to go wrong.
// ============================================================================

export const navMeta = { label: 'Address Check', icon: 'MapPin' } as const;

import { PolicyPageShell } from '@/lib/admin/policy-shell';
import { IdCardAddressCheck } from '@/components/admin/id-cards/id-card-address-check';

export default function IdCardAddressCheckPage() {
  return (
    <PolicyPageShell
      title="Address Check"
      explainer={
        <>
          <h3 className="mb-2 text-sm font-semibold">What this page does</h3>
          <p>
            The back of every ID card prints the permanent address, built by joining five
            fields together. This page checks those fields for each college and lists the
            records that will not print correctly, worst first, so they can be corrected
            before a batch is queued.
          </p>
          <p className="mt-2">
            Two very different things are separated here. <strong>Needs a person</strong>{' '}
            means the record holds something only a human can settle — two different PIN
            codes, a phone number typed into the address, filler text such as ***, or form
            labels pasted in from an identity document.{' '}
            <strong>Prints long or duplicated</strong> means the address is readable but the
            district, state or PIN is repeated inside the street, so it appears twice and
            the end is trimmed.
          </p>
          <p className="mt-2">
            Nothing here edits a record. Use <strong>Open</strong> to correct the address on
            the learner&apos;s own screen, then <strong>Re-check</strong>.
          </p>
        </>
      }
      permissionKey="id_cards.jobs.view"
    >
      <IdCardAddressCheck />
    </PolicyPageShell>
  );
}
