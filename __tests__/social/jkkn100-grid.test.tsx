// @vitest-environment jsdom
/**
 * JKKN100 scoreboard grid: YES shows minutes, NO, COLLAB and UNKNOWN look
 * different, UNKNOWN carries its reason in the title, each column head carries
 * the date its tag fixes, a day timed from the earliest post instead of the
 * chosen anchor says so on its face, an off-date post is flagged in the cell,
 * the runner name (or "Nobody named yet") shows per account, and the day
 * totals row adds up.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Jkkn100Grid } from '@/app/(routes)/admission/social/jkkn100/_components/jkkn100-grid';
import { buildJkkn100Scoreboard, type Jkkn100Account } from '@/lib/services/social/jkkn100-scoreboard';

afterEach(cleanup);

const T0 = '2026-10-09T04:30:00.000Z';
const plus = (m: number) => new Date(Date.parse(T0) + m * 60_000).toISOString();
const base = { status: 'active', metrics_source: 'graph', last_polled_at: '2026-12-01T00:00:00Z' };

const accounts: Jkkn100Account[] = [
  { id: 'a1', username: 'main_page', ...base, connected_by: 'u1', connected_by_name: 'Priya R' },
  { id: 'a2', username: 'dept_a', ...base },
  { id: 'a3', username: 'quiet_page', ...base },
  { id: 'a4', username: 'public_one', ...base, metrics_source: 'business_discovery' },
];

function board() {
  return buildJkkn100Scoreboard(accounts, [
    { id: 'p1', account_id: 'a1', caption: '#JKKN100Day40', posted_at: T0 },
    { id: 'p2', account_id: 'a2', caption: '#JKKN100Day40', posted_at: plus(14) },
  ]);
}

function rowOf(name: string) {
  return document.querySelector(`tr[data-account="${name}"]`) as HTMLElement;
}

describe('Jkkn100Grid', () => {
  it('shows YES with minutes, NO and UNKNOWN as different cells', () => {
    render(<Jkkn100Grid board={board()} />);
    expect(screen.getByText('Day 40')).toBeInTheDocument();

    const yes = rowOf('dept_a').querySelector('[data-status="yes"]')!;
    expect(yes).toHaveTextContent('Yes');
    expect(yes).toHaveTextContent('+14m');

    const no = rowOf('quiet_page').querySelector('[data-status="no"]')!;
    expect(no).toHaveTextContent('No');

    const unknown = rowOf('public_one').querySelector('[data-status="unknown"]')!;
    expect(unknown).toHaveTextContent('Unknown');
    expect(unknown.getAttribute('title')).toMatch(/Public-only account/);
    expect(unknown.className).not.toEqual(no.className);
  });

  it('names the runner, or says nobody is named yet', () => {
    render(<Jkkn100Grid board={board()} />);
    expect(within(rowOf('main_page')).getByText('Priya R')).toBeInTheDocument();
    expect(within(rowOf('dept_a')).getByText('Nobody named yet')).toBeInTheDocument();
  });

  it('adds up the day totals row, collab included', () => {
    render(<Jkkn100Grid board={board()} />);
    const totals = document.querySelector('tr[data-row="day-totals"]') as HTMLElement;
    expect(totals).toHaveTextContent('2 yes');
    expect(totals).toHaveTextContent('1 no');
    expect(totals).toHaveTextContent('0 collab');
    expect(totals).toHaveTextContent('1 ?');
  });

  it('puts the date the tag fixes in the column head', () => {
    render(<Jkkn100Grid board={board()} />);
    const head = document.querySelector('th[data-day="40"]') as HTMLElement;
    expect(head).toHaveTextContent('9 Oct');
    expect(head.getAttribute('title')).toContain('2026-10-09');
  });

  it('runs Day 40 first, the earliest date', () => {
    const b = buildJkkn100Scoreboard(accounts, [
      { id: 'p1', account_id: 'a1', caption: '#JKKN100Day40', posted_at: T0 },
      { id: 'p2', account_id: 'a1', caption: '#JKKN100Day38', posted_at: plus(2 * 1440) },
    ]);
    render(<Jkkn100Grid board={b} />);
    const heads = Array.from(document.querySelectorAll('th[data-day]')).map((h) =>
      h.getAttribute('data-day')
    );
    expect(heads).toEqual(['40', '38']);
  });

  it('says on the column head when a day fell back to the earliest post', () => {
    const b = buildJkkn100Scoreboard(
      accounts,
      [
        { id: 'p1', account_id: 'a1', caption: '#JKKN100Day40', posted_at: T0 },
        // Day 39: the chosen anchor account posted nothing.
        { id: 'p2', account_id: 'a2', caption: '#JKKN100Day39', posted_at: plus(1440) },
      ],
      { anchorUsername: 'main_page' }
    );
    render(<Jkkn100Grid board={b} />);
    const day40 = document.querySelector('th[data-day="40"]') as HTMLElement;
    const day39 = document.querySelector('th[data-day="39"]') as HTMLElement;
    expect(day40.querySelector('[data-badge="earliest-post"]')).toBeNull();
    expect(day39.querySelector('[data-badge="earliest-post"]')).toHaveTextContent(
      'timed from earliest post'
    );
  });

  it('shows no fallback badge when no anchor account was asked for', () => {
    render(<Jkkn100Grid board={board()} />);
    expect(document.querySelector('[data-badge="earliest-post"]')).toBeNull();
  });

  it('shows a COLLAB cell, and says when the partner posted its own copy too', () => {
    const b = buildJkkn100Scoreboard(
      accounts,
      [
        { id: 'p1', account_id: 'a1', caption: '#JKKN100Day40', posted_at: T0 },
        { id: 'p2', account_id: 'a2', caption: '#JKKN100Day40', posted_at: plus(14) },
      ],
      { collab: { 40: ['quiet_page', 'dept_a'] } }
    );
    render(<Jkkn100Grid board={b} />);

    const plain = rowOf('quiet_page').querySelector('[data-status="collab"]')!;
    expect(plain).toHaveTextContent('Collab');
    expect(plain).not.toHaveTextContent('own');
    expect(plain.getAttribute('title')).toContain('no copy of its own is expected');
    expect(rowOf('quiet_page').querySelector('[data-status="no"]')).toBeNull();

    const alsoPosted = rowOf('dept_a').querySelector('[data-status="collab"]')!;
    expect(alsoPosted).toHaveTextContent('+ own +14m');
    expect(alsoPosted.getAttribute('title')).toContain('uploaded one anyway');

    const totals = document.querySelector('tr[data-row="day-totals"]') as HTMLElement;
    expect(totals).toHaveTextContent('2 collab');
  });

  it('flags a post that went out on another date, in the cell and its title', () => {
    const b = buildJkkn100Scoreboard(accounts, [
      { id: 'p1', account_id: 'a1', caption: '#JKKN100Day40', posted_at: T0 },
      // 20:00 UTC on 9 Oct is 01:30 on 10 Oct in India.
      { id: 'p2', account_id: 'a2', caption: '#JKKN100Day40', posted_at: '2026-10-09T20:00:00.000Z' },
    ]);
    render(<Jkkn100Grid board={b} />);
    const cell = rowOf('dept_a').querySelector('[data-status="yes"]')!;
    expect(cell).toHaveTextContent('10 Oct');
    expect(cell.getAttribute('title')).toContain('It went out on 10 Oct');
  });
});
