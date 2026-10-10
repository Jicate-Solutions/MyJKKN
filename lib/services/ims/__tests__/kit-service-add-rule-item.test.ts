// BUG-005858 (+ BUG-005953, BUG-005892): adding an item to a kit rule always
// showed "Add failed". Two causes:
//   1. the D32 trigger (fn_kit_guard_rule_item) rejects items whose kit_source
//      is NULL, and no app path ever set it (684/684 live items NULL);
//   2. supabase-js returns `error` as a PLAIN object, so the page's
//      `e instanceof Error` check fell through to the generic toast.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { table: string; op: string; arg?: unknown; filters?: Array<[string, string, unknown]> };
const calls: Call[] = [];
let updateResult: { data: unknown; error: unknown } = { data: [{ id: 'item-1' }], error: null };
let revertResult: { error: unknown } = { error: null };
let revertThrows = false;
let readResult: { data: unknown; error: unknown } = { data: { kit_source: null, institution_id: 'inst-A' }, error: null };
let insertResult: { error: unknown } = { error: null };
let ruleResult: { data: unknown; error: unknown } = { data: { institution_id: 'inst-A' }, error: null };
let ruleItemsResult: { data: unknown; error: unknown } = { data: [], error: null };
let searchResult: { data: unknown; error: unknown } = { data: [], error: null };

function from(table: string) {
  return {
    update(arg: unknown) {
      const call: Call = { table, op: 'update', arg, filters: [] };
      calls.push(call);
      // Awaited directly (revert, no .select) or via .select() (classify).
      const chain = {
        eq: (c: string, v: unknown) => (call.filters!.push(['eq', c, v]), chain),
        is: (c: string, v: unknown) => (call.filters!.push(['is', c, v]), chain),
        select: () => Promise.resolve(updateResult),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          (revertThrows ? Promise.reject(new Error('network down')) : Promise.resolve(revertResult)).then(
            res,
            rej,
          ),
      };
      return chain;
    },
    select(arg: unknown) {
      const call: Call = { table, op: 'select', arg, filters: [] };
      calls.push(call);
      const chain = {
        eq: (c: string, v: unknown) => (call.filters!.push(['eq', c, v]), chain),
        or: (v: string) => (call.filters!.push(['or', v, null]), chain),
        maybeSingle: () => Promise.resolve(table === 'ims_kit_rules' ? ruleResult : readResult),
        limit: () =>
          Promise.resolve(table === 'ims_kit_rule_items' ? ruleItemsResult : searchResult),
      };
      return chain;
    },
    insert(arg: unknown) {
      calls.push({ table, op: 'insert', arg });
      return Promise.resolve(insertResult);
    },
  };
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from, rpc: vi.fn() }),
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ImsKitService } from '../kit-service';

const base = { rule_id: 'rule-1', item_id: 'item-1', quantity: 1, cadence: 'yearly' };

beforeEach(() => {
  calls.length = 0;
  updateResult = { data: [{ id: 'item-1' }], error: null };
  revertResult = { error: null };
  revertThrows = false;
  readResult = { data: { kit_source: null, institution_id: 'inst-A' }, error: null };
  insertResult = { error: null };
  ruleResult = { data: { institution_id: 'inst-A' }, error: null };
  ruleItemsResult = { data: [], error: null };
  searchResult = { data: [], error: null };
});

const ops = () => calls.map(({ table, op, arg }) => ({ table, op, arg }));
const writes = () => ops().filter((c) => c.op !== 'select');

describe('ImsKitService.addRuleItem', () => {
  it('classifies an unclassified item (kit_source) BEFORE inserting the rule item', async () => {
    await ImsKitService.addRuleItem({ ...base, kit_source: 'college' });
    expect(writes()).toEqual([
      { table: 'ims_items', op: 'update', arg: { kit_source: 'college' } },
      { table: 'ims_kit_rule_items', op: 'insert', arg: base },
    ]);
  });

  it('does not touch the item when it is already classified', async () => {
    await ImsKitService.addRuleItem(base);
    expect(ops()).toEqual([{ table: 'ims_kit_rule_items', op: 'insert', arg: base }]);
  });

  it('only classifies an item whose kit_source is still NULL (stale result cannot overwrite)', async () => {
    await ImsKitService.addRuleItem({ ...base, kit_source: 'college' });
    expect(calls.find((c) => c.op === 'update')!.filters).toContainEqual(['is', 'kit_source', null]);
  });

  it('blocks a stale overwrite: item now classified differently → names it, no insert', async () => {
    updateResult = { data: [], error: null };
    readResult = { data: { kit_source: 'central' }, error: null };
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'college' })).rejects.toThrow(
      'This item is already classified as Central store',
    );
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('continues when someone set the SAME source meanwhile (race, not a failure)', async () => {
    updateResult = { data: [], error: null };
    readResult = { data: { kit_source: 'college' }, error: null };
    await ImsKitService.addRuleItem({ ...base, kit_source: 'college' });
    expect(ops().at(-1)).toEqual({ table: 'ims_kit_rule_items', op: 'insert', arg: base });
  });

  it('says it is a permission refusal when the item is still NULL after a 0-row update', async () => {
    updateResult = { data: [], error: null };
    readResult = { data: { kit_source: null, institution_id: 'inst-A' }, error: null };
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'central' })).rejects.toThrow(
      "You can't classify items — ask a store admin to set the item's kit source.",
    );
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('reverts its own classification when the rule-item insert fails, and surfaces the insert error', async () => {
    insertResult = { error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'college' })).rejects.toThrow(
      /duplicate key/,
    );
    const revert = calls.at(-1)!;
    expect(calls.at(-2)).toMatchObject({
      table: 'ims_kit_rule_items', op: 'select', filters: [['eq', 'item_id', 'item-1']],
    });
    expect(revert).toMatchObject({ table: 'ims_items', op: 'update', arg: { kit_source: null } });
    expect(revert.filters).toEqual([
      ['eq', 'id', 'item-1'],
      ['eq', 'kit_source', 'college'],
    ]);
  });

  it('still surfaces the insert error when the revert itself fails', async () => {
    insertResult = { error: { message: 'insert boom' } };
    revertResult = { error: { message: 'revert boom' } };
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'college' })).rejects.toThrow(
      'insert boom',
    );
  });

  it('still surfaces the insert error when the revert call throws', async () => {
    insertResult = { error: { message: 'insert boom' } };
    revertThrows = true;
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'college' })).rejects.toThrow(
      'insert boom',
    );
  });

  it('does not revert when the item was already classified before this call', async () => {
    updateResult = { data: [], error: null };
    readResult = { data: { kit_source: 'college' }, error: null };
    insertResult = { error: { message: 'insert boom' } };
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'college' })).rejects.toThrow(
      'insert boom',
    );
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });

  it("skips the revert when another admin's rule item already uses the item", async () => {
    insertResult = { error: { message: 'insert boom' } };
    ruleItemsResult = { data: [{ id: 'peer-rule-item' }], error: null };
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'college' })).rejects.toThrow(
      'insert boom',
    );
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });

  it('skips the revert (fail safe) when the rule-item check errors, still surfacing the insert error', async () => {
    insertResult = { error: { message: 'insert boom' } };
    ruleItemsResult = { data: null, error: { message: 'check boom' } };
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'college' })).rejects.toThrow(
      'insert boom',
    );
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });

  it("scopes the classify update to the rule's institution", async () => {
    await ImsKitService.addRuleItem({ ...base, kit_source: 'college' });
    expect(calls[0]).toMatchObject({
      table: 'ims_kit_rules', op: 'select', filters: [['eq', 'id', 'rule-1']],
    });
    const upd = calls.find((c) => c.op === 'update')!;
    expect(upd.filters).toContainEqual(['eq', 'institution_id', 'inst-A']);
  });

  it("names another college's item instead of blaming permissions (0 rows, other institution)", async () => {
    updateResult = { data: [], error: null };
    readResult = { data: { kit_source: null, institution_id: 'inst-B' }, error: null };
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'college' })).rejects.toThrow(
      /belongs to another college/,
    );
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('never classifies for a rule spanning all colleges (no institution to scope to)', async () => {
    ruleResult = { data: { institution_id: null }, error: null };
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'central' })).rejects.toThrow(
      /spans all colleges/,
    );
    expect(writes()).toEqual([]);
  });
});

describe('ImsKitService.searchItems (kit rule panel scope)', () => {
  const searchFilters = () => calls.find((c) => c.table === 'ims_items' && c.op === 'select')!.filters;

  it("college rule: its own college's items plus Central store items", async () => {
    await ImsKitService.searchItems('pen', { institutionId: 'inst-A' });
    expect(searchFilters()).toContainEqual(['or', 'institution_id.eq.inst-A,kit_source.eq.central', null]);
  });

  it('all-colleges rule: Central store items only', async () => {
    await ImsKitService.searchItems('pen', { institutionId: null });
    expect(searchFilters()).toContainEqual(['eq', 'kit_source', 'central']);
    expect(searchFilters()!.filter((f) => f[0] === 'or')).toHaveLength(1);
  });

  it('does not revert when no source was passed (already-classified search result)', async () => {
    insertResult = { error: { message: 'insert boom' } };
    await expect(ImsKitService.addRuleItem(base)).rejects.toThrow('insert boom');
    expect(calls.some((c) => c.op === 'update')).toBe(false);
  });

  it("surfaces the server's message as a real Error (plain PostgREST error object)", async () => {
    insertResult = {
      error: {
        message: 'item is not classified as central or college — set its kit source first (D32)',
        code: 'P0001',
      },
    };
    const err = await ImsKitService.addRuleItem(base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/\(D32\)/);
  });
});
