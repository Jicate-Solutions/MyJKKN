// @vitest-environment jsdom
/**
 * The "did the applicant get their email?" line in a decided request's detail
 * sheet (2026-09-11).
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HrDecisionEmail } from '@/types/hr-decision-email';

const state = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/hooks/hr/use-decision-email', () => ({
  useDecisionEmail: () => ({ data: state.data }),
}));

import { DecisionEmailStatus } from '@/app/(routes)/hr/leave/_components/decision-email-status';

const row = (p: Partial<HrDecisionEmail>): HrDecisionEmail => ({
  id: 'm1', leave_application_id: 'a1', comp_off_credit_id: null, decision: 'approved',
  to_email: 'anita@jkkn.ac.in', status: 'pending', attempts: 0,
  next_attempt_at: '2026-09-11T05:00:00Z', last_error: null,
  created_at: '2026-09-11T05:00:00Z', sent_at: null, ...p,
});

const show = (data: HrDecisionEmail | null) => {
  state.data = data;
  render(<DecisionEmailStatus target={{ leaveApplicationId: 'a1' }} />);
};

afterEach(() => cleanup());

describe('DecisionEmailStatus', () => {
  it('shows nothing for a decision made before these emails existed', () => {
    show(null);
    expect(screen.queryByTestId('decision-email-status')).not.toBeInTheDocument();
  });

  it('sent: to whom and when (IST)', () => {
    show(row({ status: 'sent', sent_at: '2026-09-11T05:02:00Z' }));
    expect(screen.getByTestId('decision-email-status')).toHaveTextContent(
      /Email sent to anita@jkkn\.ac\.in · 11 Sept?, 10:32 am/i
    );
  });

  it('queued, then retrying with the reason', () => {
    show(row({}));
    expect(screen.getByTestId('decision-email-status')).toHaveTextContent('Email to anita@jkkn.ac.in is queued');
    cleanup();
    show(row({ attempts: 2, last_error: 'Too many requests' }));
    expect(screen.getByTestId('decision-email-status')).toHaveTextContent(
      'not sent yet (attempt 2 of 5): Too many requests — retrying'
    );
  });

  it('failed and skipped say why', () => {
    show(row({ status: 'failed', last_error: 'Not sent within 3 days of the decision' }));
    expect(screen.getByTestId('decision-email-status')).toHaveTextContent(
      'Email to anita@jkkn.ac.in failed: Not sent within 3 days of the decision'
    );
    cleanup();
    show(row({ status: 'skipped', to_email: null, last_error: 'No institution email on the staff record' }));
    expect(screen.getByTestId('decision-email-status')).toHaveTextContent(
      'No email sent — No institution email on the staff record'
    );
  });
});
