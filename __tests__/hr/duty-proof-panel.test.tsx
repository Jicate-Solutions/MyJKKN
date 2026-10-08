// @vitest-environment jsdom
// =====================================================================
// HR staff harness — proof of done (2): the duty proof panel
// =====================================================================
// The panel lists decided items still missing their proof. On a second-check
// duty:
//   - the team member who decided an item sees no check button for it (the
//     database refuses them too; the screen should not offer it);
//   - "the amount is wrong" cannot be sent without the right amount and a
//     note of at least 10 characters.
// A viewer who may not see the duty sees nothing at all.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { DutyProofsResponse } from '@/types/hr-duty-proof';
import { validateSecondCheck } from '@/types/hr-duty-proof';

const mutateAsync = vi.fn().mockResolvedValue({ id: 'p1' });
let response: DutyProofsResponse | null = null;

vi.mock('@/hooks/hr/use-duty-proofs', () => ({
  startOfThisMonth: () => '2026-10-01',
  useDutyProofs: () => ({ data: response }),
  useRecordSecondCheck: () => ({ mutateAsync, isPending: false }),
  useAttachDutyProofFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DutyProofPanel } from '@/components/hr/duty-proof/duty-proof-panel';
import { DutyProofBadge } from '@/components/hr/duty-proof/duty-proof-badge';

const MINE = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

beforeEach(() => {
  mutateAsync.mockClear();
  response = {
    gaps: [
      { item_id: MINE, done_at: '2026-10-03T10:00:00Z', institution_id: 'i1', amount: 5000, caller_is_doer: true },
      { item_id: OTHER, done_at: '2026-10-04T10:00:00Z', institution_id: 'i1', amount: 7200, caller_is_doer: false },
    ],
    proofs: [],
  };
});

function rowFor(amountText: string) {
  return screen.getByText((t) => t.includes(amountText)).closest('div') as HTMLElement;
}

describe('DutyProofPanel — second check on leave encashment (L4)', () => {
  it('summarises how many decided items this month lack a second check', () => {
    render(<DutyProofPanel duty="L4" />);
    expect(screen.getByText('2 decided this month without a second check')).toBeTruthy();
  });

  it('hides the check button from the team member who approved the item', () => {
    render(<DutyProofPanel duty="L4" />);
    const mine = rowFor('₹5,000');
    expect(within(mine).queryByRole('button', { name: /check amount/i })).toBeNull();
    expect(within(mine).getByText(/another team member checks it/i)).toBeTruthy();
    const other = rowFor('₹7,200');
    expect(within(other).getByRole('button', { name: /check amount/i })).toBeTruthy();
  });

  it('a correction cannot be sent without the right amount and a note', () => {
    render(<DutyProofPanel duty="L4" />);
    fireEvent.click(within(rowFor('₹7,200')).getByRole('button', { name: /check amount/i }));
    fireEvent.click(screen.getByLabelText('The amount is wrong'));

    const send = screen.getByRole('button', { name: 'Record check' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('The right amount (₹)'), { target: { value: '6500' } });
    expect(send.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/at least 10 characters/);

    fireEvent.change(screen.getByLabelText('What is wrong'), { target: { value: 'too short' } });
    expect(send.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('What is wrong'), { target: { value: 'Rate should be the basic pay per day' } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(mutateAsync).toHaveBeenCalledWith({
      duty: 'L4', itemId: OTHER, result: 'corrected', correctedAmount: 6500,
      note: 'Rate should be the basic pay per day',
    });
  });

  it('a confirmation needs no amount or note', () => {
    render(<DutyProofPanel duty="L4" />);
    fireEvent.click(within(rowFor('₹7,200')).getByRole('button', { name: /check amount/i }));
    fireEvent.click(screen.getByLabelText('The amount is right'));
    const send = screen.getByRole('button', { name: 'Record check' }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it('renders nothing for a team member who may not see the duty', () => {
    response = null;
    const { container } = render(<DutyProofPanel duty="L4" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('DutyProofBadge', () => {
  it("names the team member who checked it", () => {
    response = {
      gaps: [],
      proofs: [{
        id: 'p1', duty_code: 'L4', item_id: OTHER, kind: 'second_check', storage_path: null, file_name: null,
        recorded_by: 'u2', recorded_by_name: 'Arun Kumar', recorded_at: '2026-10-05T10:00:00Z',
        check_result: 'confirmed', corrected_amount: null, check_note: null,
      }],
    };
    render(<DutyProofBadge duty="L4" itemId={OTHER} />);
    expect(screen.getByText('Checked by Arun Kumar')).toBeTruthy();
  });

  it('says a second check is needed for a decided item without one', () => {
    render(<DutyProofBadge duty="L4" itemId={OTHER} />);
    expect(screen.getByText('Second check needed')).toBeTruthy();
  });

  it('says nothing when the viewer may not see the duty, rather than claiming proof is missing', () => {
    response = null;
    const { container } = render(<DutyProofBadge duty="L4" itemId={OTHER} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('validateSecondCheck', () => {
  it('needs an amount and a 10-character note only for a correction', () => {
    expect(validateSecondCheck({ result: 'confirmed' })).toBeNull();
    expect(validateSecondCheck({ result: 'corrected', correctedAmount: '', note: 'Rate is wrong here' })).toMatch(/right amount/);
    expect(validateSecondCheck({ result: 'corrected', correctedAmount: 10, note: 'short' })).toMatch(/10 characters/);
    expect(validateSecondCheck({ result: 'corrected', correctedAmount: 10, note: 'Rate is wrong here' })).toBeNull();
  });
});

// Follow-up to the #4226 review (20271008110105).
describe('review fixes — the panel and the badge', () => {
  it('a note typed under "the amount is wrong" is not sent when the checker switches to "the amount is right"', () => {
    render(<DutyProofPanel duty="L4" />);
    fireEvent.click(within(rowFor('₹7,200')).getByRole('button', { name: /check amount/i }));
    fireEvent.click(screen.getByLabelText('The amount is wrong'));
    fireEvent.change(screen.getByLabelText('The right amount (₹)'), { target: { value: '6500' } });
    fireEvent.change(screen.getByLabelText('What is wrong'), { target: { value: 'Rate should be the basic pay per day' } });
    fireEvent.click(screen.getByLabelText('The amount is right'));
    fireEvent.click(screen.getByRole('button', { name: 'Record check' }));
    expect(mutateAsync).toHaveBeenCalledWith({
      duty: 'L4', itemId: OTHER, result: 'confirmed', correctedAmount: null, note: null,
    });
  });

  it('a check that went stale (the item is listed again) does not say "Checked by"', () => {
    response = {
      gaps: [{ item_id: OTHER, done_at: '2026-10-04T10:00:00Z', institution_id: 'i1', amount: 8000, caller_is_doer: false }],
      proofs: [{
        id: 'p1', duty_code: 'L4', item_id: OTHER, kind: 'second_check', storage_path: null, file_name: null,
        recorded_by: 'u2', recorded_by_name: 'Arun Kumar', recorded_at: '2026-10-05T10:00:00Z',
        check_result: 'confirmed', corrected_amount: null, check_note: null,
      }],
    };
    render(<DutyProofBadge duty="L4" itemId={OTHER} />);
    expect(screen.queryByText('Checked by Arun Kumar')).toBeNull();
    expect(screen.getByText('Second check needed again')).toBeTruthy();
  });
});

// A re-check marks the old second check revoked and adds a new one, so one
// item can carry both. The revoked row is listed FIRST on purpose: a plain
// find() would pick it.
describe('review fixes — a revoked check is never shown as the proof', () => {
  const revoked = {
    id: 'p-old', duty_code: 'L4' as const, item_id: OTHER, kind: 'second_check' as const,
    storage_path: null, file_name: null,
    recorded_by: 'u3', recorded_by_name: 'Meena Ravi', recorded_at: '2026-10-04T10:00:00Z',
    check_result: 'corrected' as const, corrected_amount: 6500, check_note: 'Rate should be the basic pay per day',
    revoked_at: '2026-10-06T09:00:00Z',
  };
  const live = {
    id: 'p-new', duty_code: 'L4' as const, item_id: OTHER, kind: 'second_check' as const,
    storage_path: null, file_name: null,
    recorded_by: 'u2', recorded_by_name: 'Arun Kumar', recorded_at: '2026-10-06T09:00:00Z',
    check_result: 'confirmed' as const, corrected_amount: null, check_note: null,
    revoked_at: null,
  };

  it('the badge names the live check, not the revoked one', () => {
    response = { gaps: [], proofs: [revoked, live] };
    render(<DutyProofBadge duty="L4" itemId={OTHER} />);
    expect(screen.getByText('Checked by Arun Kumar')).toBeTruthy();
    expect(screen.queryByText(/Meena Ravi/)).toBeNull();
  });

  it('the badge shows nothing when the only check is revoked', () => {
    response = { gaps: [], proofs: [revoked] };
    const { container } = render(<DutyProofBadge duty="L4" itemId={OTHER} />);
    expect(container.innerHTML).toBe('');
  });

  it('the badge says "Second check needed", not "again", when the only check on a listed item is revoked', () => {
    response = {
      gaps: [{ item_id: OTHER, done_at: '2026-10-04T10:00:00Z', institution_id: 'i1', amount: 7200, caller_is_doer: false }],
      proofs: [revoked],
    };
    render(<DutyProofBadge duty="L4" itemId={OTHER} />);
    expect(screen.getByText('Second check needed')).toBeTruthy();
    expect(screen.queryByText('Second check needed again')).toBeNull();
  });

  it('the panel for one item names the live check, not the revoked one', () => {
    response = { gaps: [], proofs: [revoked, live] };
    render(<DutyProofPanel duty="L4" itemId={OTHER} />);
    expect(screen.getByText(/checked by Arun Kumar/)).toBeTruthy();
    expect(screen.queryByText(/Meena Ravi/)).toBeNull();
  });

  it('the panel for one item shows nothing when the only check is revoked', () => {
    response = { gaps: [], proofs: [revoked] };
    const { container } = render(<DutyProofPanel duty="L4" itemId={OTHER} />);
    expect(container.innerHTML).toBe('');
  });
});
