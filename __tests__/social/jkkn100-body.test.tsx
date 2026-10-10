// @vitest-environment jsdom
/**
 * JKKN100 scoreboard page body.
 *
 * Pins:
 *   - no accounts came back -> "No Instagram accounts are visible to your
 *     role", which is a different sentence from "no tagged posts yet"
 *   - accounts but no tagged day -> the no-tagged-posts sentence
 *   - no ?anchor in the link -> the fetch asks for @jkkninstitutions
 *   - ?anchor= sent empty in the link -> the fetch asks for no anchor
 *   - ?collab= in the link is read, shown and passed on to the fetch
 *   - the link is rewritten so the board can be shared as it stands
 *   - a warning from the route is shown, not swallowed
 *   - the caption-at-upload rule is on the page
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let search = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const { Jkkn100ScoreboardBody, SCOREBOARD_FETCH_TIMEOUT_MS } = await import(
  '@/app/(routes)/admission/social/jkkn100/_components/jkkn100-scoreboard-body'
);

const asked: string[] = [];
let payload: Record<string, unknown> = {};

function board(over: Record<string, unknown> = {}) {
  return {
    days: [],
    accounts: [],
    anchor_username: null,
    collab: {},
    warnings: [],
    tagged_post_count: 0,
    since: '2026-10-01',
    generated_at: '2026-10-13T06:30:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  search = '';
  asked.length = 0;
  payload = board();
  window.history.replaceState(null, '', '/admission/social/jkkn100');
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      asked.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: payload }),
      } as Response);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const lastQuery = () => new URLSearchParams(asked[asked.length - 1]!.split('?')[1] ?? '');

describe('Jkkn100ScoreboardBody', () => {
  it('shows an error instead of loading for ever when the request never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
      )
    );
    render(<Jkkn100ScoreboardBody />);
    await vi.advanceTimersByTimeAsync(SCOREBOARD_FETCH_TIMEOUT_MS + 1);
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByText(/took too long to load/i)).toBeInTheDocument());
  });

  it('says no accounts are visible when none came back', async () => {
    payload = board({ accounts: [], days: [] });
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() =>
      expect(screen.getByText(/No Instagram accounts are visible to your role/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/No post carrying a #JKKN100Day tag/i)).toBeNull();
  });

  it('says no tagged posts yet when there are accounts but no day', async () => {
    payload = board({
      accounts: [
        {
          account_id: 'a1',
          username: 'dept_a',
          institution_id: null,
          department_id: null,
          status: 'active',
          metrics_source: 'graph',
          last_polled_at: null,
          runner_id: null,
          runner_name: null,
          cells: {},
          totals: { yes: 0, no: 0, unknown: 0, collab: 0, within_hour: 0, median_minutes: null },
        },
      ],
      days: [],
    });
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() =>
      expect(screen.getByText(/No post carrying a #JKKN100Day tag/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/No Instagram accounts are visible/i)).toBeNull();
  });

  it('asks for @jkkninstitutions when the link names no anchor', async () => {
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(lastQuery().get('anchor')).toBe('jkkninstitutions');
  });

  it('asks for no anchor when the link sends an empty one', async () => {
    search = 'anchor=';
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(lastQuery().get('anchor')).toBe('');
  });

  it('takes the anchor and the since date from the link', async () => {
    search = 'anchor=dept_a&since=2026-10-05';
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(lastQuery().get('anchor')).toBe('dept_a');
    expect(lastQuery().get('since')).toBe('2026-10-05');
  });

  it('reads the collab lists out of the link, shows them and passes them on', async () => {
    search = 'collab=40:@JKKN_Dental,jkkn_pharmacy';
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(lastQuery().get('collab')).toBe('40:jkkn_dental,jkkn_pharmacy');
    const summary = document.querySelector('[data-collab-summary]')!;
    expect(summary).toHaveTextContent('Day 40');
    expect(summary).toHaveTextContent('@jkkn_dental');
    expect(summary).toHaveTextContent('@jkkn_pharmacy');
  });

  it('rewrites the link so the board can be shared as it stands', async () => {
    search = 'collab=40:jkkn_dental';
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() => expect(asked).toHaveLength(1));
    const url = new URL(window.location.href);
    expect(url.searchParams.get('anchor')).toBe('jkkninstitutions');
    expect(url.searchParams.get('since')).toBe('2026-10-01');
    expect(url.searchParams.get('collab')).toBe('40:jkkn_dental');
  });

  it('says what it could not use in the link, instead of dropping it in silence', async () => {
    // The fetch only carries the tidied-up lists, so the route never sees this
    // part and cannot warn about it. The page has to.
    search = 'collab=nonsense;99:dept_a;40:dept_b';
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() => expect(asked).toHaveLength(1));
    const problems = document.querySelector('[data-collab-problems]')!;
    expect(problems).toHaveTextContent('nonsense');
    expect(problems).toHaveTextContent('day number between 1 and 40');
    // The good part still went through.
    expect(lastQuery().get('collab')).toBe('40:dept_b');
  });

  it('says no collab partners are set when the link carries none', async () => {
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(document.querySelector('[data-collab-summary]')).toHaveTextContent(
      /No collab partners set yet/i
    );
  });

  it('shows a warning the route sent back', async () => {
    payload = board({ warnings: ['Day 40: @nobody_here is not one of the accounts on this board.'] });
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() => expect(screen.getByText(/@nobody_here/)).toBeInTheDocument());
  });

  it('tells the reader the tag has to be in the caption at upload', async () => {
    render(<Jkkn100ScoreboardBody />);
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(screen.getByText(/when the reel is uploaded/i)).toBeInTheDocument();
    expect(screen.getByText(/a tag added afterwards is never seen/i)).toBeInTheDocument();
  });
});
