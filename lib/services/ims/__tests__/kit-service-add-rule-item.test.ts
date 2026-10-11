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
let readResult: { data: unknown; error: unknown } = { data: { kit_source: null, institution_id: 'inst-A' }, error: null };
let insertResult: { error: unknown } = { error: null };
let ruleResult: { data: unknown; error: unknown } = { data: { institution_id: 'inst-A' }, error: null };
let searchResult: { data: unknown; error: unknown } = { data: [], error: null };

function from(table: string) {
  return {
    update(arg: unknown) {
      const call: Call = { table, op: 'update', arg, filters: [] };
      calls.push(call);
      const chain = {
        eq: (c: string, v: unknown) => (call.filters!.push(['eq', c, v]), chain),
        is: (c: string, v: unknown) => (call.filters!.push(['is', c, v]), chain),
        not: (c: string, op: string, v: unknown) => (call.filters!.push(['not', `${c}.${op}`, v]), chain),
        select: () => Promise.resolve(updateResult),
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
        limit: () => Promise.resolve(searchResult),
        order: () => Promise.resolve({ data: [], error: null }),
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

import {
  ImsKitService,
  KIT_SCREEN_SOURCE_OPTIONS,
  KIT_SCREEN_SOURCE_OPTIONS_STORE_ADMIN,
  kitSourceOptionsFor,
} from '../kit-service';

const base = { rule_id: 'rule-1', item_id: 'item-1', quantity: 1, cadence: 'yearly' };

beforeEach(() => {
  calls.length = 0;
  updateResult = { data: [{ id: 'item-1' }], error: null };
  readResult = { data: { kit_source: null, institution_id: 'inst-A' }, error: null };
  insertResult = { error: null };
  ruleResult = { data: { institution_id: 'inst-A' }, error: null };
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
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'college' })).rejects.toThrow(
      "You can't classify items — ask a store admin to set the item's kit source.",
    );
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('insert fails → item stays classified (item setup), no second update, insert message thrown', async () => {
    insertResult = { error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
    const err = await ImsKitService.addRuleItem({ ...base, kit_source: 'college' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('duplicate key value violates unique constraint');
    expect(writes()).toEqual([
      { table: 'ims_items', op: 'update', arg: { kit_source: 'college' } },
      { table: 'ims_kit_rule_items', op: 'insert', arg: base },
    ]);
    expect(calls.some((c) => c.table === 'ims_kit_rule_items' && c.op === 'select')).toBe(false);
  });

  it('refuses to mark an item Central store from the kit screen — no read, no write', async () => {
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'central' })).rejects.toThrow(
      'Central store items are set up by a store admin in item setup',
    );
    expect(calls).toEqual([]);
  });

  it('the kit-screen source picker offers College store only', () => {
    expect(KIT_SCREEN_SOURCE_OPTIONS.map((o) => o.value)).toEqual(['college']);
  });

  it('an already-Central item is still added as today (no source passed)', async () => {
    await ImsKitService.addRuleItem(base);
    expect(writes()).toEqual([{ table: 'ims_kit_rule_items', op: 'insert', arg: base }]);
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
    await expect(ImsKitService.addRuleItem({ ...base, kit_source: 'college' })).rejects.toThrow(
      /spans all colleges/,
    );
    expect(writes()).toEqual([]);
  });
});

describe('ImsKitService.searchItems (kit rule panel scope)', () => {
  const searchFilters = () => calls.find((c) => c.table === 'ims_items' && c.op === 'select')!.filters;

  it("college rule: its own college's items plus Central store items", async () => {
    await ImsKitService.searchItems('pen', { institutionId: 'inst-A' });
    // One or= param carrying the AND, never two .or() calls (two `or=` params).
    const ors = searchFilters()!.filter((f) => f[0] === 'or');
    expect(ors).toEqual([
      ['or', 'and(or(name.ilike."%pen%",code.ilike."%pen%"),or(institution_id.eq.inst-A,kit_source.eq.central))', null],
    ]);
  });

  it('search errors arrive as a real Error with the server message', async () => {
    searchResult = { data: null, error: { message: 'permission denied for table ims_items' } };
    const err = await ImsKitService.searchItems('pen', { institutionId: 'inst-A' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('permission denied for table ims_items');
  });

  it('all-colleges rule: Central store items only', async () => {
    await ImsKitService.searchItems('pen', { institutionId: null });
    expect(searchFilters()).toContainEqual(['eq', 'kit_source', 'central']);
    expect(searchFilters()!.filter((f) => f[0] === 'or')).toEqual([
      ['or', 'name.ilike."%pen%",code.ilike."%pen%"', null],
    ]);
  });

  it('no scope: name/code match only, no source filter', async () => {
    await ImsKitService.searchItems('pen');
    expect(searchFilters()).toEqual([
      ['eq', 'is_active', true],
      ['or', 'name.ilike."%pen%",code.ilike."%pen%"', null],
    ]);
  });

  it('writes nothing to the item when no source was passed and the insert fails', async () => {
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

// Q-1010-395 (Director 11 Oct 2026): only store admins mark Central / reset.
describe('Central store and reset — store admins only (Q-1010-395)', () => {
  const STORE_ADMIN_ONLY = 'Only a store admin can mark an item Central or reset its source.';

  it('college team members (any non-admin role) are still refused Central — no read, no write', async () => {
    for (const caller_role of [undefined, null, 'staff', 'hod', 'admin']) {
      calls.length = 0;
      await expect(
        ImsKitService.addRuleItem({ ...base, kit_source: 'central', caller_role }),
      ).rejects.toThrow('Central store items are set up by a store admin in item setup');
      expect(calls).toEqual([]);
    }
  });

  it('the picker offers Central only to store_admin / super_admin', () => {
    expect(kitSourceOptionsFor('staff').map((o) => o.value)).toEqual(['college']);
    expect(kitSourceOptionsFor(null).map((o) => o.value)).toEqual(['college']);
    expect(kitSourceOptionsFor('store_admin')).toBe(KIT_SCREEN_SOURCE_OPTIONS_STORE_ADMIN);
    expect(kitSourceOptionsFor('super_admin').map((o) => o.value)).toEqual(['college', 'central']);
    expect(KIT_SCREEN_SOURCE_OPTIONS_STORE_ADMIN.map((o) => o.label)).toEqual(['College store', 'Central store']);
  });

  it('a store admin marks the item Central, then adds the rule item (caller_role never sent to the DB)', async () => {
    await ImsKitService.addRuleItem({ ...base, kit_source: 'central', caller_role: 'store_admin' });
    expect(writes()).toEqual([
      { table: 'ims_items', op: 'update', arg: { kit_source: 'central' } },
      { table: 'ims_kit_rule_items', op: 'insert', arg: base },
    ]);
    const upd = calls.find((c) => c.op === 'update')!;
    // No NULL guard: College -> Central is a store-admin change the trigger allows.
    expect(upd.filters).not.toContainEqual(['is', 'kit_source', null]);
    expect(upd.filters).toContainEqual(['eq', 'institution_id', 'inst-A']);
  });

  it('a super admin may mark Central on a rule spanning all colleges (no institution scope)', async () => {
    ruleResult = { data: { institution_id: null }, error: null };
    await ImsKitService.addRuleItem({ ...base, kit_source: 'central', caller_role: 'super_admin' });
    const upd = calls.find((c) => c.op === 'update')!;
    expect(upd.filters).toEqual([['eq', 'id', 'item-1']]);
    expect(writes().at(-1)).toEqual({ table: 'ims_kit_rule_items', op: 'insert', arg: base });
  });

  it('store admin, 0 rows but item already Central → carries on', async () => {
    updateResult = { data: [], error: null };
    readResult = { data: { kit_source: 'central', institution_id: 'inst-A' }, error: null };
    await ImsKitService.addRuleItem({ ...base, kit_source: 'central', caller_role: 'store_admin' });
    expect(writes().at(-1)).toEqual({ table: 'ims_kit_rule_items', op: 'insert', arg: base });
  });

  it('store admin, 0 rows and not Central → plain refusal, no insert', async () => {
    updateResult = { data: [], error: null };
    readResult = { data: { kit_source: null, institution_id: 'inst-A' }, error: null };
    await expect(
      ImsKitService.addRuleItem({ ...base, kit_source: 'central', caller_role: 'store_admin' }),
    ).rejects.toThrow(STORE_ADMIN_ONLY);
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('the DB trigger refusal (42501) reaches the user as a real Error', async () => {
    updateResult = { data: null, error: { message: STORE_ADMIN_ONLY, code: '42501' } };
    const err = await ImsKitService.addRuleItem({ ...base, kit_source: 'central', caller_role: 'store_admin' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(STORE_ADMIN_ONLY);
  });

  it('reset is refused for non-admins — nothing sent', async () => {
    for (const role of [undefined, null, 'staff', 'admin']) {
      calls.length = 0;
      await expect(ImsKitService.resetKitSource('item-1', role)).rejects.toThrow(STORE_ADMIN_ONLY);
      expect(calls).toEqual([]);
    }
  });

  it('reset works for a store admin: sets kit_source NULL on a classified item', async () => {
    await ImsKitService.resetKitSource('item-1', 'store_admin');
    expect(writes()).toEqual([{ table: 'ims_items', op: 'update', arg: { kit_source: null } }]);
    expect(calls[0].filters).toEqual([
      ['eq', 'id', 'item-1'],
      ['not', 'kit_source.is', null],
    ]);
  });

  it('reset of an item with no source says so (0 rows)', async () => {
    updateResult = { data: [], error: null };
    readResult = { data: { kit_source: null }, error: null };
    await expect(ImsKitService.resetKitSource('item-1', 'super_admin')).rejects.toThrow(
      'This item has no kit source to reset',
    );
  });

  it('reset of an item the admin cannot see says so (0 rows, no row)', async () => {
    updateResult = { data: [], error: null };
    readResult = { data: null, error: null };
    await expect(ImsKitService.resetKitSource('item-1', 'store_admin')).rejects.toThrow(
      'Item not found, or you cannot see it',
    );
  });

  it("getRuleItems reads each item's kit_source (badge + Reset source on the rule)", async () => {
    await ImsKitService.getRuleItems('rule-1');
    expect(calls[0]).toMatchObject({
      table: 'ims_kit_rule_items', op: 'select', arg: '*, item:ims_items(name, code, kit_source)',
    });
  });
});
