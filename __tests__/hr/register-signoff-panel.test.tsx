// @vitest-environment jsdom
/**
 * The sign-off panel on one salary register (20271007161107).
 *
 * Sign shows only to a team member holding that step's key; the withdraw link
 * shows only to the person who signed; an unsigned register says so. The
 * database is the real gate — these tests cover what the screen offers.
 *
 * Run: npx vitest run __tests__/hr/register-signoff-panel.test.tsx
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RegisterSignoffStatus, RegisterSignoffStep } from '@/types/hr-register-signoff';

let heldKeys: string[] = [];
let status: RegisterSignoffStatus | undefined;

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    canAccess: (module: string, action: string) => heldKeys.includes(`${module}.${action}`),
  }),
}));
vi.mock('@/hooks/hr/payroll/use-register-signoff', () => ({
  useRegisterSignoffStatus: () => ({ data: status, isLoading: false, error: null }),
  useSignRegister: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeRegisterSignoff: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { SignoffPanel } from '@/app/(routes)/hr/payroll/register/_components/signoff-panel';

const unsigned = (stage: RegisterSignoffStep['stage']): RegisterSignoffStep => ({
  stage, signed: false, signoff_id: null, signed_by: null, signer_name: null, signed_at: null,
  note: null, is_mine: false, last_revoked_at: null, last_revoke_reason: null,
});
const signedBy = (stage: RegisterSignoffStep['stage'], name: string, isMine: boolean): RegisterSignoffStep => ({
  ...unsigned(stage), signed: true, signoff_id: `sig-${stage}`, signed_by: `u-${name}`,
  signer_name: name, signed_at: '2027-10-07T10:30:00Z', is_mine: isMine,
});
const statusOf = (check: RegisterSignoffStep, sign: RegisterSignoffStep): RegisterSignoffStatus => ({
  run_id: 'run-1', superseded: false, stages: { college_check: check, accounts_sign: sign },
});

const row = (stage: string) => screen.getByTestId(`signoff-row-${stage}`);

beforeEach(() => {
  heldKeys = [];
  status = statusOf(unsigned('college_check'), unsigned('accounts_sign'));
});
afterEach(cleanup);

describe('Salary register sign-off panel', () => {
  it('shows both steps and says the register has not been signed', () => {
    render(<SignoffPanel runId="run-1" />);
    expect(within(row('college_check')).getByText('College check')).toBeInTheDocument();
    expect(within(row('accounts_sign')).getByText('Accounts sign-off')).toBeInTheDocument();
    expect(screen.getByText('This register has not been signed.')).toBeInTheDocument();
  });

  it('hides Sign from a team member without the step key', () => {
    heldKeys = ['hr.payroll.register.view'];
    render(<SignoffPanel runId="run-1" />);
    expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument();
  });

  it('offers Sign only on the step whose key the team member holds', () => {
    heldKeys = ['hr.payroll.register.check'];
    render(<SignoffPanel runId="run-1" />);
    expect(within(row('college_check')).getByRole('button', { name: 'Sign' })).toBeInTheDocument();
    expect(within(row('accounts_sign')).queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument();
  });

  it('does not offer Sign on a replaced register', () => {
    heldKeys = ['hr.payroll.register.check'];
    render(<SignoffPanel runId="run-1" isSuperseded />);
    expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument();
  });

  it('names the signer and shows the withdraw link only to the team member who signed', () => {
    status = statusOf(signedBy('college_check', 'Priya Raman', true), signedBy('accounts_sign', 'Arun Kumar', false));
    render(<SignoffPanel runId="run-1" />);
    expect(within(row('college_check')).getByText(/Priya Raman/)).toBeInTheDocument();
    expect(within(row('accounts_sign')).getByText(/Arun Kumar/)).toBeInTheDocument();
    expect(within(row('college_check')).getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(within(row('accounts_sign')).queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
    expect(screen.queryByText('This register has not been signed.')).not.toBeInTheDocument();
  });
});
