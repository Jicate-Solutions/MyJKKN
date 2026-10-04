// __tests__/campus-walk/my-reports.test.ts
// ============================================================================
// lib/campus-walk/my-reports.ts — what the reporter sees, and when the
// "Not fixed" button shows. The page and the route share these helpers so the
// button on screen and the rule behind it cannot disagree about the 7 days.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  alsoReportedWordsOf,
  canSayNotFixed,
  reportStatusOf,
  withinNotFixedWindow,
} from '@/lib/campus-walk/my-reports';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

describe('the Not fixed window', () => {
  it('is open for 7 days after the job was closed, and shut after', () => {
    expect(withinNotFixedWindow(ago(0), NOW)).toBe(true);
    expect(withinNotFixedWindow(ago(7), NOW)).toBe(true);
    expect(withinNotFixedWindow(ago(7.01), NOW)).toBe(false);
    expect(withinNotFixedWindow(null, NOW)).toBe(false);
    expect(withinNotFixedWindow('not a date', NOW)).toBe(false);
  });

  it('shows the button only on a closed job inside the window', () => {
    expect(canSayNotFixed({ status_key: 'done', completed_at: ago(2) }, NOW)).toBe(true);
    expect(canSayNotFixed({ status_key: 'done', completed_at: ago(9) }, NOW)).toBe(false);
    expect(canSayNotFixed({ status_key: 'in_progress', completed_at: null }, NOW)).toBe(false);
    expect(canSayNotFixed({ status_key: 'review', completed_at: null }, NOW)).toBe(false);
  });
});

describe('the status in plain words', () => {
  it('reads each state the way a reporter would say it', () => {
    expect(reportStatusOf({ status_key: 'done', metadata: {} })).toBe('fixed');
    expect(reportStatusOf({ status_key: 'todo', metadata: {} })).toBe('open');
    expect(reportStatusOf({ status_key: 'review', metadata: {} })).toBe('being_checked');
    expect(reportStatusOf({ status_key: 'cancelled', metadata: {} })).toBe('cancelled');
    expect(
      reportStatusOf({
        status_key: 'in_progress',
        metadata: { fix: { approval: { state: 'changes_requested', reopened_by_reporter: true } } },
      })
    ).toBe('reopened');
    // A manager's old "send back" is not the reporter reopening it.
    expect(
      reportStatusOf({ status_key: 'in_progress', metadata: { fix: { approval: { state: 'changes_requested' } } } })
    ).toBe('open');
  });
});

// ── Director's ruling, 1 Oct 2026 (closes D10) ──────────────────────────────
// People who report the same job see each other's WORDS as
// "Someone also reported: …" — never a name, an id, or whose photo is whose.
describe('Someone also reported — words, never who', () => {
  const FILER = 'aaaaaaaa-0000-0000-0000-000000000001';
  const FIRST_JOINER = 'bbbbbbbb-0000-0000-0000-000000000002';
  const SECOND_JOINER = 'cccccccc-0000-0000-0000-000000000003';
  const entry = (id: string, note: string, n: number) => ({
    reporter_id: id,
    raised_by_profile_id: id,
    reporter_role: 'staff',
    note,
    photo_storage_path: `walk/${id}/photo-${n}.jpg`,
    at: `2026-09-30T0${n}:00:00.000Z`,
  });
  const metadata = {
    reporter_id: FILER,
    additional_reports: [
      entry(FIRST_JOINER, 'Water is now on the floor too', 1),
      entry(SECOND_JOINER, 'Still dripping near the door', 2),
    ],
  };
  const description = 'Tap dripping in the ground floor washroom';

  it('the person who filed it sees every later note', () => {
    expect(alsoReportedWordsOf({ description, metadata, viewerId: FILER, viewerFiled: true })).toEqual([
      'Water is now on the floor too',
      'Still dripping near the door',
    ]);
  });

  it('a joiner sees the earlier words — the first report, then notes joined before theirs — not later ones', () => {
    expect(alsoReportedWordsOf({ description, metadata, viewerId: FIRST_JOINER, viewerFiled: false })).toEqual([
      description,
    ]);
    expect(alsoReportedWordsOf({ description, metadata, viewerId: SECOND_JOINER, viewerFiled: false })).toEqual([
      description,
      'Water is now on the floor too',
    ]);
  });

  it('never shows the viewer their own words, and skips blank ones', () => {
    const m = {
      additional_reports: [entry(SECOND_JOINER, '   ', 1), entry(FIRST_JOINER, 'My own words', 2)],
    };
    expect(alsoReportedWordsOf({ description: '', metadata: m, viewerId: FIRST_JOINER, viewerFiled: false })).toEqual(
      []
    );
    expect(alsoReportedWordsOf({ description, metadata: m, viewerId: FIRST_JOINER, viewerFiled: true })).toEqual([]);
  });

  it('lets no id, time or photo path through — only the words', () => {
    const all = [FILER, FIRST_JOINER, SECOND_JOINER].flatMap((viewerId) =>
      [true, false].map((viewerFiled) => alsoReportedWordsOf({ description, metadata, viewerId, viewerFiled }))
    );
    const text = JSON.stringify(all);
    for (const leak of [FILER, FIRST_JOINER, SECOND_JOINER, 'photo-1.jpg', 'photo-2.jpg', '2026-09-30T0', 'staff']) {
      expect(text).not.toContain(leak);
    }
    for (const list of all) for (const w of list) expect(typeof w).toBe('string');
  });

  it('My reports is wired to it: the page reads the description and sends only the words to the card', () => {
    const dir = join(process.cwd(), 'app/(routes)/instasolver/my-reports');
    const page = readFileSync(join(dir, 'page.tsx'), 'utf8');
    const client = readFileSync(join(dir, '_components/my-reports-client.tsx'), 'utf8');
    expect(page).toMatch(/const SELECT = '[^']*\bdescription\b/);
    expect(page).toMatch(/alsoReported:\s*alsoReportedWordsOf\(/);
    expect(client).toContain('Someone also reported:');
    expect(client).toMatch(/alsoReported: string\[\]/);
    // The card never receives who said it.
    expect(client).not.toMatch(/reporter_id|raised_by_profile_id|photo_storage_path/);
  });
});
