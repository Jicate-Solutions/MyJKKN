// @vitest-environment jsdom
/**
 * The "Suggested salary" box in Propose Package.
 *
 *   - "Use this figure" fills the Monthly Salary box and saves nothing: the only
 *     request is the GET for the suggestion;
 *   - a missing input is listed in words with who fixes it; the settings link
 *     shows to super admins only;
 *   - someone without hr.payroll.salary.view sees one plain line, no figure,
 *     and nothing is fetched.
 *
 * Runs the real hook against a stubbed fetch.
 *
 * Run: npx vitest run __tests__/hr/candidate-salary-suggestion-box.test.tsx
 */
import '@testing-library/jest-dom';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CandidateSalarySuggestionBox } from '@/app/(routes)/hr/recruitment/candidates/[id]/_components/candidate-salary-suggestion-box';

const CANDIDATE = '11111111-1111-4111-8111-111111111111';

const SUGGESTED = {
  suggestion: {
    verdict: 'suggested',
    suggested: 32000,
    aboveBandBy: null,
    departmentName: 'Mechanical',
    lines: [
      { label: 'Band floor for Assistant Professor', amount: 30000, note: 'The lowest pay on the band.' },
      { label: 'Years at JKKN', amount: null, note: 'Not counted: the candidate has not joined yet.' },
      { label: 'Years before JKKN', amount: 2000, note: '4 years before JKKN.' },
    ],
    reasons: [{ code: 'suggested_offer', text: 'Suggested starting salary: ₹32,000 a month.', fix: null }],
  },
  ruleUpdatedAt: null,
};

const RULE_NOT_SET = {
  suggestion: {
    verdict: 'cannot_suggest',
    suggested: null,
    aboveBandBy: null,
    departmentName: 'Mechanical',
    lines: [],
    reasons: [
      {
        code: 'department_amount_not_set',
        text: 'The Director has not set an amount for the Mechanical department, so no figure is suggested.',
        fix: {
          text: 'The Director sets it on Salary suggestion settings.',
          href: '/hr/admin/policies/salary-suggestion',
          linkLabel: 'Open Salary suggestion settings',
        },
      },
    ],
  },
  ruleUpdatedAt: null,
};

let payload: unknown = SUGGESTED;
const fetchCalls: Array<{ url: string; method: string }> = [];

beforeEach(() => {
  fetchCalls.length = 0;
  payload = SUGGESTED;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), method: init?.method ?? 'GET' });
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness({ canSeeSalary = true, isSuperAdmin = false }: { canSeeSalary?: boolean; isSuperAdmin?: boolean }) {
  const [salary, setSalary] = useState('');
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CandidateSalarySuggestionBox
        candidateId={CANDIDATE}
        canSeeSalary={canSeeSalary}
        isSuperAdmin={isSuperAdmin}
        onUseFigure={(n) => setSalary(String(n))}
      />
      <label htmlFor='proposeSalary'>Monthly Salary</label>
      <input id='proposeSalary' value={salary} onChange={(e) => setSalary(e.target.value)} />
    </QueryClientProvider>
  );
}

describe('Suggested salary box', () => {
  it('"Use this figure" fills the Monthly Salary box and saves nothing', async () => {
    render(<Harness />);
    expect(await screen.findByTestId('suggested-figure')).toHaveTextContent('₹32,000');
    expect(screen.getByLabelText('Monthly Salary')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Use this figure' }));

    expect(screen.getByLabelText('Monthly Salary')).toHaveValue('32000');
    expect(fetchCalls).toEqual([
      { url: `/api/hr/recruitment/candidates/${CANDIDATE}/salary-suggestion`, method: 'GET' },
    ]);
    expect(screen.getByText(/Nothing is saved until you press Propose Package/)).toBeInTheDocument();
  });

  it('shows every line of the working', async () => {
    render(<Harness />);
    await screen.findByTestId('suggested-figure');
    expect(screen.getByText('Band floor for Assistant Professor')).toBeInTheDocument();
    expect(screen.getByText('+ ₹2,000')).toBeInTheDocument();
  });

  it('says plainly what is missing and who fixes it; the link only for super admins', async () => {
    payload = RULE_NOT_SET;
    const { unmount } = render(<Harness />);
    const missing = await screen.findByTestId('suggestion-missing');
    expect(missing).toHaveTextContent('The Director has not set an amount for the Mechanical department');
    expect(missing).toHaveTextContent('The Director sets it on Salary suggestion settings.');
    expect(screen.queryByRole('link', { name: 'Open Salary suggestion settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use this figure' })).toBeNull();
    unmount();

    render(<Harness isSuperAdmin />);
    const link = await screen.findByRole('link', { name: 'Open Salary suggestion settings' });
    expect(link).toHaveAttribute('href', '/hr/admin/policies/salary-suggestion');
  });

  it('without salary access: one plain line, no figure, nothing fetched', () => {
    render(<Harness canSeeSalary={false} />);
    expect(screen.getByTestId('suggestion-no-access')).toHaveTextContent(
      'A suggested salary is shown only to people who can see salaries.'
    );
    expect(screen.queryByTestId('suggested-figure')).toBeNull();
    expect(fetchCalls).toEqual([]);
  });
});
