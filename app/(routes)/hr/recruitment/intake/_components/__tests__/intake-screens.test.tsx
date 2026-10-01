// @vitest-environment jsdom
//
// HR intake helper — the screens HR uses. The API (lane A) is mocked at fetch().

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { IntakeBatch, IntakeOpenJob, IntakeRow } from '@/types/hr-intake';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CandidateCard } from '../candidate-card';
import { BatchReview } from '../batch-review';
import { BatchList } from '../batch-list';
import { RulesList } from '../rules-list';
import { getIntakeBatch } from '@/lib/hr/intake/api-client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const JOBS: IntakeOpenJob[] = [
  { id: 'job-1', title: 'Assistant Manager – Accounts', institution_id: 'i1', institution_name: 'Arts & Science', department_name: 'Accounts' },
  { id: 'job-2', title: 'Hostel Warden', institution_id: 'i2', institution_name: 'Engineering', department_name: 'Hostel' },
];

const BATCH: IntakeBatch = {
  id: 'b1',
  source: 'cvviz_export',
  file_name: 'cvviz-september.csv',
  created_by: 'u1',
  created_by_name: 'Priya S',
  created_at: '2026-09-30T10:00:00Z',
  status: 'ready',
  row_count: 3,
  decided_count: 0,
  applied_count: 0,
};

function makeRow(over: Partial<IntakeRow> & { id: string; row_index: number }): IntakeRow {
  return {
    batch_id: 'b1',
    candidate: {
      first_name: 'Anitha',
      last_name: 'K',
      email: 'anitha@example.com',
      phone: null,
      phone_issue: 'Looks like a date (25/07/85)',
      qualification: 'M.Com',
      current_job_title: null,
      current_company: null,
      cities: [],
      linkedin_url: null,
      cvviz_profile_url: 'https://app.cvviz.com/candidates/123',
      cvviz_job_title: 'Accounts Assistant',
      cvviz_job_code: 'AC-1',
      applied_at: '2026-09-20T00:00:00Z',
    },
    resume: {
      file_name: 'anitha.pdf',
      matched_upload: true,
      storage_path: 'intake/b1/anitha.pdf',
      extract: {
        qualification: 'M.Com',
        subject: 'Accountancy',
        experience_years: 4,
        current_role: 'Accountant',
        summary: 'Four years keeping books for a textile firm.',
      },
    },
    duplicate: { kind: 'none', ref_id: null, note: null },
    proposal: {
      action: 'file_under_job',
      job_id: 'job-1',
      job_title: 'Assistant Manager – Accounts',
      institution_id: 'i1',
      confidence: 'high',
      reasons: ['CVViZ job title matches a learned rule', 'Resume shows an M.Com'],
      rule_id: 'rule-1',
      rule_author_name: 'Kavitha R',
    },
    decision: null,
    applied: null,
    ...over,
  };
}

const ROW1 = makeRow({ id: 'r1', row_index: 1 });
const ROW2 = makeRow({
  id: 'r2',
  row_index: 2,
  candidate: { ...ROW1.candidate, first_name: 'Bala', phone_issue: null },
  proposal: { ...ROW1.proposal, confidence: 'medium', rule_id: null, rule_author_name: null },
  duplicate: { kind: 'same_file', ref_id: 'r1', note: null },
});
const ROW3 = makeRow({
  id: 'r3',
  row_index: 3,
  candidate: { ...ROW1.candidate, first_name: 'Chitra' },
});

// ---------------------------------------------------------------------------
// fetch mock
// ---------------------------------------------------------------------------

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
  Promise.resolve(handler(String(input), init)),
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function callsTo(pathEnd: string, method = 'POST') {
  return fetchMock.mock.calls.filter(
    ([url, init]) => String(url).endsWith(pathEnd) && (init?.method ?? 'GET') === method,
  );
}

function renderWithQuery(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe('CandidateCard', () => {
  it('shows the proposal, its reasons, the confidence and who taught the rule', () => {
    render(
      <CandidateCard row={ROW1} cardNumber={1} openJobs={JOBS} duplicateNote={null} onDecide={vi.fn()} />,
    );
    expect(screen.getByText('File under: Assistant Manager – Accounts, Arts & Science')).toBeTruthy();
    expect(screen.getByText('High confidence')).toBeTruthy();
    expect(screen.getByText('CVViZ job title matches a learned rule')).toBeTruthy();
    expect(screen.getByText('Resume shows an M.Com')).toBeTruthy();
    expect(screen.getByText('Learned from Kavitha R')).toBeTruthy();
    expect(screen.getByText('Phone problem: Looks like a date (25/07/85)')).toBeTruthy();
    expect(screen.getByText(/Resume found/)).toBeTruthy();
    expect(screen.getByText('Four years keeping books for a textile firm.')).toBeTruthy();
    const link = screen.getByRole('link', { name: /Open CVViZ profile/ });
    expect(link.getAttribute('href')).toBe('https://app.cvviz.com/candidates/123');
  });

  it('drops a non-http profile link instead of rendering it', () => {
    const row = makeRow({ id: 'x', row_index: 1 });
    row.candidate.cvviz_profile_url = 'javascript:alert(1)';
    render(<CandidateCard row={row} cardNumber={1} openJobs={JOBS} duplicateNote={null} onDecide={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /Open CVViZ profile/ })).toBeNull();
    expect(screen.getByText('No CVViZ profile link')).toBeTruthy();
  });

  it('Accept sends the proposal exactly once, even on a double tap', async () => {
    let release: () => void = () => {};
    const onDecide = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<CandidateCard row={ROW1} cardNumber={1} openJobs={JOBS} duplicateNote={null} onDecide={onDecide} />);
    const accept = screen.getByRole('button', { name: 'Accept' });
    fireEvent.click(accept);
    fireEvent.click(accept);
    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide).toHaveBeenCalledWith({ action: 'file_under_job', job_id: 'job-1' });
    release();
    await waitFor(() => expect((accept as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('BatchReview', () => {
  function serve(rows: IntakeRow[], extra?: Handler) {
    handler = (url, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.endsWith('/batches/b1')) {
        return json({ batch: BATCH, rows, open_jobs: JOBS });
      }
      const r = extra?.(url, init);
      if (r) return r;
      return json({ error: `unexpected ${method} ${url}` }, 500);
    };
  }

  it('Accept on a card posts one decision for that row', async () => {
    serve([ROW1, ROW2], (url, init) => {
      if (url.endsWith('/rows/r1/decide')) {
        const body = JSON.parse(String(init?.body));
        return json({
          row: { ...ROW1, decision: { ...body, decided_by: 'u1', decided_by_name: 'Priya S', decided_at: '2026-10-01T00:00:00Z', corrected: false } },
        });
      }
      return undefined as unknown as Response;
    });
    renderWithQuery(<BatchReview batchId="b1" />);
    const card = await screen.findByRole('article', { name: /Candidate 1: Anitha K/ });
    fireEvent.click(within(card).getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(callsTo('/rows/r1/decide')).toHaveLength(1));
    expect(JSON.parse(String(callsTo('/rows/r1/decide')[0][1]?.body))).toEqual({
      action: 'file_under_job',
      job_id: 'job-1',
    });
    expect(await within(card).findByText(/Decided by Priya S/)).toBeTruthy();
  });

  it('Change job says it will be remembered and credited, then posts the chosen job', async () => {
    serve([ROW1], (url, init) => {
      if (url.endsWith('/rows/r1/decide')) {
        const body = JSON.parse(String(init?.body));
        return json({ row: { ...ROW1, decision: { ...body, decided_by: 'u1', decided_by_name: 'Priya S', decided_at: '2026-10-01T00:00:00Z', corrected: true } } });
      }
      return undefined as unknown as Response;
    });
    renderWithQuery(<BatchReview batchId="b1" />);
    const card = await screen.findByRole('article', { name: /Candidate 1/ });
    fireEvent.click(within(card).getByRole('button', { name: 'Change job' }));

    expect(within(card).getByText(/This will be remembered for next time and credited to you/)).toBeTruthy();
    expect(within(card).getByText(/Accounts Assistant/, { selector: 'p' })).toBeTruthy();

    fireEvent.change(within(card).getByLabelText('Search open jobs'), { target: { value: 'warden' } });
    expect(within(card).queryByRole('button', { name: /Assistant Manager/ })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: /Hostel Warden/ }));

    await waitFor(() => expect(callsTo('/rows/r1/decide')).toHaveLength(1));
    expect(JSON.parse(String(callsTo('/rows/r1/decide')[0][1]?.body))).toEqual({
      action: 'file_under_job',
      job_id: 'job-2',
    });
  });

  it('Accept all high-confidence shows how many and posts once', async () => {
    const decidedHigh = makeRow({
      id: 'r4',
      row_index: 4,
      decision: { action: 'file_under_job', job_id: 'job-1', decided_by: 'u1', decided_by_name: 'Priya S', decided_at: '2026-10-01T00:00:00Z', corrected: false },
    });
    // r1 + r3 are undecided HIGH; r2 is MEDIUM; r4 is already decided.
    serve([ROW1, ROW2, ROW3, decidedHigh], (url) =>
      url.endsWith('/batches/b1/accept-high') ? json({ decided: 2 }) : (undefined as unknown as Response),
    );
    renderWithQuery(<BatchReview batchId="b1" />);
    const btn = await screen.findByRole('button', { name: 'Accept all high-confidence (2)' });
    fireEvent.click(btn);
    await waitFor(() => expect(callsTo('/batches/b1/accept-high')).toHaveLength(1));
  });

  it('filing reports every row on its own — one filed, one refused with its reason', async () => {
    const decision = { action: 'file_under_job' as const, job_id: 'job-1', decided_by: 'u1', decided_by_name: 'Priya S', decided_at: '2026-10-01T00:00:00Z', corrected: false };
    const a = { ...ROW1, decision };
    const b = { ...ROW3, decision };
    // ROW2 is undecided: it must not be sent.
    serve([a, ROW2, b], (url) =>
      url.endsWith('/batches/b1/apply')
        ? json({
            results: [
              { row_id: 'r1', ok: true, application_id: 'app-1', error: null },
              { row_id: 'r3', ok: false, application_id: null, error: 'This job closed yesterday' },
            ],
          })
        : (undefined as unknown as Response),
    );
    renderWithQuery(<BatchReview batchId="b1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'File decided candidates into MyJKKN (2)' }));

    const results = await screen.findByRole('region', { name: 'Filing results' });
    expect(within(results).getByText(/Filed 1 of 2\./)).toBeTruthy();
    expect(within(results).getByText(/Chitra K \(card 3\): This job closed yesterday/)).toBeTruthy();
    expect(JSON.parse(String(callsTo('/batches/b1/apply')[0][1]?.body))).toEqual({ row_ids: ['r1', 'r3'] });
  });

  it('numbers a same-upload duplicate by its card', async () => {
    serve([ROW1, ROW2]);
    renderWithQuery(<BatchReview batchId="b1" />);
    const card2 = await screen.findByRole('article', { name: /Candidate 2: Bala K/ });
    expect(within(card2).getByText('Same person as card 1 in this upload')).toBeTruthy();
  });

  it('a failed load is an error with the reason, never an empty upload', async () => {
    handler = () => json({ error: 'The intake service is not ready' }, 503);
    renderWithQuery(<BatchReview batchId="b1" />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The intake service is not ready')).toBeTruthy();
    expect(screen.queryByText('This upload has no candidates')).toBeNull();
  });
});

describe('error state is not the empty state', () => {
  it('BatchList: a server error shows the reason and a retry, not "No uploads yet"', async () => {
    handler = () => json({ error: 'Could not read uploads' }, 500);
    renderWithQuery(<BatchList />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not read uploads')).toBeTruthy();
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('No uploads yet')).toBeNull();
  });

  it('BatchList: a real empty list says so, with no alert', async () => {
    handler = () => json({ batches: [] });
    renderWithQuery(<BatchList />);
    expect(await screen.findByText('No uploads yet')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('api client: a reply missing its list is an error, not an empty list', async () => {
    handler = () => json({ batch: BATCH, open_jobs: [] });
    await expect(getIntakeBatch('b1')).rejects.toThrow(/not in the shape this screen expects/);
  });

  it('api client: a non-JSON 404 (route not deployed yet) is a plain error', async () => {
    handler = () => new Response('<html>Not Found</html>', { status: 404 });
    await expect(getIntakeBatch('b1')).rejects.toThrow(/error 404/);
  });
});

describe('RulesList', () => {
  it('shows who taught each rule and deletes only after the in-page confirm', async () => {
    handler = (url, init) => {
      if ((init?.method ?? 'GET') === 'DELETE') return json({ ok: true });
      return json({
        rules: [
          {
            id: 'rule-1',
            cvviz_job_title_norm: 'accounts assistant',
            job_id: 'job-1',
            job_title: 'Assistant Manager – Accounts',
            created_by: 'u2',
            created_by_name: 'Kavitha R',
            created_at: '2026-09-01T00:00:00Z',
            times_used: 7,
          },
        ],
      });
    };
    renderWithQuery(<RulesList />);
    expect(await screen.findByText(/Learned from Kavitha R/)).toBeTruthy();
    expect(screen.getByText(/used 7 times/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Delete rule/ }));
    expect(callsTo('/rules/rule-1', 'DELETE')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(callsTo('/rules/rule-1', 'DELETE')).toHaveLength(1));
  });
});
