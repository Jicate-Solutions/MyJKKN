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
// Per-call results for tests with more than one update (taken first, in order).
let updateQueue: Array<{ data: unknown; error: unknown }> = [];
let readResult: { data: unknown; error: unknown } = { data: { kit_source: null, institution_id: 'inst-A' }, error: null };
let insertResult: { error: unknown } = { error: null };
let ruleResult: { data: unknown; error: unknown } = { data: { institution_id: 'inst-A' }, error: null };
let searchResult: { data: unknown; error: unknown } = { data: [], error: null };
let ruleItemResult: { data: unknown; error: unknown } = { data: null, error: null };

function from(table: string) {
  return {
    update(arg: unknown) {
      const call: Call = { table, op: 'update', arg, filters: [] };
      calls.push(call);
      const chain = {
        eq: (c: string, v: unknown) => (call.filters!.push(['eq', c, v]), chain),
        is: (c: string, v: unknown) => (call.filters!.push(['is', c, v]), chain),
        not: (c: string, op: string, v: unknown) => (call.filters!.push(['not', `${c}.${op}`, v]), chain),
        select: () => Promise.resolve(updateQueue.length ? updateQueue.shift()! : updateResult),
      };
      return chain;
    },
    select(arg: unknown) {
      const call: Call = { table, op: 'select', arg, filters: [] };
      calls.push(call);
      const chain = {
        eq: (c: string, v: unknown) => (call.filters!.push(['eq', c, v]), chain),
        or: (v: string) => (call.filters!.push(['or', v, null]), chain),
        maybeSingle: () =>
          Promise.resolve(
            table === 'ims_kit_rules' ? ruleResult : table === 'ims_kit_rule_items' ? ruleItemResult : readResult,
          ),
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
  updateQueue = [];
  readResult = { data: { kit_source: null, institution_id: 'inst-A' }, error: null };
  insertResult = { error: null };
  ruleResult = { data: { institution_id: 'inst-A' }, error: null };
  searchResult = { data: [], error: null };
  ruleItemResult = { data: null, error: null };
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
    // Stale-value guard on the value the screen showed (null by default).
    expect(upd.filters).toContainEqual(['is', 'kit_source', null]);
    expect(upd.filters).toContainEqual(['eq', 'institution_id', 'inst-A']);
  });

  it('a super admin may mark Central on a rule spanning all colleges (no institution scope)', async () => {
    ruleResult = { data: { institution_id: null }, error: null };
    await ImsKitService.addRuleItem({ ...base, kit_source: 'central', caller_role: 'super_admin' });
    const upd = calls.find((c) => c.op === 'update')!;
    expect(upd.filters).toEqual([['eq', 'id', 'item-1'], ['is', 'kit_source', null]]);
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

  it('the platform super-admin flag counts (ordinary role + is_super_admin)', async () => {
    expect(kitSourceOptionsFor('staff', true).map((o) => o.value)).toEqual(['college', 'central']);
    expect(kitSourceOptionsFor('staff', false).map((o) => o.value)).toEqual(['college']);
    await ImsKitService.addRuleItem({
      ...base, kit_source: 'central', caller_role: 'staff', caller_is_super_admin: true,
    });
    expect(writes()).toEqual([
      { table: 'ims_items', op: 'update', arg: { kit_source: 'central' } },
      { table: 'ims_kit_rule_items', op: 'insert', arg: base },
    ]);
    calls.length = 0;
    await ImsKitService.resetKitSource('item-1', 'staff', true);
    expect(writes()).toEqual([{ table: 'ims_items', op: 'update', arg: { kit_source: null } }]);
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

// #4346 panel LOWs 3, 4, 6 — store-admin Central path.
describe('markCentral hardening (#4346 panel)', () => {
  const admin = { ...base, kit_source: 'central' as const, caller_role: 'store_admin' };

  it('LOW-3: guards on the value the screen showed (College -> Central uses eq college)', async () => {
    await ImsKitService.addRuleItem({ ...admin, seen_kit_source: 'college' });
    const upd = calls.find((c) => c.op === 'update')!;
    expect(upd.filters).toContainEqual(['eq', 'kit_source', 'college']);
    expect(upd.filters).not.toContainEqual(['is', 'kit_source', null]);
  });

  it('LOW-3: 0 rows because someone changed it meanwhile -> "changed by someone else", no insert', async () => {
    updateResult = { data: [], error: null };
    readResult = { data: { kit_source: 'college', institution_id: 'inst-A' }, error: null };
    await expect(ImsKitService.addRuleItem({ ...admin, seen_kit_source: null })).rejects.toThrow(
      "This item's kit source was changed by someone else. Reload and try again.",
    );
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it("LOW-6: 0 rows and the item cannot be read -> \"Couldn't read this item\"", async () => {
    updateResult = { data: [], error: null };
    readResult = { data: null, error: null };
    await expect(ImsKitService.addRuleItem(admin)).rejects.toThrow(
      "Couldn't read this item. Reload and try again.",
    );
    readResult = { data: null, error: { message: 'permission denied' } };
    calls.length = 0;
    await expect(ImsKitService.addRuleItem(admin)).rejects.toThrow(
      "Couldn't read this item. Reload and try again.",
    );
  });

  it('LOW-4: rule-item insert fails after marking Central -> puts back the shown value, guarded', async () => {
    insertResult = { error: { message: 'new row violates row-level security policy', code: '42501' } };
    const err = await ImsKitService.addRuleItem({ ...admin, seen_kit_source: null }).catch((e: unknown) => e);
    expect((err as Error).message).toBe('new row violates row-level security policy');
    const updates = calls.filter((c) => c.op === 'update');
    expect(updates.map((u) => u.arg)).toEqual([{ kit_source: 'central' }, { kit_source: null }]);
    expect(updates[1].filters).toEqual([['eq', 'id', 'item-1'], ['eq', 'kit_source', 'central']]);
  });

  it('LOW-4: revert puts back College when the screen showed College', async () => {
    insertResult = { error: { message: 'insert boom' } };
    await expect(ImsKitService.addRuleItem({ ...admin, seen_kit_source: 'college' })).rejects.toThrow('insert boom');
    expect(calls.filter((c) => c.op === 'update').map((u) => u.arg)).toEqual([
      { kit_source: 'central' }, { kit_source: 'college' },
    ]);
  });

  it('LOW-4: revert could not run -> says the item is still Central', async () => {
    insertResult = { error: { message: 'insert boom' } };
    updateQueue = [{ data: [{ id: 'item-1' }], error: null }, { data: [], error: null }];
    await expect(ImsKitService.addRuleItem(admin)).rejects.toThrow(
      /insert boom — and the item is still set to Central store/,
    );
  });

  it('LOW-4: item was already Central (this call changed nothing) -> no revert on insert failure', async () => {
    updateResult = { data: [], error: null };
    readResult = { data: { kit_source: 'central', institution_id: 'inst-A' }, error: null };
    insertResult = { error: { message: 'insert boom' } };
    await expect(ImsKitService.addRuleItem(admin)).rejects.toThrow('insert boom');
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });
});

// #4346 panel round 3 (MEDIUM 1 + 2): the item may already be in this rule.
describe('Central on an item already in the rule (#4346 round 3)', () => {
  const admin = { ...base, kit_source: 'central' as const, caller_role: 'store_admin', seen_kit_source: null };

  it('reset -> Central on an existing rule item keeps Central: no insert, no revert', async () => {
    ruleItemResult = { data: { id: 'ri-1' }, error: null };
    await expect(ImsKitService.addRuleItem(admin)).resolves.toEqual({ alreadyInRule: true });
    expect(writes()).toEqual([{ table: 'ims_items', op: 'update', arg: { kit_source: 'central' } }]);
    const check = calls.find((c) => c.table === 'ims_kit_rule_items' && c.op === 'select')!;
    expect(check.filters).toEqual([['eq', 'rule_id', 'rule-1'], ['eq', 'item_id', 'item-1']]);
  });

  it('23505 on insert (a concurrent add won) -> success "already in this rule", no revert', async () => {
    insertResult = { error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
    await expect(ImsKitService.addRuleItem(admin)).resolves.toEqual({ alreadyInRule: true });
    expect(calls.filter((c) => c.op === 'update').map((u) => u.arg)).toEqual([{ kit_source: 'central' }]);
  });

  it('any other insert error -> reverts as before', async () => {
    insertResult = { error: { message: 'insert boom', code: 'P0001' } };
    await expect(ImsKitService.addRuleItem(admin)).rejects.toThrow('insert boom');
    expect(calls.filter((c) => c.op === 'update').map((u) => u.arg)).toEqual([
      { kit_source: 'central' }, { kit_source: null },
    ]);
  });

  it('a normal add reports alreadyInRule: false', async () => {
    await expect(ImsKitService.addRuleItem(admin)).resolves.toEqual({ alreadyInRule: false });
    expect(writes().at(-1)).toEqual({ table: 'ims_kit_rule_items', op: 'insert', arg: base });
  });
});
