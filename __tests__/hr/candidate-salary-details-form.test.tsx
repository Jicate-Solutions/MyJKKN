// @vitest-environment jsdom
/**
 * "Details for the suggested salary" on the candidate page: the CV note sits
 * beside "Years of experience before JKKN" (the Director, 9 Oct 2026: the
 * years count only with a note saying where they come from).
 *
 *   - the summary says when recorded years are not counted for want of a note;
 *   - Save sends the note trimmed, and a blank or whitespace-only note as null.
 *
 * Runs the real hooks against a stubbed fetch.
 *
 * Run: npx vitest run __tests__/hr/candidate-salary-details-form.test.tsx
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CandidateSalaryDetails } from '@/app/(routes)/hr/recruitment/candidates/[id]/_components/candidate-salary-details';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CANDIDATE = '11111111-1111-4111-8111-111111111111';

function payload(source: string | null) {
  return {
    details: { designation_id: 'dg-1', department_id: 'dept-1', prior_experience_years: 4, prior_experience_source: source },
    roleTitle: 'Office Assistant',
    hasCollege: true,
    roleTitleMatchId: 'dg-1',
    designations: [{ id: 'dg-1', name: 'Office Assistant' }],
    departments: [{ id: 'dept-1', name: 'Mechanical' }],
  };
}

let current = payload(null);
const patches: Array<Record<string, unknown>> = [];

beforeEach(() => {
  current = payload(null);
  patches.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        patches.push(body);
        return new Response(JSON.stringify({ details: body }), { status: 200 });
      }
      return new Response(JSON.stringify(current), { status: 200 });
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDetails() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CandidateSalaryDetails candidateId={CANDIDATE} canEdit />
    </QueryClientProvider>
  );
}

describe('Details for the suggested salary: CV note', () => {
  it('says recorded years without a CV note are not counted', async () => {
    renderDetails();
    expect(await screen.findByText('4 years, no CV note: not counted')).toBeInTheDocument();
  });

  it('shows the CV note beside the years when there is one', async () => {
    current = payload('CV page 2');
    renderDetails();
    expect(await screen.findByText('4 years (CV page 2)')).toBeInTheDocument();
  });

  it('sends the CV note trimmed', async () => {
    renderDetails();
    fireEvent.click(await screen.findByRole('button', { name: /Edit details/ }));
    const note = screen.getByLabelText('Where in the CV');
    expect(screen.getByLabelText('Years of experience before JKKN')).toHaveValue(4);
    fireEvent.change(note, { target: { value: '  CV page 2 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      designation_id: 'dg-1',
      department_id: 'dept-1',
      prior_experience_years: 4,
      prior_experience_source: 'CV page 2',
    });
  });

  it('sends a whitespace-only CV note as no note', async () => {
    current = payload('CV page 2');
    renderDetails();
    fireEvent.click(await screen.findByRole('button', { name: /Edit details/ }));
    fireEvent.change(screen.getByLabelText('Where in the CV'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].prior_experience_source).toBeNull();
  });
});
