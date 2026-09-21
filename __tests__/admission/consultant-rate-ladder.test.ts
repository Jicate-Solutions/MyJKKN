import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Per-agency rate ladders on the service-charge card (Director ruling 2026-09-21).
 *
 * The rule being protected: an agency's own ladder REPLACES the standard ladder
 * for that line. It never merges with it, never tops it up, and a gap in it must
 * read as "not earned" rather than quietly falling back to the standard rate.
 */

const calls: { op: string; args: any }[] = [];
let insertError: { message: string } | null = null;
let deleteError: { message: string } | null = null;

function builder(table: string) {
  const chain: any = {
    delete: () => {
      calls.push({ op: `delete:${table}`, args: {} });
      return chain;
    },
    eq: (col: string, val: any) => {
      calls.push({ op: 'eq', args: { col, val } });
      return chain;
    },
    insert: (rows: any) => {
      calls.push({ op: `insert:${table}`, args: rows });
      return Promise.resolve({ error: insertError });
    },
    select: () => chain,
    order: () => chain,
    then: (res: any) => res({ error: deleteError, data: [] }),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: (t: string) => builder(t) }),
}));
vi.mock('@/lib/usage/record', () => ({ recordFeatureUse: vi.fn() }));

const GROUP = 'group-eng-ug-regular';
const AGENCY = 'agency-smet';

let ConsultantService: any;

beforeEach(async () => {
  calls.length = 0;
  insertError = null;
  deleteError = null;
  ConsultantService = (await import('@/lib/services/admission/consultant-service')).ConsultantService;
});

describe('an agency ladder is refused before anything is deleted', () => {
  it('refuses two bands that cover the same count, and deletes nothing', async () => {
    await expect(
      ConsultantService.saveConsultantLadder(AGENCY, GROUP, [
        { min_count: 1, max_count: 25, amount: 30000 },
        { min_count: 20, max_count: 40, amount: 35000 },
      ])
    ).rejects.toThrow(/overlap/i);

    // The destructive half must not have run: a refused save leaves the agency
    // exactly where it was, on whatever ladder it already had.
    expect(calls.some(c => c.op.startsWith('delete:'))).toBe(false);
  });

  it('refuses a band that ends before it starts', async () => {
    await expect(
      ConsultantService.saveConsultantLadder(AGENCY, GROUP, [
        { min_count: 30, max_count: 10, amount: 30000 },
      ])
    ).rejects.toThrow(/end before it starts/i);
    expect(calls.some(c => c.op.startsWith('delete:'))).toBe(false);
  });

  it('refuses a band starting below one learner', async () => {
    await expect(
      ConsultantService.saveConsultantLadder(AGENCY, GROUP, [
        { min_count: 0, max_count: 10, amount: 30000 },
      ])
    ).rejects.toThrow(/1 learner or more/i);
    expect(calls.some(c => c.op.startsWith('delete:'))).toBe(false);
  });

  it('refuses a negative rate', async () => {
    await expect(
      ConsultantService.saveConsultantLadder(AGENCY, GROUP, [
        { min_count: 1, max_count: null, amount: -1 },
      ])
    ).rejects.toThrow(/negative/i);
    expect(calls.some(c => c.op.startsWith('delete:'))).toBe(false);
  });

  it('accepts touching-but-not-overlapping bands', async () => {
    await ConsultantService.saveConsultantLadder(AGENCY, GROUP, [
      { min_count: 1, max_count: 25, amount: 30000 },
      { min_count: 26, max_count: null, amount: 35000 },
    ]);
    const inserted = calls.find(c => c.op === 'insert:commission_rate_card_slabs');
    expect(inserted).toBeDefined();
    expect(inserted!.args).toHaveLength(2);
  });
});

describe('a saved ladder belongs to one agency and one line', () => {
  it('stamps every band with the agency and the group, in ascending order', async () => {
    await ConsultantService.saveConsultantLadder(
      AGENCY,
      GROUP,
      [
        { min_count: 26, max_count: null, amount: 35000 },
        { min_count: 1, max_count: 25, amount: 30000 },
      ],
      'signed letter 12 Sep'
    );
    const rows = calls.find(c => c.op === 'insert:commission_rate_card_slabs')!.args;
    expect(rows.map((r: any) => r.min_count)).toEqual([1, 26]);
    expect(rows.every((r: any) => r.consultant_id === AGENCY)).toBe(true);
    expect(rows.every((r: any) => r.group_id === GROUP)).toBe(true);
    expect(rows.every((r: any) => r.note === 'signed letter 12 Sep')).toBe(true);
  });

  it('an empty ladder clears the agency back to the standard card and inserts nothing', async () => {
    await ConsultantService.clearConsultantLadder(AGENCY, GROUP);
    expect(calls.some(c => c.op === 'delete:commission_rate_card_slabs')).toBe(true);
    expect(calls.some(c => c.op === 'insert:commission_rate_card_slabs')).toBe(false);
  });

  it('surfaces a failed insert instead of leaving it silent', async () => {
    insertError = { message: 'exclusion violation' };
    await expect(
      ConsultantService.saveConsultantLadder(AGENCY, GROUP, [
        { min_count: 1, max_count: null, amount: 30000 },
      ])
    ).rejects.toThrow('exclusion violation');
  });
});

describe('the standard card never shows another agency’s rates', () => {
  it('getRateCard filters the nested slabs to the standard ladder', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/services/admission/consultant-service.ts'),
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const start = src.indexOf('static async getRateCard(');
    const end = src.indexOf('static async getRateCardYears(');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).toMatch(/\.is\(\s*'groups\.slabs\.consultant_id'\s*,\s*null\s*\)/);
  });
});

describe('the resolver replaces the ladder rather than merging it', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20261229090000_commission_rate_card_consultant_ladder.sql'
    ),
    'utf8'
  ).replace(/^\s*--.*$/gm, '');

  it('consults the agency ladder only when the agency has one, and the standard one otherwise', () => {
    // A future "simplification" that ORs the two together would silently let an
    // agency earn the better of the two rates on every line.
    expect(migration).toMatch(
      /CASE WHEN c\.has_override\s*THEN s\.consultant_id = p_consultant_id\s*ELSE s\.consultant_id IS NULL END/
    );
  });

  it('keeps the guard that stops two bands covering the same count', () => {
    expect(migration).toMatch(/EXCLUDE USING gist/);
    expect(migration).toMatch(/int8range/);
  });

  it('reports which lines are on an agency rate', () => {
    expect(migration).toMatch(/is_override\s+boolean/);
  });
});
