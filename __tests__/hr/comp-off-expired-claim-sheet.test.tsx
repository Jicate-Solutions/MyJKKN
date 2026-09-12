// @vitest-environment jsdom
/**
 * An expired comp-off claim can only be rejected (2026-09-11).
 *
 * trg_hcoc_block_expired_approval refuses pending -> approved once the claim's
 * one-month expiry has passed, and fn_hr_comp_off_reject_expired_claims rejects
 * it overnight. The detail sheet must not offer an Approve the database refuses.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CompOffClaimDetailSheet } from '@/app/(routes)/hr/leave/_components/comp-off-claim-detail-sheet';
import type { PendingCompOffClaim } from '@/types/hr-comp-off';

const claim: PendingCompOffClaim = {
  id: 'c1', employee_id: 'emp-1', employee_name: 'Test Staff', employee_code: 'JKKN001',
  institution_id: 'inst-1', institution_name: 'JKKN Dental College',
  worked_date: '2026-08-03', expires_on: '2026-09-03', credit_days: 1, source: 'claim',
  notes: null, work_location: 'inside_campus', work_place: null, documents: [],
  created_at: '2026-08-04T10:00:00Z',
};

function renderSheet(lapsed: boolean) {
  render(
    <CompOffClaimDetailSheet
      claim={claim} isOwn={false} lapsed={lapsed} busy={false}
      onOpenChange={() => {}} onApprove={() => {}} onReject={() => {}}
    />
  );
}

afterEach(cleanup);

describe('Comp-off claim detail sheet — expired claims', () => {
  it('disables Approve and explains why when the claim has expired', () => {
    renderSheet(true);
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
    expect(screen.getByText(/can no\s+longer be approved/i)).toBeInTheDocument();
  });

  it('offers Approve on a claim that is still in date', () => {
    renderSheet(false);
    expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
    expect(screen.queryByText(/can no\s+longer be approved/i)).not.toBeInTheDocument();
  });
});
