// @vitest-environment jsdom
// =====================================================================
// HR appraisals — the committee and Director panel, rendered with data
// =====================================================================
// GAP closed: this panel had never been rendered with an appraisal in it,
// not even in jsdom, and it cannot be driven in a browser because
// production holds no rounds. These tests feed it fixture appraisals and
// assert what a reviewer would actually see and click: every tier's band
// per area, the picker pre-filled from the supervisor, the Collegiality
// example rule, the previewed score, the increment-blocked notice, and
// exactly what each button sends to the service.
//
// The service is mocked, so these prove the SCREEN; the database side is
// proven by the throwaway-Postgres rehearsal described on the PR.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  submitSedcReview: vi.fn(),
  finalApprove: vi.fn(),
  sendBack: vi.fn(),
}));
const toastFns = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/services/hr/performance-review-service', () => ({
  PerformanceReviewService: svc,
}));
vi.mock('react-hot-toast', () => ({ default: toastFns }));

import { ReviewDecisionPanel } from '@/features/hr/appraisal/review-decision-panel';
import type { HRPerformanceReview } from '@/lib/services/hr/performance-review-service';

const SUPABASE = { marker: 'client' } as never;

function appraisal(over: Partial<HRPerformanceReview>): HRPerformanceReview {
  return {
    id: 'rev-1',
    cycle_id: 'cyc-1',
    staff_id: 'person-1',
    self_appraisal_jsonb: null,
    supervisor_review_jsonb: null,
    sedc_review_jsonb: null,
    final_score: null,
    final_remarks: null,
    status: 'supervisor_reviewed',
    self_submitted_at: null,
    supervisor_reviewed_at: null,
    sedc_reviewed_at: null,
    final_approved_at: null,
    final_approved_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

const SELF = { ratings: { teaching: 'exceeds', research: 'meets', service: 'meets', collegiality: 'meets' } };
const SUPERVISOR = { ratings: { teaching: 'meets', research: 'below', service: 'exceeds', collegiality: 'meets' } };

function renderPanel(
  review: HRPerformanceReview,
  opts: { policy?: Record<string, unknown> | null; approver?: string | null } = {},
) {
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(
    <ReviewDecisionPanel
      supabase={SUPABASE}
      review={review}
      policy={(opts.policy ?? null) as never}
      approverProfileId={opts.approver === undefined ? 'director-1' : opts.approver}
      onDone={onDone}
      onClose={onClose}
    />,
  );
  return { onDone, onClose };
}

/** The Self / Supervisor / Committee bands shown on one area's table row. */
function bandsFor(area: string): string[] {
  const row = within(screen.getByRole('table'))
    .getAllByRole('row')
    .find((r) => within(r).queryAllByRole('cell')[0]?.textContent === area);
  if (!row) throw new Error(`no row for ${area}`);
  return within(row).getAllByRole('cell').slice(1).map((c) => c.textContent ?? '');
}

function checkedBand(area: string): string | null {
  const group = screen.getByRole('radiogroup', { name: area });
  const on = within(group).getAllByRole('radio').find((r) => (r as HTMLInputElement).checked);
  return on ? (on as HTMLInputElement).value : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.submitSedcReview.mockImplementation(async (_c, id) => appraisal({ id, status: 'sedc_reviewed' }));
  svc.finalApprove.mockImplementation(async (_c, id) => appraisal({ id, status: 'final_approved' }));
  svc.sendBack.mockImplementation(async (_c, id, to) => appraisal({ id, status: to }));
});

describe('committee step (supervisor_reviewed)', () => {
  const review = appraisal({
    status: 'supervisor_reviewed',
    self_appraisal_jsonb: SELF,
    supervisor_review_jsonb: SUPERVISOR,
  });

  it('shows every tier side by side, with the right band per area', () => {
    renderPanel(review);
    expect(screen.getByText('Committee review')).toBeInTheDocument();
    expect(bandsFor('Teaching')).toEqual(['Exceeds', 'Meets', 'Not rated']);
    expect(bandsFor('Research')).toEqual(['Meets', 'Below', 'Not rated']);
    expect(bandsFor('Service')).toEqual(['Meets', 'Exceeds', 'Not rated']);
    expect(bandsFor('Collegiality')).toEqual(['Meets', 'Meets', 'Not rated']);
  });

  it('pre-fills the committee picker from the supervisor', () => {
    renderPanel(review);
    expect(screen.getByText(/Pre-filled from the supervisor/)).toBeInTheDocument();
    expect(checkedBand('Teaching')).toBe('meets');
    expect(checkedBand('Research')).toBe('below');
    expect(checkedBand('Service')).toBe('exceeds');
    expect(checkedBand('Collegiality')).toBe('meets');
  });

  it('shows the notes hint as words, not an HTML entity (a JS string does not decode &rsquo;)', () => {
    renderPanel(review);
    const hint = screen.getByLabelText('Normalisation notes').getAttribute('placeholder') ?? '';
    expect(hint).toContain('supervisor’s ratings');
    expect(hint).not.toMatch(/&[a-z]+;/);
  });

  it('offers Send to Director and Send back to the head, and send-back needs a reason', () => {
    renderPanel(review);
    expect(screen.getByRole('button', { name: /Send to Director/ })).toBeEnabled();
    const back = screen.getByRole('button', { name: /Send back to the head of department/ });
    expect(back).toBeDisabled();
    expect(screen.getByText('Sending back needs a reason.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve and close/ })).not.toBeInTheDocument();
  });

  it('asks for a Collegiality example when the committee rates it Below, and will not send without one', () => {
    renderPanel(review);
    const coll = screen.getByRole('radiogroup', { name: 'Collegiality' });
    fireEvent.click(within(coll).getByLabelText('Below expectations'));
    expect(screen.getByLabelText(/Give an example of the behaviour/)).toBeInTheDocument();
    expect(screen.getByText(/At least 20 characters/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Send to Director/ }));
    expect(toastFns.error).toHaveBeenCalledWith('A Below in Collegiality needs a written example.');
    expect(svc.submitSedcReview).not.toHaveBeenCalled();
  });

  it('refuses to send with an area unrated, naming it, and calls no service', () => {
    const incomplete = appraisal({
      status: 'supervisor_reviewed',
      self_appraisal_jsonb: SELF,
      supervisor_review_jsonb: { ratings: { teaching: 'meets', research: 'meets', collegiality: 'meets' } },
    });
    renderPanel(incomplete);
    expect(checkedBand('Service')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Send to Director/ }));
    expect(toastFns.error).toHaveBeenCalledWith('Rate every area. Still to rate: Service.');
    expect(svc.submitSedcReview).not.toHaveBeenCalled();
    expect(svc.sendBack).not.toHaveBeenCalled();
  });

  it('sends the committee ratings, example and notes when complete', async () => {
    const { onDone } = renderPanel(review);
    const teaching = screen.getByRole('radiogroup', { name: 'Teaching' });
    fireEvent.click(within(teaching).getByLabelText('Exceeds expectations'));
    fireEvent.change(screen.getByLabelText('Normalisation notes'), {
      target: { value: 'Raised Teaching on the course feedback.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to Director/ }));

    await vi.waitFor(() => expect(svc.submitSedcReview).toHaveBeenCalledTimes(1));
    expect(svc.submitSedcReview).toHaveBeenCalledWith(SUPABASE, 'rev-1', {
      ratings: { teaching: 'exceeds', research: 'below', service: 'exceeds', collegiality: 'meets' },
      collegiality_example: '',
      normalisation_notes: 'Raised Teaching on the course feedback.',
    });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('sends it back to the head with the note', async () => {
    renderPanel(review);
    fireEvent.change(screen.getByLabelText('Normalisation notes'), {
      target: { value: 'Recheck Research against the records.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send back to the head of department/ }));
    await vi.waitFor(() => expect(svc.sendBack).toHaveBeenCalledTimes(1));
    expect(svc.sendBack).toHaveBeenCalledWith(
      SUPABASE, 'rev-1', 'self_submitted', 'Recheck Research against the records.',
    );
  });

  it('shows the Director’s note when the Director sent it back to the committee', () => {
    renderPanel(
      appraisal({
        status: 'supervisor_reviewed',
        self_appraisal_jsonb: SELF,
        supervisor_review_jsonb: SUPERVISOR,
        sedc_review_jsonb: {
          ratings: SUPERVISOR.ratings,
          sent_back_by: 'director',
          sent_back_reason: 'Explain the Below in Research.',
        },
      }),
    );
    expect(screen.getByText('The Director sent this back to the committee')).toBeInTheDocument();
    expect(screen.getByText('Explain the Below in Research.')).toBeInTheDocument();
  });

  it('does not show a note under the Director’s name when someone else wrote it', () => {
    renderPanel(
      appraisal({
        status: 'supervisor_reviewed',
        supervisor_review_jsonb: SUPERVISOR,
        sedc_review_jsonb: { sent_back_by: 'committee', sent_back_reason: 'Not the Director.' },
      }),
    );
    expect(screen.queryByText('The Director sent this back to the committee')).not.toBeInTheDocument();
    expect(screen.queryByText('Not the Director.')).not.toBeInTheDocument();
  });
});

describe('Director step (sedc_reviewed)', () => {
  const COMMITTEE = {
    ratings: { teaching: 'exceeds', research: 'meets', service: 'below', collegiality: 'meets' },
  };
  const review = appraisal({
    status: 'sedc_reviewed',
    self_appraisal_jsonb: SELF,
    supervisor_review_jsonb: SUPERVISOR,
    sedc_review_jsonb: COMMITTEE,
  });

  it('shows the committee ratings and a picker pre-filled from them (30 Sep: the Director may change a rating)', () => {
    renderPanel(review);
    expect(screen.getByText('Director sign-off')).toBeInTheDocument();
    expect(bandsFor('Teaching')).toEqual(['Exceeds', 'Meets', 'Exceeds']);
    expect(bandsFor('Service')).toEqual(['Meets', 'Exceeds', 'Below']);
    const teaching = screen.getByRole('radiogroup', { name: 'Teaching' });
    expect(within(teaching).getByLabelText('Exceeds expectations')).toBeChecked();
    // No reason box until a rating is changed; no committee button at this step.
    expect(screen.queryByLabelText(/Why you changed/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send to Director/ })).not.toBeInTheDocument();
  });

  it('a changed rating needs a reason, and approving sends the ratings with the reason', async () => {
    const { onDone } = renderPanel(review);
    const service = screen.getByRole('radiogroup', { name: 'Service' });
    fireEvent.click(within(service).getByLabelText('Meets expectations'));
    expect(screen.getByLabelText(/Why you changed this rating/)).toBeInTheDocument();
    // The preview follows the changed rating, not the committee's.
    expect(screen.getByText('1 Exceeds, 3 Meets')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Approve and close/ }));
    expect(toastFns.error).toHaveBeenCalledWith(expect.stringMatching(/at least 10 characters/));
    expect(svc.finalApprove).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Why you changed this rating/), {
      target: { value: 'The service record shows the committee work was shared.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Approve and close/ }));
    await vi.waitFor(() => expect(svc.finalApprove).toHaveBeenCalledTimes(1));
    expect(svc.finalApprove).toHaveBeenCalledWith(SUPABASE, 'rev-1', {
      final_remarks: '',
      approver_profile_id: 'director-1',
      director_ratings: { teaching: 'exceeds', research: 'meets', service: 'meets', collegiality: 'meets' },
      director_reason: 'The service record shows the committee work was shared.',
      director_collegiality_example: undefined,
    });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('approving without a change sends no Director rating', async () => {
    renderPanel(review);
    fireEvent.click(screen.getByRole('button', { name: /Approve and close/ }));
    await vi.waitFor(() => expect(svc.finalApprove).toHaveBeenCalledTimes(1));
    expect(svc.finalApprove).toHaveBeenCalledWith(SUPABASE, 'rev-1', {
      final_remarks: '',
      approver_profile_id: 'director-1',
      director_ratings: undefined,
      director_reason: undefined,
      director_collegiality_example: undefined,
    });
  });

  it('a committee Below in Collegiality is not re-asked of the Director when he changes another area', async () => {
    renderPanel(appraisal({
      ...review,
      sedc_review_jsonb: { ratings: { teaching: 'meets', research: 'below', service: 'meets', collegiality: 'below' } },
    } as never), { policy: { collegiality_below_requires_example: true } });
    const research = screen.getByRole('radiogroup', { name: 'Research' });
    fireEvent.click(within(research).getByLabelText('Meets expectations'));
    fireEvent.change(screen.getByLabelText(/Why you changed this rating/), { target: { value: 'Two papers were accepted after the committee met.' } });
    fireEvent.click(screen.getByRole('button', { name: /Approve and close/ }));
    await vi.waitFor(() => expect(svc.finalApprove).toHaveBeenCalledTimes(1));
    expect(toastFns.error).not.toHaveBeenCalledWith('A Below in Collegiality needs a written example.');
    expect(svc.finalApprove.mock.calls[0][2].director_collegiality_example).toBeUndefined();
  });

  it('a Below in Collegiality by the Director needs a written example, like the committee’s', async () => {
    renderPanel(review, { policy: { collegiality_below_requires_example: true } });
    const coll = screen.getByRole('radiogroup', { name: 'Collegiality' });
    fireEvent.click(within(coll).getByLabelText('Below expectations'));
    fireEvent.change(screen.getByLabelText(/Why you changed this rating/), {
      target: { value: 'Two complaints about shared duties this term.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Approve and close/ }));
    expect(toastFns.error).toHaveBeenCalledWith('A Below in Collegiality needs a written example.');
    expect(svc.finalApprove).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/example/i), {
      target: { value: 'Missed three of four departmental duties and left the load to colleagues.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Approve and close/ }));
    await vi.waitFor(() => expect(svc.finalApprove).toHaveBeenCalledTimes(1));
    expect(svc.finalApprove.mock.calls[0][2]).toMatchObject({
      director_ratings: expect.objectContaining({ collegiality: 'below' }),
      director_collegiality_example: 'Missed three of four departmental duties and left the load to colleagues.',
    });
  });

  it('shows a recorded Director rating beside the committee’s, read-only', () => {
    renderPanel(appraisal({
      ...review,
      status: 'final_approved',
      director_review_jsonb: { ratings: { service: 'meets' }, reason: 'Shared committee work', set_by: 'director-1', set_at: '2026-09-30T12:00:00Z' },
    } as never));
    expect(screen.getByText('Director')).toBeInTheDocument();
    expect(screen.getByTestId('director-rating-service')).toHaveTextContent('Meets');
    // Areas he did not change are not "Not rated": they stand as the committee rated them.
    expect(screen.getByTestId('director-rating-teaching')).toHaveTextContent('as the committee');
  });

  it('a signed-off appraisal reads back the Director’s change, his reason and the laid-over result, with nothing to click', () => {
    renderPanel(appraisal({
      ...review,
      status: 'final_approved',
      final_score: 62.5,
      final_remarks: 'Signed off with one change.',
      director_review_jsonb: { ratings: { service: 'meets' }, reason: 'Shared committee work', set_by: 'director-1', set_at: '2026-09-30T12:00:00Z' },
    } as never));
    expect(screen.getByText('Signed off')).toBeInTheDocument();
    const note = screen.getByTestId('director-change-note');
    expect(note).toHaveTextContent('The Director changed Service');
    expect(note).toHaveTextContent('Shared committee work');
    expect(screen.getByTestId('final-remarks')).toHaveTextContent('Signed off with one change.');
    // Committee: 1 Exceeds, 2 Meets, 1 Below (service below). Laid over: service → meets.
    expect(screen.getByText('1 Exceeds, 3 Meets')).toBeInTheDocument();
    expect(screen.getByText(/The recorded promotion score is 62.5 out of 100\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve and close/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send back/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to list/ })).toBeInTheDocument();
  });

  it('previews the promotion score from the committee ratings', () => {
    renderPanel(review);
    expect(screen.getByText('1 Exceeds, 2 Meets, 1 Below')).toBeInTheDocument();
    expect(screen.getByText(/Promotion reads this as 50 out of 100\./)).toBeInTheDocument();
  });

  it('says the increment is stopped when the college has chosen that a Below blocks it', () => {
    renderPanel(review, { policy: { below_blocks_increment: true } });
    expect(screen.getByText(/These ratings stop the increment\./)).toBeInTheDocument();
  });

  it('says nothing about the increment when the college has not chosen that', () => {
    renderPanel(review);
    expect(screen.queryByText(/These ratings stop the increment/)).not.toBeInTheDocument();
  });

  it('Approve calls sign-off with the approver and the remarks', async () => {
    const { onDone } = renderPanel(review);
    fireEvent.change(screen.getByLabelText('Your remarks'), { target: { value: 'Agreed.' } });
    fireEvent.click(screen.getByRole('button', { name: /Approve and close/ }));
    await vi.waitFor(() => expect(svc.finalApprove).toHaveBeenCalledTimes(1));
    expect(svc.finalApprove).toHaveBeenCalledWith(SUPABASE, 'rev-1', {
      final_remarks: 'Agreed.',
      approver_profile_id: 'director-1',
    });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('Send back returns it to the committee with the note', async () => {
    renderPanel(review);
    fireEvent.change(screen.getByLabelText('Your remarks'), {
      target: { value: 'Explain the Below in Service.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send back to committee/ }));
    await vi.waitFor(() => expect(svc.sendBack).toHaveBeenCalledTimes(1));
    expect(svc.sendBack).toHaveBeenCalledWith(
      SUPABASE, 'rev-1', 'supervisor_reviewed', 'Explain the Below in Service.',
    );
    expect(svc.finalApprove).not.toHaveBeenCalled();
  });

  it('cannot be approved while an area is unrated', () => {
    renderPanel(
      appraisal({
        status: 'sedc_reviewed',
        sedc_review_jsonb: { ratings: { teaching: 'meets', research: 'meets', service: 'meets' } },
      }),
    );
    expect(screen.getByRole('button', { name: /Approve and close/ })).toBeDisabled();
    expect(screen.getByText('Every area must be rated before this can be approved.')).toBeInTheDocument();
  });
});

describe('a Director whose profile cannot be identified', () => {
  it('is told so, and nothing is signed off', () => {
    renderPanel(
      appraisal({
        status: 'sedc_reviewed',
        sedc_review_jsonb: {
          ratings: { teaching: 'meets', research: 'meets', service: 'meets', collegiality: 'meets' },
        },
      }),
      { approver: null },
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve and close/ }));
    expect(toastFns.error).toHaveBeenCalledWith(
      'Your profile could not be identified, so this cannot be signed off.',
    );
    expect(svc.finalApprove).not.toHaveBeenCalled();
  });
});

describe('what the person wrote', () => {
  it.each(['supervisor_reviewed', 'sedc_reviewed'] as const)(
    'at the %s step, shows the self-appraisal in words, not JSON',
    (status) => {
      renderPanel(
        appraisal({
          status,
          self_appraisal_jsonb: {
            ...SELF,
            achievements: 'Guided four final-year projects.',
            goals_next_year: 'Submit the thesis.',
          },
          supervisor_review_jsonb: SUPERVISOR,
        }),
      );
      expect(screen.getByText('What the person wrote in their self-appraisal')).toBeInTheDocument();
      expect(screen.getByText('Guided four final-year projects.')).toBeInTheDocument();
      expect(screen.getByText('Goals for next year')).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('"achievements"');
    },
  );
});
