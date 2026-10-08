/**
 * The reason matcher in lib/services/hr/playbooks/lessons-harvest.ts mirrors
 * public.fn_hr_duty_reason_match (20271007161139). These cases read the
 * reason codes straight out of the migration's seed, so the TypeScript mirror
 * and the seeded keywords cannot drift apart unnoticed.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { matchReasonCode, type ReasonCode } from '@/lib/services/hr/playbooks/lessons-harvest';

const MIGRATION = path.resolve(
  __dirname, '..', '..', 'supabase/migrations/20271007161139_hr_duty_playbooks_and_lessons.sql');

function seededCodes(): ReasonCode[] {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const out: ReasonCode[] = [];
  // ('L1','document_missing','label','description',
  //  ARRAY['a','b'], 10,
  const row = /\('([A-Z][0-9]{1,2})','([a-z_]+)','(?:[^']|'')*','(?:[^']|'')*',\s*ARRAY\[([^\]]*)\](?:::text\[\])?,\s*(\d+)/g;
  for (const m of sql.matchAll(row)) {
    const terms = [...m[3].matchAll(/'((?:[^']|'')*)'/g)].map((t) => t[1].replace(/''/g, "'"));
    out.push({ duty_code: m[1], code: m[2], match_terms: terms, match_order: Number(m[4]) });
  }
  return out;
}

const CODES = seededCodes();

describe('the seeded reason codes', () => {
  it('cover the six duties whose reasons are readable, each with an other code', () => {
    const duties = [...new Set(CODES.map((c) => c.duty_code))].sort();
    expect(duties).toEqual(['A3', 'G2', 'L1', 'L2', 'S2', 'S3']);
    for (const d of duties) {
      const mine = CODES.filter((c) => c.duty_code === d);
      expect(mine.length).toBeGreaterThanOrEqual(5);
      expect(mine.length).toBeLessThanOrEqual(7);
      expect(mine.some((c) => c.code === 'other' && c.match_terms.length === 0)).toBe(true);
    }
  });
});

describe('matchReasonCode — the same answers as the harvest in the database', () => {
  it.each([
    ['L1', 'Medical certificate not attached', 'document_missing'],
    ['L1', 'Applied late, after the deadline', 'late_application'],
    ['L1', 'Exam duty clash', 'no_cover'],
    ['L2', 'No biometric punch on that day', 'no_proof'],
    ['A3', 'Wrong time asked for', 'wrong_details'],
    ['S2', 'Scan is blurred', 'unreadable'],
    ['S3', 'Background is not plain', 'background'],
    ['G2', 'Proof not attached', 'missing_attachment'],
  ])('%s: "%s" → %s', (duty, text, code) => {
    expect(matchReasonCode(CODES, duty, text)).toBe(code);
  });

  it('matches a keyword only at the start of a word', () => {
    expect(matchReasonCode(CODES, 'L1', 'Related to a family function')).toBe('other');
    expect(matchReasonCode(CODES, 'L1', 'Documents are pending')).toBe('document_missing');
  });

  it('is case-insensitive', () => {
    expect(matchReasonCode(CODES, 'L1', 'LATE APPLICATION')).toBe('late_application');
  });

  it('the first code by match order wins when two match', () => {
    // 'certificate' (document_missing, 10) and 'late' (late_application, 20)
    expect(matchReasonCode(CODES, 'L1', 'Late, and no certificate')).toBe('document_missing');
  });

  it("no match, empty text or no text is 'other'", () => {
    expect(matchReasonCode(CODES, 'L1', 'Not this week')).toBe('other');
    expect(matchReasonCode(CODES, 'L1', '')).toBe('other');
    expect(matchReasonCode(CODES, 'L1', null)).toBe('other');
  });

  it('only looks at codes of the duty asked for, and skips inactive codes', () => {
    expect(matchReasonCode(CODES, 'S3', 'Medical certificate not attached')).toBe('other');
    const off = CODES.map((c) => (c.duty_code === 'L1' && c.code === 'document_missing' ? { ...c, is_active: false } : c));
    expect(matchReasonCode(off, 'L1', 'Medical certificate not attached')).toBe('other');
  });
});
