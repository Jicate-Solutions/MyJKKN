/**
 * JKKN100 reel countdown scoreboard — the pure rules.
 *
 * Pins:
 *   - tag parsing: Day40 / Day01 / Day4 / Day04 count; Day41 / Day400 / Day00
 *     / Day0 do not; first valid tag in a caption wins; case-insensitive
 *   - anchor: chosen anchor account's earliest tagged post when it posted that
 *     day, else the earliest tagged post of the day from any account — and the
 *     day says which; a duplicated anchor username takes the earliest of them
 *   - dates: the tag counts days left to 18 Nov 2026, so Day40 = 9 Oct 2026 and
 *     Day01 = 17 Nov 2026; a post on another date still counts and is flagged
 *   - YES: minutes after the anchor (negative before it, 0 for the anchor)
 *   - COLLAB: on that day's hand-set list — beats NO and UNKNOWN, and says so
 *     when the partner uploaded its own copy as well
 *   - UNKNOWN: business_discovery, no reading method, disconnected, never
 *     polled, polled before anchor + 60 min — each with its reason; a
 *     public-only account is never NO; instagram_login reads like graph
 *   - NO: readable, connected, polled after the hour closed, no tagged post
 *   - evidence wins: a tagged post on a public-only account is YES
 *   - Day 40 first (chronological, because the tag counts down)
 *   - per-account and per-day totals, median minutes, within-hour count
 *   - CSV carries the same cells, the dates and the runner fallback
 */
import { describe, it, expect } from 'vitest';
import {
  buildJkkn100Scoreboard,
  formatJkkn100Collab,
  jkkn100DayDate,
  jkkn100IstDate,
  jkkn100ScoreboardCsv,
  parseJkkn100Collab,
  parseJkkn100Day,
  JKKN100_DEFAULT_ANCHOR,
  type Jkkn100Account,
  type Jkkn100Post,
} from '@/lib/services/social/jkkn100-scoreboard';

const T0 = '2026-10-09T04:30:00.000Z'; // Day40 anchor
const plus = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();
const LATE_POLL = '2026-12-31T00:00:00.000Z';

function acct(id: string, over: Partial<Jkkn100Account> = {}): Jkkn100Account {
  return {
    id,
    username: id,
    status: 'active',
    metrics_source: 'graph',
    last_polled_at: LATE_POLL,
    connected_by: null,
    connected_by_name: null,
    ...over,
  };
}

let seq = 0;
function post(accountId: string, caption: string, postedAt: string): Jkkn100Post {
  seq += 1;
  return { id: `p${String(seq).padStart(4, '0')}`, account_id: accountId, caption, posted_at: postedAt };
}

describe('parseJkkn100Day', () => {
  it.each([
    ['Founders Day reel #JKKN100Day40', 40],
    ['#JKKN100Day01 last one', 1],
    ['#JKKN100Day4', 4],
    ['#JKKN100Day04', 4],
    ['#jkkn100day39 lower case', 39],
    ['#JKKN100Day10, with a comma', 10],
  ])('reads %s as day %s', (caption, day) => {
    expect(parseJkkn100Day(caption)).toBe(day);
  });

  it.each([
    ['#JKKN100Day41'],
    ['#JKKN100Day400'],
    ['#JKKN100Day00'],
    ['#JKKN100Day0'],
    ['#JKKN100Day'],
    ['#JKKN100'],
    [''],
  ])('rejects %s', (caption) => {
    expect(parseJkkn100Day(caption)).toBeNull();
  });

  it('rejects a null caption', () => {
    expect(parseJkkn100Day(null)).toBeNull();
  });

  it('takes the first valid tag, skipping an out-of-range one', () => {
    expect(parseJkkn100Day('#JKKN100Day41 oops #JKKN100Day38 #JKKN100Day37')).toBe(38);
  });
});

describe('jkkn100DayDate', () => {
  it.each([
    [40, '2026-10-09'],
    [39, '2026-10-10'],
    [18, '2026-10-31'],
    [17, '2026-11-01'],
    [2, '2026-11-16'],
    [1, '2026-11-17'],
  ])('puts Day %s on %s', (day, date) => {
    expect(jkkn100DayDate(day)).toBe(date);
  });

  it('counts back from Founders Day, so every day is one apart', () => {
    const dates = Array.from({ length: 40 }, (_, i) => jkkn100DayDate(40 - i));
    expect(new Set(dates).size).toBe(40);
    expect(dates[0]).toBe('2026-10-09');
    expect(dates[39]).toBe('2026-11-17');
  });
});

describe('jkkn100IstDate', () => {
  it('reads an instant on the India clock, not UTC', () => {
    // 20:00 UTC is already the next day in India.
    expect(jkkn100IstDate('2026-10-09T20:00:00.000Z')).toBe('2026-10-10');
    expect(jkkn100IstDate('2026-10-09T18:29:00.000Z')).toBe('2026-10-09');
    expect(jkkn100IstDate('2026-10-09T18:31:00.000Z')).toBe('2026-10-10');
  });

  it('gives null for nothing and for rubbish', () => {
    expect(jkkn100IstDate(null)).toBeNull();
    expect(jkkn100IstDate('not a date')).toBeNull();
  });
});

describe('parseJkkn100Collab', () => {
  it('reads day numbers and usernames, lower case and deduplicated', () => {
    const { byDay, warnings } = parseJkkn100Collab('40:@JKKN_Dental,jkkn_pharmacy;39:Jkkn_Nursing');
    expect(byDay).toEqual({
      40: ['jkkn_dental', 'jkkn_pharmacy'],
      39: ['jkkn_nursing'],
    });
    expect(warnings).toEqual([]);
  });

  it('merges two parts naming the same day and drops a repeat', () => {
    const { byDay } = parseJkkn100Collab('40:a_one;40:a_one,b_two');
    expect(byDay).toEqual({ 40: ['a_one', 'b_two'] });
  });

  it('tolerates spaces, a trailing semicolon and a "Day" prefix', () => {
    const { byDay, warnings } = parseJkkn100Collab(' Day 40 : a_one , b_two ; ; ');
    expect(byDay).toEqual({ 40: ['a_one', 'b_two'] });
    expect(warnings).toEqual([]);
  });

  it('gives an empty result for nothing at all', () => {
    for (const raw of [null, undefined, '', '   ']) {
      expect(parseJkkn100Collab(raw)).toEqual({ byDay: {}, warnings: [] });
    }
  });

  it('warns about a part with no colon and keeps the rest', () => {
    const { byDay, warnings } = parseJkkn100Collab('nonsense;40:a_one');
    expect(byDay).toEqual({ 40: ['a_one'] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"nonsense"');
  });

  it.each([['0:a_one'], ['41:a_one'], ['x:a_one'], ['400:a_one']])(
    'warns about the day in %s and sets nothing',
    (raw) => {
      const { byDay, warnings } = parseJkkn100Collab(raw);
      expect(byDay).toEqual({});
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/day number between 1 and 40/);
    }
  );

  it('warns about a username Instagram would not allow, and keeps the good one', () => {
    const { byDay, warnings } = parseJkkn100Collab('40:good_one,bad handle!,other_one');
    expect(byDay).toEqual({ 40: ['good_one', 'other_one'] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"bad handle!"');
  });

  it('sets nothing for a day whose only username is unusable', () => {
    const { byDay, warnings } = parseJkkn100Collab('40:!!!');
    expect(byDay).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  it('round-trips through the link text, highest day first', () => {
    const raw = '39:jkkn_nursing;40:jkkn_dental,jkkn_pharmacy';
    const { byDay } = parseJkkn100Collab(raw);
    const text = formatJkkn100Collab(byDay);
    expect(text).toBe('40:jkkn_dental,jkkn_pharmacy;39:jkkn_nursing');
    expect(parseJkkn100Collab(text).byDay).toEqual(byDay);
  });

  it('writes nothing for empty lists', () => {
    expect(formatJkkn100Collab({})).toBe('');
    expect(formatJkkn100Collab({ 40: [] })).toBe('');
  });
});

describe('buildJkkn100Scoreboard', () => {
  it('times each account against the earliest post of the day when no anchor is chosen', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('dept_a'), acct('dept_b')],
      [
        post('dept_a', '#JKKN100Day40', plus(T0, 12)),
        post('main_page', 'Launch! #JKKN100Day40', T0),
        post('dept_b', '#JKKN100Day40', plus(T0, 75)),
      ]
    );
    expect(board.days).toHaveLength(1);
    const day = board.days[0]!;
    expect(day.anchor_username).toBe('main_page');
    expect(day.anchor_source).toBe('earliest_any');
    const byName = Object.fromEntries(board.accounts.map((r) => [r.username, r.cells[40]!]));
    expect(byName.main_page).toMatchObject({ status: 'yes', minutes_after_anchor: 0 });
    expect(byName.dept_a).toMatchObject({ status: 'yes', minutes_after_anchor: 12 });
    expect(byName.dept_b).toMatchObject({ status: 'yes', minutes_after_anchor: 75 });
    expect(day.totals).toMatchObject({ yes: 3, no: 0, unknown: 0, within_hour: 2, median_minutes: 12 });
  });

  it('uses the chosen anchor account, so an earlier post elsewhere shows negative minutes', () => {
    const board = buildJkkn100Scoreboard(
      [acct('mohan_reels'), acct('early_bird')],
      [
        post('early_bird', '#JKKN100Day40', plus(T0, -5)),
        post('mohan_reels', '#JKKN100Day40', T0),
      ],
      { anchorUsername: '@Mohan_Reels' }
    );
    const day = board.days[0]!;
    expect(day.anchor_source).toBe('anchor_account');
    expect(day.anchor_username).toBe('mohan_reels');
    expect(day.anchor_posted_at).toBe(T0);
    const early = board.accounts.find((r) => r.username === 'early_bird')!;
    expect(early.cells[40]).toMatchObject({ status: 'yes', minutes_after_anchor: -5 });
    const anchor = board.accounts.find((r) => r.username === 'mohan_reels')!;
    expect(anchor.cells[40]).toMatchObject({ status: 'yes', minutes_after_anchor: 0 });
  });

  it('falls back to the earliest post of the day when the chosen anchor did not post, and says so', () => {
    const board = buildJkkn100Scoreboard(
      [acct('mohan_reels'), acct('dept_a'), acct('dept_b')],
      [
        post('dept_b', '#JKKN100Day39', plus(T0, 1440 + 20)),
        post('dept_a', '#JKKN100Day39', plus(T0, 1440 + 3)),
      ],
      { anchorUsername: 'mohan_reels' }
    );
    const day = board.days[0]!;
    expect(day.anchor_source).toBe('earliest_any');
    expect(day.anchor_username).toBe('dept_a');
    const b = board.accounts.find((r) => r.username === 'dept_b')!;
    expect(b.cells[39]).toMatchObject({ status: 'yes', minutes_after_anchor: 17 });
  });

  it('uses the earliest of several tagged posts from one account', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('dept_a')],
      [
        post('main_page', '#JKKN100Day40', T0),
        post('dept_a', '#JKKN100Day40 again', plus(T0, 50)),
        post('dept_a', '#JKKN100Day40', plus(T0, 20)),
      ]
    );
    const a = board.accounts.find((r) => r.username === 'dept_a')!;
    expect(a.cells[40]!.minutes_after_anchor).toBe(20);
  });

  it('reports a public-only account as UNKNOWN, never NO', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('public_one', { metrics_source: 'business_discovery' })],
      [post('main_page', '#JKKN100Day40', T0)]
    );
    const cell = board.accounts.find((r) => r.username === 'public_one')!.cells[40]!;
    expect(cell).toMatchObject({ status: 'unknown', reason: 'public_only', minutes_after_anchor: null });
  });

  it('reports a disconnected account as UNKNOWN', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('gone', { status: 'disconnected' })],
      [post('main_page', '#JKKN100Day40', T0)]
    );
    const cell = board.accounts.find((r) => r.username === 'gone')!.cells[40]!;
    expect(cell).toMatchObject({ status: 'unknown', reason: 'disconnected' });
  });

  it('reports an account never polled as UNKNOWN', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('never', { last_polled_at: null })],
      [post('main_page', '#JKKN100Day40', T0)]
    );
    const cell = board.accounts.find((r) => r.username === 'never')!.cells[40]!;
    expect(cell).toMatchObject({ status: 'unknown', reason: 'not_polled_since_window' });
  });

  it('reports an account last read before the hour closed as UNKNOWN, and one read after it as NO', () => {
    const board = buildJkkn100Scoreboard(
      [
        acct('main_page'),
        acct('too_soon', { last_polled_at: plus(T0, 59) }),
        acct('just_after', { last_polled_at: plus(T0, 60) }),
      ],
      [post('main_page', '#JKKN100Day40', T0)]
    );
    const by = Object.fromEntries(board.accounts.map((r) => [r.username, r.cells[40]!]));
    expect(by.too_soon).toMatchObject({ status: 'unknown', reason: 'not_polled_since_window' });
    expect(by.just_after).toMatchObject({ status: 'no', reason: null });
  });

  it('counts a tagged post on a public-only account as YES — the post is the evidence', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('public_one', { metrics_source: 'business_discovery', last_polled_at: null })],
      [post('main_page', '#JKKN100Day40', T0), post('public_one', '#JKKN100Day40', plus(T0, 30))]
    );
    const cell = board.accounts.find((r) => r.username === 'public_one')!.cells[40]!;
    expect(cell).toMatchObject({ status: 'yes', minutes_after_anchor: 30 });
  });

  it('lists Day 40 first, which is also the earliest date', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page')],
      [
        post('main_page', '#JKKN100Day40', T0),
        post('main_page', '#JKKN100Day38', plus(T0, 2 * 1440)),
        post('main_page', '#JKKN100Day39', plus(T0, 1440)),
      ]
    );
    expect(board.days.map((d) => d.day)).toEqual([40, 39, 38]);
    expect(board.days[0]!.tag).toBe('#JKKN100Day40');
    expect(board.days.map((d) => d.date)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
  });

  it('takes the earliest tagged post when two account rows share the anchor username', () => {
    const board = buildJkkn100Scoreboard(
      [acct('dup_a', { username: 'jkkninstitutions' }), acct('dup_b', { username: 'jkkninstitutions' })],
      [
        // The later row's post is listed first, so an implementation that takes
        // the first match it walks past would pick the wrong clock.
        post('dup_b', '#JKKN100Day40', plus(T0, 30)),
        post('dup_a', '#JKKN100Day40', T0),
      ],
      { anchorUsername: JKKN100_DEFAULT_ANCHOR }
    );
    const day = board.days[0]!;
    expect(day.anchor_source).toBe('anchor_account');
    expect(day.anchor_posted_at).toBe(T0);
    const later = board.accounts.find((r) => r.account_id === 'dup_b')!;
    expect(later.cells[40]!.minutes_after_anchor).toBe(30);
  });

  it('reads an instagram_login account like a graph one, so it can be NO', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('login_one', { metrics_source: 'instagram_login' })],
      [post('main_page', '#JKKN100Day40', T0)]
    );
    const cell = board.accounts.find((r) => r.username === 'login_one')!.cells[40]!;
    expect(cell).toMatchObject({ status: 'no', reason: null });
  });

  it('says UNKNOWN with no reading method recorded, not "public only"', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('nosource', { metrics_source: null })],
      [post('main_page', '#JKKN100Day40', T0)]
    );
    const cell = board.accounts.find((r) => r.username === 'nosource')!.cells[40]!;
    expect(cell).toMatchObject({ status: 'unknown', reason: 'source_unknown' });
  });

  it('ignores untagged posts, out-of-range tags and posts from accounts it does not hold', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page')],
      [
        post('main_page', 'no tag here', T0),
        post('main_page', '#JKKN100Day41', T0),
        post('stranger', '#JKKN100Day40', T0),
      ]
    );
    expect(board.days).toEqual([]);
    expect(board.tagged_post_count).toBe(0);
    expect(board.accounts[0]!.totals).toMatchObject({ yes: 0, no: 0, unknown: 0, median_minutes: null });
  });

  it('adds up per-account totals across days with a median of YES minutes', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('dept_a'), acct('public_one', { metrics_source: 'business_discovery' })],
      [
        post('main_page', '#JKKN100Day40', T0),
        post('main_page', '#JKKN100Day39', plus(T0, 1440)),
        post('main_page', '#JKKN100Day38', plus(T0, 2880)),
        post('dept_a', '#JKKN100Day40', plus(T0, 10)),
        post('dept_a', '#JKKN100Day38', plus(T0, 2880 + 40)),
      ]
    );
    const a = board.accounts.find((r) => r.username === 'dept_a')!;
    expect(a.totals).toEqual({ yes: 2, no: 1, unknown: 0, collab: 0, within_hour: 2, median_minutes: 25 });
    const p = board.accounts.find((r) => r.username === 'public_one')!;
    expect(p.totals).toEqual({
      yes: 0,
      no: 0,
      unknown: 3,
      collab: 0,
      within_hour: 0,
      median_minutes: null,
    });
    const day39 = board.days.find((d) => d.day === 39)!;
    expect(day39.totals).toMatchObject({ yes: 1, no: 1, unknown: 1 });
  });

  it('carries the runner through to the row', () => {
    const board = buildJkkn100Scoreboard(
      [acct('dept_a', { connected_by: 'u1', connected_by_name: 'Priya R' })],
      []
    );
    expect(board.accounts[0]).toMatchObject({ runner_id: 'u1', runner_name: 'Priya R' });
  });

  it('flags a tagged post whose own India date is not the date the tag gives', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('late_one')],
      [
        post('main_page', '#JKKN100Day40', T0),
        // 20:00 UTC on 9 Oct is 01:30 on 10 Oct in India — a day late.
        post('late_one', '#JKKN100Day40', '2026-10-09T20:00:00.000Z'),
      ]
    );
    expect(board.days[0]!.date).toBe('2026-10-09');
    const onTime = board.accounts.find((r) => r.username === 'main_page')!.cells[40]!;
    expect(onTime.posted_on_date).toBeNull();
    const late = board.accounts.find((r) => r.username === 'late_one')!.cells[40]!;
    // It still counts.
    expect(late.status).toBe('yes');
    expect(late.posted_on_date).toBe('2026-10-10');
  });

  describe('collab', () => {
    it('shows a collab partner as COLLAB, never NO, and counts it apart', () => {
      const board = buildJkkn100Scoreboard(
        [acct('main_page'), acct('partner_one'), acct('quiet_one')],
        [post('main_page', '#JKKN100Day40', T0)],
        { collab: { 40: ['partner_one'] } }
      );
      const partner = board.accounts.find((r) => r.username === 'partner_one')!;
      expect(partner.cells[40]).toMatchObject({
        status: 'collab',
        also_posted: false,
        minutes_after_anchor: null,
        reason: null,
      });
      expect(partner.totals).toMatchObject({ yes: 0, no: 0, unknown: 0, collab: 1 });
      // The account that is not in the collab still reads NO.
      expect(board.accounts.find((r) => r.username === 'quiet_one')!.cells[40]!.status).toBe('no');
      expect(board.days[0]!.totals).toMatchObject({ yes: 1, no: 1, unknown: 0, collab: 1 });
    });

    it('beats UNKNOWN: a public-only collab partner reads COLLAB, not unknown', () => {
      const board = buildJkkn100Scoreboard(
        [acct('main_page'), acct('partner_one', { metrics_source: 'business_discovery' })],
        [post('main_page', '#JKKN100Day40', T0)],
        { collab: { 40: ['partner_one'] } }
      );
      const cell = board.accounts.find((r) => r.username === 'partner_one')!.cells[40]!;
      expect(cell.status).toBe('collab');
      expect(cell.reason).toBeNull();
    });

    it('says so when a collab partner uploaded its own copy as well', () => {
      const board = buildJkkn100Scoreboard(
        [acct('main_page'), acct('partner_one')],
        [post('main_page', '#JKKN100Day40', T0), post('partner_one', '#JKKN100Day40', plus(T0, 18))],
        { collab: { 40: ['partner_one'] } }
      );
      const cell = board.accounts.find((r) => r.username === 'partner_one')!.cells[40]!;
      expect(cell).toMatchObject({
        status: 'collab',
        also_posted: true,
        minutes_after_anchor: 18,
        permalink: null,
      });
      expect(cell.posted_at).toBe(plus(T0, 18));
      // It is not counted as a copy everyone else had to upload.
      expect(board.days[0]!.totals).toMatchObject({ yes: 1, collab: 1, no: 0 });
    });

    it('only applies to the day it was set for', () => {
      const board = buildJkkn100Scoreboard(
        [acct('main_page'), acct('partner_one')],
        [post('main_page', '#JKKN100Day40', T0), post('main_page', '#JKKN100Day39', plus(T0, 1440))],
        { collab: { 40: ['partner_one'] } }
      );
      const partner = board.accounts.find((r) => r.username === 'partner_one')!;
      expect(partner.cells[40]!.status).toBe('collab');
      expect(partner.cells[39]!.status).toBe('no');
    });

    it('matches the username whatever the case, and with a leading @', () => {
      const board = buildJkkn100Scoreboard(
        [acct('main_page'), acct('partner_one', { username: 'Partner_One' })],
        [post('main_page', '#JKKN100Day40', T0)],
        { collab: { 40: ['@PARTNER_ONE'] } }
      );
      const cell = board.accounts.find((r) => r.username === 'Partner_One')!.cells[40]!;
      expect(cell.status).toBe('collab');
    });

    it('warns about a username that is not one of the accounts on the board', () => {
      const board = buildJkkn100Scoreboard(
        [acct('main_page')],
        [post('main_page', '#JKKN100Day40', T0)],
        { collab: { 40: ['nobody_here'] } }
      );
      expect(board.warnings).toHaveLength(1);
      expect(board.warnings[0]).toContain('@nobody_here');
      expect(board.warnings[0]).toContain('Day 40');
      expect(board.collab).toEqual({ 40: ['nobody_here'] });
    });

    it('warns when the collab day has no tagged post, so nothing of it shows', () => {
      const board = buildJkkn100Scoreboard(
        [acct('main_page'), acct('partner_one')],
        [post('main_page', '#JKKN100Day40', T0)],
        { collab: { 39: ['partner_one'] } }
      );
      expect(board.days.map((d) => d.day)).toEqual([40]);
      expect(board.warnings).toHaveLength(1);
      expect(board.warnings[0]).toContain('#JKKN100Day39');
    });

    it('says nothing when every list lands', () => {
      const board = buildJkkn100Scoreboard(
        [acct('main_page'), acct('partner_one')],
        [post('main_page', '#JKKN100Day40', T0)],
        { collab: { 40: ['partner_one'] } }
      );
      expect(board.warnings).toEqual([]);
    });
  });
});

describe('jkkn100ScoreboardCsv', () => {
  it('writes one line per account and day, with reasons and the runner fallback', () => {
    const board = buildJkkn100Scoreboard(
      [
        acct('main_page', { connected_by: 'u1', connected_by_name: 'Priya, R' }),
        acct('public_one', { metrics_source: 'business_discovery' }),
      ],
      [post('main_page', '#JKKN100Day40', T0)]
    );
    const lines = jkkn100ScoreboardCsv(board).trim().split('\n');
    expect(lines[0]).toBe(
      'account,runs_this_account,day_tag,day_date,status,minutes_after_anchor,posted_at,posted_on_date,note,anchor_account,anchor_posted_at,anchor_choice,permalink'
    );
    expect(lines).toHaveLength(3);
    // Handles start with @, which a spreadsheet reads as a formula, so they are
    // written as text with a leading apostrophe; Excel still shows @handle.
    expect(lines[1]).toContain(`'@main_page,"Priya, R",#JKKN100Day40,2026-10-09,YES,0,`);
    expect(lines[2]).toContain("'@public_one,Nobody named yet,#JKKN100Day40,2026-10-09,UNKNOWN,");
    expect(lines[2]).toContain('Public-only account');
  });

  it('writes the collab state, its own-copy note and an off-date post', () => {
    const board = buildJkkn100Scoreboard(
      [acct('main_page'), acct('partner_one'), acct('late_one')],
      [
        post('main_page', '#JKKN100Day40', T0),
        post('partner_one', '#JKKN100Day40', plus(T0, 9)),
        post('late_one', '#JKKN100Day40', '2026-10-09T20:00:00.000Z'),
      ],
      { collab: { 40: ['partner_one'] } }
    );
    const lines = jkkn100ScoreboardCsv(board).trim().split('\n');
    const partner = lines.find((l) => l.startsWith("'@partner_one,"))!;
    expect(partner).toContain(',COLLAB,9,');
    expect(partner).toContain('uploaded its own copy as well');
    const late = lines.find((l) => l.startsWith("'@late_one,"))!;
    expect(late).toContain(',2026-10-10,');
    expect(late).toContain('Posted on 2026-10-10');
  });

  it('a name that starts like a formula is written as text, while negative minutes stay numbers', () => {
    const board = buildJkkn100Scoreboard(
      [
        acct('main_page'),
        acct('early_one', { connected_by: 'u2', connected_by_name: '=HYPERLINK("http://x","y")' }),
        acct('plus_one', { connected_by: 'u3', connected_by_name: '+91 Desk' }),
      ],
      [post('main_page', '#JKKN100Day40', T0), post('early_one', '#JKKN100Day40', plus(T0, -4))],
      { anchorUsername: 'main_page' }
    );
    const lines = jkkn100ScoreboardCsv(board).trim().split('\n');
    const early = lines.find((l) => l.startsWith("'@early_one,"))!;
    expect(early).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(early).toContain(',YES,-4,');
    const plusOne = lines.find((l) => l.startsWith("'@plus_one,"))!;
    expect(plusOne).toContain(",'+91 Desk,");
  });
});
