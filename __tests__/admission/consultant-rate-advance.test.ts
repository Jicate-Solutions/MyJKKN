import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Advances against the rate card (Director, 2026-09-21).
 *
 * The rules being protected:
 *   - An advance carries NO college line and MUST carry an intake year.
 *   - It is spread DOWN THE CARD in printed order, filling each line's balance.
 *   - A line payment and an advance are different things and must never be
 *     counted as each other.
 */

const calls: { op: string; args: any }[] = [];
let insertError: { message: string } | null = null;

function builder(table: string) {
  const chain: any = {
    insert: (rows: any) => {
      calls.push({ op: `insert:${table}`, args: rows });
      return Promise.resolve({ error: insertError });
    },
    select: () => chain,
    eq: (col: string, val: any) => {
      calls.push({ op: 'eq', args: { col, val } });
      return chain;
    },
    in: (col: string, vals: any) => {
      calls.push({ op: 'in', args: { col, vals } });
      return chain;
    },
    delete: () => chain,
    order: () => chain,
    then: (res: any) => res({ error: null, data: [] }),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: (t: string) => builder(t) }),
}));
vi.mock('@/lib/usage/record', () => ({ recordFeatureUse: vi.fn() }));

const AGENCY = 'agency-smet';
let ConsultantService: any;

beforeEach(async () => {
  calls.length = 0;
  insertError = null;
  ConsultantService = (await import('@/lib/services/admission/consultant-service')).ConsultantService;
});

const base = {
  consultant_id: AGENCY,
  entry_type: 'advance' as const,
  amount: 1000000,
  paid_on: '2026-09-21',
  academic_year: 2026,
  advance_disposition: 'carry_forward' as const,
};

describe('an advance must say which year, and never which college', () => {
  it('records an advance with no college line', async () => {
    await ConsultantService.createRateCardAdvance(base);
    const row = calls.find(c => c.op === 'insert:commission_rate_card_payments')!.args;
    expect(row.group_id).toBeNull();
    expect(row.entry_type).toBe('advance');
    expect(row.academic_year).toBe(2026);
    expect(row.advance_disposition).toBe('carry_forward');
  });

  it('refuses an advance with no intake year', async () => {
    await expect(
      ConsultantService.createRateCardAdvance({ ...base, academic_year: undefined as any })
    ).rejects.toThrow(/which intake year/i);
    expect(calls.some(c => c.op.startsWith('insert:'))).toBe(false);
  });

  it('refuses an advance of zero or less', async () => {
    await expect(ConsultantService.createRateCardAdvance({ ...base, amount: 0 })).rejects.toThrow(
      /more than zero/i
    );
    expect(calls.some(c => c.op.startsWith('insert:'))).toBe(false);
  });

  it('refuses an advance that does not say what happens to the unused part', async () => {
    await expect(
      ConsultantService.createRateCardAdvance({ ...base, advance_disposition: '' as any })
    ).rejects.toThrow(/carry it forward, or recover/i);
    expect(calls.some(c => c.op.startsWith('insert:'))).toBe(false);
  });

  it('never lets a caller smuggle a college line onto an advance', async () => {
    await ConsultantService.createRateCardAdvance({ ...base, group_id: 'some-college' } as any);
    const row = calls.find(c => c.op === 'insert:commission_rate_card_payments')!.args;
    expect(row.group_id).toBeNull();
  });

  it('reads back only this agency’s advances for that year', async () => {
    await ConsultantService.getRateCardAdvances(AGENCY, 2026);
    const eqs = calls.filter(c => c.op === 'eq').map(c => `${c.args.col}=${c.args.val}`);
    expect(eqs).toContain('consultant_id=agency-smet');
    expect(eqs).toContain('entry_type=advance');
    expect(eqs).toContain('academic_year=2026');
  });

  it('surfaces a refused insert rather than reporting success', async () => {
    insertError = { message: 'violates check constraint' };
    await expect(ConsultantService.createRateCardAdvance(base)).rejects.toThrow(
      'violates check constraint'
    );
  });
});

describe('payments and advances are never confused for one another', () => {
  it('the payment list asks for payments and recoveries only', async () => {
    await ConsultantService.getRateCardPayments(AGENCY, 2026);
    const inCall = calls.find(c => c.op === 'in');
    expect(inCall).toBeDefined();
    expect(inCall!.args.col).toBe('entry_type');
    expect(inCall!.args.vals).toEqual(['payment', 'recovery']);
  });
});

describe('the resolver spreads the advance down the card', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261231090000_commission_rate_card_advances.sql'),
    'utf8'
  ).replace(/^\s*--.*$/gm, '');

  it('pools advances by the card’s own year, never by college', () => {
    expect(migration).toMatch(/entry_type = 'advance'[\s\S]{0,80}academic_year = card\.academic_year/);
  });

  it('walks the lines in the card’s printed order', () => {
    expect(migration).toMatch(/ORDER BY o\.priority, o\.name\s*\n?\s*ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING/);
  });

  it('leaves line payments counting only payments and recoveries', () => {
    // Without this an advance would be added to a line's paid figure AND spread
    // across the lines, paying the agency twice on paper.
    expect(migration).toMatch(/AND p\.entry_type IN \('payment', 'recovery'\)/);
  });

  it('keeps an advance shapeless: no line, and a year', () => {
    expect(migration).toMatch(/WHEN 'advance' THEN[\s\S]{0,200}group_id IS NULL/);
    expect(migration).toMatch(/WHEN 'advance' THEN[\s\S]{0,200}academic_year IS NOT NULL/);
  });
});
