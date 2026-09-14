/**
 * One script, one table, many applications — and the ways that goes wrong.
 *
 * The changelog table was re-keyed on (app_key, sha) on 2026-09-07 so it could
 * hold more than one repository's history; the writer stayed hardwired to
 * `myjkkn` until 2026-09-13. This file is about the day that changed.
 *
 * THE ONE PROPERTY THAT MATTERS MOST is the first block: syncing application B
 * must not touch application A's rows. The prune is a DELETE scoped by a
 * parameter, and an unscoped or mis-scoped one reads as "delete every entry I
 * did not just write" — it would take out another application's entire archive
 * inside a transaction that then COMMITS and reports success. There is no error
 * to notice, no exception to catch, and no copy of the rows anywhere else.
 *
 * WHY A FAKE CLIENT AND NOT A REAL POSTGRES — the same reason as
 * sync-skip-unchanged.test.ts beside it: CI runs this path with no database of
 * any kind, and a test that skips without one proves nothing on the only machine
 * that matters. The fake below APPLIES the statements it is given — it parses the
 * DO UPDATE list, honours the DELETE's app_key and start-date predicates, and
 * stores app_key from the parameters rather than assuming it. A fake that assumed
 * the app key would make every assertion here vacuous.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  writeChangelog,
  resolveAppKey,
  applyStartDate,
  profileFor,
  APP_PROFILES,
  DEFAULT_APP_KEY,
} from '@/scripts/sync-changelog-db.mjs';

type Row = Record<string, any>;

type GitEntry = {
  h: string;
  d: string;
  at?: string | null;
  t?: string;
  m?: string;
  s?: string;
  a?: string;
  l?: string | null;
  p?: number;
  b?: number | boolean;
};

/** Comfortably over MyJKKN's own first-seed floor of 1,000. */
const MYJKKN_SEED = 1100;

const NEWEST_DAY = Date.UTC(2026, 8, 12);
const dayFor = (i: number) =>
  new Date(NEWEST_DAY - Math.floor(i / 10) * 86_400_000).toISOString().slice(0, 10);

/** A history in the shape collectChangelog emits: newest first, ten a day. */
function history(prefix: string, count: number, startAt = 0): GitEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    h: `${prefix}${String(i + startAt).padStart(9, '0')}`,
    d: dayFor(i + startAt),
    t: 'fixed',
    m: 'platform',
    s: `${prefix} change ${i + startAt}`,
    a: 'A Person',
  }));
}

const gitModules = () => ({
  platform: { label: 'Platform', perm: null, href: null },
  billing: { label: 'Billing', perm: 'billing.invoices.view', href: '/billing' },
});

/**
 * Enough Postgres to run this script honestly, with app_key taken seriously.
 *
 * Unknown statements throw rather than returning an empty result, so a new
 * statement cannot slip past these tests unexamined.
 */
class FakeDb {
  entries: Row[] = [];
  modules: Row[] = [];
  sync: Row | null = { singleton: true, last_synced_at: null, last_ref: null, entry_count: 0 };
  sql: string[] = [];
  syncStamps = 0;

  async query(text: string, params: any[] = []) {
    const stmt = text.trim();
    this.sql.push(stmt);

    if (/^BEGIN|^COMMIT|^ROLLBACK/.test(stmt)) return { rows: [], rowCount: 0 };

    if (stmt.includes('to_regclass')) {
      return {
        rows: [{ entries: 'changelog_entries', modules: 'changelog_modules', sync: 'changelog_sync' }],
        rowCount: 1,
      };
    }

    // The per-app row count that feeds the staleness ratio. Scoped here because
    // it is scoped in the statement — model it unscoped and the regression this
    // file exists to catch (MyJKKN aborting once siblings hold 11% of the table)
    // would pass silently.
    if (stmt.includes('FILTER (WHERE hidden)')) {
      const mine = this.entries.filter((e) => e.app_key === params[0]);
      return {
        rows: [{ total: mine.length, hidden: mine.filter((e) => e.hidden).length }],
        rowCount: 1,
      };
    }

    // The platform-wide visible count for the freshness stamp — every app.
    if (stmt.includes('FILTER (WHERE NOT hidden)')) {
      return {
        rows: [{
          visible: this.entries.filter((e) => !e.hidden).length,
          total: this.entries.length,
        }],
        rowCount: 1,
      };
    }

    if (/^SELECT key, label, perm, href FROM public\.changelog_modules/.test(stmt)) {
      return { rows: this.modules.map((m) => ({ ...m })), rowCount: this.modules.length };
    }

    if (stmt.includes('FROM public.changelog_entries') && stmt.includes('WHERE app_key = $1')) {
      const rows = this.entries
        .filter((e) => e.app_key === params[0])
        .map((e) => ({ ...e }));
      return { rows, rowCount: rows.length };
    }

    if (stmt.includes('INSERT INTO public.changelog_modules')) {
      const [key, label, perm, href] = params;
      const found = this.modules.find((m) => m.key === key);
      // Only DO UPDATE rewrites an existing row. DO NOTHING is the whole point of
      // the guard that stops a sibling application redefining a module's
      // permission namespace, so the fake has to tell the two apart.
      if (found) {
        if (stmt.includes('DO UPDATE')) Object.assign(found, { label, perm, href });
      } else {
        this.modules.push({ key, label, perm, href });
      }
      return { rows: [], rowCount: 1 };
    }

    if (stmt.includes('INSERT INTO public.changelog_entries')) {
      const columns = /INSERT INTO public\.changelog_entries\s*\(([^)]+)\)/
        .exec(stmt)![1]
        .split(',')
        .map((c) => c.trim());
      const setBlock = stmt.slice(stmt.indexOf('DO UPDATE'));
      const updatable = new Set(
        [...setBlock.matchAll(/(\w+)\s*=\s*EXCLUDED\.(\w+)/g)].map((m) => m[1])
      );
      let touched = 0;
      for (let i = 0; i < params.length; i += columns.length) {
        const incoming: Row = {};
        columns.forEach((c, n) => { incoming[c] = params[i + n]; });
        // app_key comes from the STATEMENT, never from an assumption. The
        // conflict target is the pair, so a sha may legitimately exist twice.
        const found = this.entries.find(
          (e) => e.app_key === incoming.app_key && e.sha === incoming.sha
        );
        if (found) for (const c of updatable) found[c] = incoming[c];
        else this.entries.push({ ...incoming, hidden: false, hidden_reason: null });
        touched += 1;
      }
      return { rows: [], rowCount: touched };
    }

    if (stmt.includes('DELETE FROM public.changelog_entries')) {
      const [keep, appKey, startDate] = params as [string[], string, string | null];
      const keepSet = new Set(keep);
      const doomed = this.entries.filter(
        (e) => e.app_key === appKey
          && !e.hidden
          && !keepSet.has(e.sha)
          // The start-date fence, modelled because the safety claim rests on it.
          && (startDate == null || String(e.entry_date) >= startDate)
      );
      this.entries = this.entries.filter((e) => !doomed.includes(e));
      return {
        rows: doomed.map((e) => ({ sha: e.sha, entry_date: e.entry_date, subject: e.subject })),
        rowCount: doomed.length,
      };
    }

    if (stmt.includes('UPDATE public.changelog_sync')) {
      this.syncStamps += 1;
      if (!this.sync) return { rows: [], rowCount: 0 };
      Object.assign(this.sync, { last_ref: params[0], entry_count: params[1], last_synced_at: new Date() });
      return { rows: [], rowCount: 1 };
    }

    if (stmt.includes('INSERT INTO public.changelog_sync')) {
      this.syncStamps += 1;
      this.sync = { singleton: true, last_ref: params[0], entry_count: params[1], last_synced_at: new Date() };
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`FakeDb was given a statement it does not model:\n${stmt}`);
  }

  of(appKey: string) {
    return this.entries.filter((e) => e.app_key === appKey);
  }
}

const run = (
  db: FakeDb,
  entries: GitEntry[],
  appKey?: string,
  modules: Record<string, any> = gitModules(),
) => writeChangelog({ client: db as any, entries, modules, ref: 'jicate/main', appKey });

/** The registry is code. A test app is added for the duration of the file and
 *  removed again, so nothing here can leave a second writer registered in the
 *  shipped list by accident. */
const LIBRARY = 'library';
const LIBRARY_PROFILE = { firstSeedFloor: 20, startDate: null };

beforeEach(() => {
  (APP_PROFILES as Record<string, any>)[LIBRARY] = { ...LIBRARY_PROFILE };
});
afterEach(() => {
  delete (APP_PROFILES as Record<string, any>)[LIBRARY];
  // fail() sets a non-zero exit code; the refusal tests below expect that and
  // must not leave the whole suite marked failed.
  process.exitCode = 0;
});

describe('one application syncing cannot touch another application\'s rows', () => {
  it('leaves every one of the first app\'s entries exactly as it found them', async () => {
    const db = new FakeDb();
    const myjkkn = history('mj', MYJKKN_SEED);
    await run(db, myjkkn, 'myjkkn');
    expect(db.of('myjkkn')).toHaveLength(MYJKKN_SEED);

    // A snapshot deep enough that a rewrite, and not only a deletion, would show.
    const beforeRows = db.of('myjkkn').map((e) => JSON.stringify(e)).sort();

    const library = history('lib', 40);
    const second = await run(db, library, LIBRARY);

    expect(second).toMatchObject({ appKey: LIBRARY, inserted: 40, pruned: 0 });
    expect(db.of(LIBRARY)).toHaveLength(40);
    expect(db.of('myjkkn')).toHaveLength(MYJKKN_SEED);
    expect(db.of('myjkkn').map((e) => JSON.stringify(e)).sort()).toEqual(beforeRows);
  });

  it('and the first app\'s next sync does not delete the second app\'s rows either', async () => {
    const db = new FakeDb();
    await run(db, history('mj', MYJKKN_SEED), 'myjkkn');
    await run(db, history('lib', 40), LIBRARY);

    // MyJKKN runs the next morning over a history that knows nothing of the
    // library. Unscoped, its prune would read "delete everything I did not just
    // write" and take all 40 library rows with it.
    const again = await run(db, history('mj', MYJKKN_SEED), 'myjkkn');

    expect(again).toMatchObject({ pruned: 0, unchanged: MYJKKN_SEED });
    expect(db.of(LIBRARY)).toHaveLength(40);
  });

  it('prunes only its own withdrawn entries, never the other app\'s', async () => {
    const db = new FakeDb();
    const myjkkn = history('mj', MYJKKN_SEED);
    await run(db, myjkkn, 'myjkkn');
    await run(db, history('lib', 40), LIBRARY);

    // A rule tightens and MyJKKN's history legitimately loses its ten newest
    // entries — still inside the 90% staleness tolerance.
    const trimmed = myjkkn.slice(10);
    const after = await run(db, trimmed, 'myjkkn');

    expect(after).toMatchObject({ pruned: 10 });
    expect(db.of('myjkkn')).toHaveLength(MYJKKN_SEED - 10);
    expect(db.of(LIBRARY)).toHaveLength(40);
  });

  it('writes app_key explicitly rather than leaning on the column default', async () => {
    const db = new FakeDb();
    await run(db, history('lib', 40), LIBRARY);

    const insert = db.sql.find((s) => s.includes('INSERT INTO public.changelog_entries'))!;
    expect(insert).toContain('(app_key, sha,');
    // Left to the DEFAULT, every one of these rows would have landed in
    // MyJKKN's slice and been pruned by MyJKKN's next sync.
    expect(db.of(LIBRARY)).toHaveLength(40);
    expect(db.of('myjkkn')).toHaveLength(0);
  });
});

describe('the default path — what the live daily job does', () => {
  it('is MyJKKN when nothing names an application', async () => {
    expect(DEFAULT_APP_KEY).toBe('myjkkn');
    expect(resolveAppKey([], {})).toBe('myjkkn');

    const db = new FakeDb();
    const result = await run(db, history('mj', MYJKKN_SEED));

    expect(result).toMatchObject({ appKey: 'myjkkn', inserted: MYJKKN_SEED, heldBack: 0 });
    expect(db.of('myjkkn')).toHaveLength(MYJKKN_SEED);
  });

  it('still writes the freshness stamp, and a joining app does not', async () => {
    const db = new FakeDb();
    await run(db, history('mj', MYJKKN_SEED));
    expect(db.syncStamps).toBe(1);
    expect(db.sync!.last_ref).toBe('jicate/main');

    // changelog_sync is one row by construction. If every app stamped it,
    // "last synced" would mean "whichever app ran most recently".
    await run(db, history('lib', 40), LIBRARY);
    expect(db.syncStamps).toBe(1);
  });

  it('takes the flag over the environment, and the environment over the default', () => {
    expect(resolveAppKey(['--app-key=library'], { CHANGELOG_APP_KEY: 'other' })).toBe('library');
    expect(resolveAppKey([], { CHANGELOG_APP_KEY: 'library' })).toBe('library');
  });

  it('refuses an app key that is not a plain lower-case token', () => {
    expect(resolveAppKey([], { CHANGELOG_APP_KEY: 'My JKKN' })).toBeNull();
    expect(resolveAppKey([], { CHANGELOG_APP_KEY: 'a' })).toBeNull();
    expect(resolveAppKey([], { CHANGELOG_APP_KEY: '9lives' })).toBeNull();
    process.exitCode = 0;
  });
});

describe('the first-seed floor relaxes per app and is never removed', () => {
  it('still refuses a short MyJKKN history — the 4,957 entries stay protected', async () => {
    const db = new FakeDb();
    const result = await run(db, history('mj', 999), 'myjkkn');

    expect(result).toBeNull();
    expect(db.entries).toHaveLength(0);
    expect(profileFor('myjkkn')!.firstSeedFloor).toBe(1000);
  });

  it('accepts a small application that declares a small floor', async () => {
    const db = new FakeDb();
    const result = await run(db, history('lib', 40), LIBRARY);

    expect(result).toMatchObject({ inserted: 40 });
  });

  it('refuses that same application below ITS OWN floor', async () => {
    const db = new FakeDb();
    const result = await run(db, history('lib', 19), LIBRARY);

    expect(result).toBeNull();
    expect(db.entries).toHaveLength(0);
  });

  it('refuses an application that is not registered at all', async () => {
    const db = new FakeDb();
    const result = await run(db, history('gh', 40), 'ghost');

    // Not defaulted to MyJKKN. A typo that fell back to the default would write
    // a sibling's history into MyJKKN's slice and prune MyJKKN's own entries.
    expect(result).toBeNull();
    expect(db.entries).toHaveLength(0);
    expect(profileFor('ghost')).toBeNull();
  });
});

describe('the staleness ratio counts one app\'s slice, not the whole table', () => {
  it('lets MyJKKN sync even when other applications hold most of the rows', async () => {
    const db = new FakeDb();
    await run(db, history('mj', MYJKKN_SEED), 'myjkkn');

    // A sibling large enough that MyJKKN is a minority of the table. Counted
    // unscoped, MyJKKN's 1,100 would be 27% of 4,100 — far below the 90% floor —
    // and its own sync would abort, every morning, forever.
    (APP_PROFILES as Record<string, any>).library = { firstSeedFloor: 20, startDate: null };
    await run(db, history('lib', 3000), LIBRARY);
    expect(db.entries.length).toBe(MYJKKN_SEED + 3000);

    const again = await run(db, history('mj', MYJKKN_SEED), 'myjkkn');
    expect(again).toMatchObject({ unchanged: MYJKKN_SEED, pruned: 0 });
  });
});

describe('a joining application brings only what happened after it joined', () => {
  // dayFor(0) is the newest day and each ten entries step back one day, so
  // entries 0-99 fall on or after this date and entries 100+ fall before it.
  const JOINED = dayFor(90);

  beforeEach(() => {
    (APP_PROFILES as Record<string, any>)[LIBRARY] = { firstSeedFloor: 20, startDate: JOINED };
  });

  it('ingests the changes from its joining day onward and holds back the rest', async () => {
    const db = new FakeDb();
    const result = await run(db, history('lib', 400), LIBRARY);

    expect(result).toMatchObject({ read: 100, inserted: 100, heldBack: 300 });
    expect(db.of(LIBRARY)).toHaveLength(100);
    for (const row of db.of(LIBRARY)) {
      expect(String(row.entry_date) >= JOINED).toBe(true);
    }
  });

  it('never deletes rows from before the joining day, whatever git says', async () => {
    // The dangerous shape: an app already holds older rows — imported before a
    // start date was set, or backfilled by hand — and then a start date arrives.
    // Without the prune's own date fence, "we only take it from Friday" becomes
    // "we threw away everything before Friday".
    const db = new FakeDb();
    db.entries.push({
      app_key: LIBRARY, sha: 'libANCIENT01', entry_date: dayFor(300), entry_at: null,
      kind: 'fixed', module_key: 'platform', subject: 'Long before it joined',
      author: 'A Person', href: null, pr_number: null, breaking: false, ordinal: 0,
      hidden: false, hidden_reason: null,
    });

    const result = await run(db, history('lib', 400), LIBRARY);

    expect(result).toMatchObject({ pruned: 0 });
    expect(db.of(LIBRARY).some((e) => e.sha === 'libANCIENT01')).toBe(true);
  });

  it('the floor is measured against what it may publish, not what git holds', async () => {
    // 400 commits in git, but only the 100 from the joining day onward are the
    // app's to publish. A floor checked against 400 would wave through an app
    // whose in-window history is empty.
    const db = new FakeDb();
    (APP_PROFILES as Record<string, any>)[LIBRARY] = { firstSeedFloor: 200, startDate: JOINED };
    const result = await run(db, history('lib', 400), LIBRARY);

    expect(result).toBeNull();
    expect(db.entries).toHaveLength(0);
  });

  it('applyStartDate keeps the boundary day itself', () => {
    const entries = history('lib', 400);
    const { writable, excluded } = applyStartDate(entries, JOINED);

    expect(writable.some((e) => e.d === JOINED)).toBe(true);
    expect(writable.every((e) => e.d >= JOINED)).toBe(true);
    expect(excluded).toBe(entries.length - writable.length);
    // A null start date is "everything", which is MyJKKN's case.
    expect(applyStartDate(entries, null).writable).toHaveLength(400);
  });
});

describe('the shared module dictionary', () => {
  it('is not rewritten by a joining application — a collision is not a permissions change', async () => {
    const db = new FakeDb();
    await run(db, history('mj', MYJKKN_SEED), 'myjkkn');

    const billingBefore = { ...db.modules.find((m) => m.key === 'billing')! };
    expect(billingBefore.perm).toEqual(['billing.invoices.view']);

    // A sibling whose own "billing" area means something entirely different.
    // changelog_modules is keyed by `key` alone and `perm` is the namespace
    // fn_changelog_visible_modules() gates on, so a DO UPDATE here would change
    // who can see MyJKKN's Billing news — through a CI job nobody is watching.
    await run(db, history('lib', 40), LIBRARY, {
      platform: { label: 'Platform', perm: null, href: null },
      billing: { label: 'Fines and Fees', perm: 'library.fines.view', href: '/library/fines' },
    });

    expect(db.modules.find((m) => m.key === 'billing')).toEqual(billingBefore);
  });

  it('but MyJKKN can still correct its own module labels', async () => {
    const db = new FakeDb();
    await run(db, history('mj', MYJKKN_SEED), 'myjkkn');

    await run(db, history('mj', MYJKKN_SEED), 'myjkkn', {
      platform: { label: 'Platform', perm: null, href: null },
      billing: { label: 'Billing and Receipts', perm: 'billing.invoices.view', href: '/billing' },
    });

    expect(db.modules.find((m) => m.key === 'billing')!.label).toBe('Billing and Receipts');
  });

  it('a joining application can still add a module of its own', async () => {
    const db = new FakeDb();
    await run(db, history('mj', MYJKKN_SEED), 'myjkkn');

    await run(db, history('lib', 40), LIBRARY, {
      platform: { label: 'Platform', perm: null, href: null },
      circulation: { label: 'Circulation', perm: null, href: null },
    });

    expect(db.modules.find((m) => m.key === 'circulation')).toBeTruthy();
  });
});

describe('the takedown guarantee survives the change', () => {
  it('a hidden row is still never un-hidden, and still never pruned', async () => {
    const db = new FakeDb();
    const library = history('lib', 40);
    await run(db, library, LIBRARY);

    const target = db.of(LIBRARY).find((e) => e.sha === library[3].h)!;
    target.hidden = true;
    target.hidden_reason = 'named a person';

    // The entry falls out of git entirely, and its subject changes in the parse.
    const withoutIt = library.filter((_, i) => i !== 3);
    await run(db, withoutIt, LIBRARY);

    const still = db.of(LIBRARY).find((e) => e.sha === library[3].h);
    expect(still).toBeTruthy();
    expect(still!.hidden).toBe(true);
    expect(still!.hidden_reason).toBe('named a person');
  });
});
