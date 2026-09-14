// @vitest-environment jsdom
/**
 * Inside-campus comp-off claims need a punch on the worked day before approval
 * (2026-09-11). trg_hcoc_require_biometric refuses 'no_punch' and
 * 'not_uploaded'; the sidebar must show the result and not offer an Approve the
 * database will refuse. Outside-campus claims show the place and skip the check.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CompOffClaimDetailSheet } from '@/app/(routes)/hr/leave/_components/comp-off-claim-detail-sheet';
import {
  biometricBlocksApproval,
  describeBiometric,
  type CompOffClaimBiometric,
  type PendingCompOffClaim,
} from '@/types/hr-comp-off';

const base: PendingCompOffClaim = {
  id: 'c1', employee_id: 'emp-1', employee_name: 'Test Staff', employee_code: 'JKKN001',
  institution_id: 'inst-1', institution_name: 'JKKN College of Engineering and Technology',
  worked_date: '2026-09-06', expires_on: '2026-10-06', credit_days: 1, source: 'claim',
  notes: null, work_location: 'inside_campus', work_place: null, documents: [],
  created_at: '2026-09-07T10:00:00Z',
};

const check = (p: Partial<CompOffClaimBiometric>): CompOffClaimBiometric => ({
  claim_id: 'c1', status: 'punched', in_at: null, out_at: null, source: null, ...p,
});

describe('describeBiometric / biometricBlocksApproval', () => {
  it('prints the punch times in IST for a device punch', () => {
    const d = describeBiometric(check({
      status: 'punched', source: 'biometric',
      in_at: '2026-09-06T03:13:00Z', out_at: '2026-09-06T11:40:00Z',
    }));
    expect(d?.label).toBe('Biometric 08:43–17:10');
    expect(d?.tone).toBe('ok');
  });

  it('names a regularised day as such, not as a device punch', () => {
    const d = describeBiometric(check({
      status: 'punched', source: 'regularization', in_at: '2026-09-06T03:30:00Z',
    }));
    expect(d?.label).toBe('Attendance (regularised) 09:00');
  });

  it('has nothing to say for outside-campus or pre-location claims', () => {
    expect(describeBiometric(check({ status: 'not_required' }))).toBeNull();
    expect(describeBiometric(check({ status: 'not_recorded' }))).toBeNull();
  });

  it('blocks approval only for no_punch and not_uploaded', () => {
    expect(biometricBlocksApproval('no_punch')).toBe(true);
    expect(biometricBlocksApproval('not_uploaded')).toBe(true);
    for (const s of ['punched', 'no_device', 'not_required', 'not_recorded'] as const) {
      expect(biometricBlocksApproval(s)).toBe(false);
    }
    expect(biometricBlocksApproval(undefined)).toBe(false);
  });
});

describe('Comp-off claim sidebar — location and punch check', () => {
  afterEach(cleanup);

  const renderSheet = (claim: PendingCompOffClaim, biometric: CompOffClaimBiometric | null) =>
    render(
      <CompOffClaimDetailSheet
        claim={claim} isOwn={false} biometric={biometric} busy={false}
        onOpenChange={() => {}} onApprove={() => {}} onReject={() => {}}
      />
    );

  it('inside campus with a punch: shows it and allows Approve', () => {
    renderSheet(base, check({
      status: 'punched', source: 'biometric',
      in_at: '2026-09-06T03:13:00Z', out_at: '2026-09-06T11:40:00Z',
    }));
    expect(screen.getByText('Inside campus')).toBeInTheDocument();
    expect(screen.getByText('Biometric 08:43–17:10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
  });

  it('inside campus with no punch: says so and disables Approve, Reject stays', () => {
    renderSheet(base, check({ status: 'no_punch' }));
    expect(screen.getByText('No biometric punch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
  });

  it('inside campus, biometric not uploaded: disables Approve and says to import', () => {
    renderSheet(base, check({ status: 'not_uploaded' }));
    expect(screen.getByText('Biometric not uploaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
    expect(screen.getAllByText(/Import it from HR/i).length).toBeGreaterThan(0);
  });

  it('inside campus, no device: allows Approve and asks to verify the proof', () => {
    renderSheet(base, check({ status: 'no_device' }));
    expect(screen.getByText('No biometric device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
  });

  it('outside campus: shows the place, no punch check, Approve allowed', () => {
    renderSheet(
      { ...base, work_location: 'outside_campus', work_place: 'Chennai – NAAC visit' },
      check({ status: 'not_required' })
    );
    expect(screen.getByText('Outside campus')).toBeInTheDocument();
    expect(screen.getByText('Chennai – NAAC visit')).toBeInTheDocument();
    expect(screen.queryByText(/^Biometric on/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
  });
});
