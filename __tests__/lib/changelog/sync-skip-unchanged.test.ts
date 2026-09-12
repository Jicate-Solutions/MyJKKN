/**
 * The daily changelog sync must not rewrite 4,923 rows on a morning when
 * nothing shipped — and must not buy that by weakening anything.
 *
 * WHY A FAKE CLIENT AND NOT A REAL POSTGRES. CI runs this path with no database
 * of any kind, and a test that silently skips without one proves nothing on the
 * only machine that matters. The fake below is not a stub that records calls: it
 * applies the statements it is given, including PARSING THE `DO UPDATE SET` LIST
 * and applying only the columns named there. That is what makes the takedown
 * test real — add `hidden = EXCLUDED.hidden` to the upsert and this file fails,
 * which is exactly the change nobody must be able to make quietly.
 */
import { describe, it, expect } from 'vitest';
import {
  writeChangelog,
  planEntryWrites,
  assignOrdinals,
  fingerprint,
  entryRow,
  ENTRY_COLUMNS,
} from '@/scripts/sync-changelog-db.mjs';

type Row = Record<string, any>;

/** Above FIRST_SEED_FLOOR (1000), so the guards let a run through. */
const SEED = 1200;

/** collectChangelog's entry shape: h sha, d date, t kind, m module, s subject,
 *  a author, p PR number, b breaking. */
const NEWEST_DAY = Date.UTC(2026, 8, 12);
/** Ten entries per day, dates DESCENDING — the shape collectChangelog returns,
 *  and the same-date ties `ordinal` exists to break. */
const dayFor = (i: number) =>
  new Date(NEWEST_DAY - Math.floor(i / 10) * 86_400_000).toISOString().slice(0, 10);

function gitEntries(count = SEED): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    h: `sha${String(i).padStart(9, '0')}`,
    d: dayFor(i),
    t: 'fixed',
    m: 'platform',
    s: `Change number ${i}`,
    a: 'A Person',
    ...(i % 3 === 0 ? { p: 3000 + i } : {}),
    ...(i % 50 === 0 ? { b: 1 } : {}),
  }));
}

const gitModules = () => ({
  platform: { label: 'Platform', perm: null, href: null },
  billing: { label: 'Billing', perm: 'billing.invoices.view', href: '/billing' },
});

/**
 * Enough Postgres to run this script honestly.
 *
 * Only the statements the script issues are understood; anything else throws
 * rather than quietly returning an empty result, so a new statement cannot slip
 * past these tests unexamined.
 */
class FakeDb {
  entries: Row[] = [];
  modules: Row[] = [];
  sync: Row | null = { singleton: true, last_synced_at: null, last_ref: null, entry_count: 0 };
  sql: string[] = [];
  /** Statements that could change a row, in order, with how many rows they touched. */
  writes: { kind: string; rows: number }[] = [];
  failOnEntryInsert = false;

  private record(kind: string, rows: number) {
    this.writes.push({ kind, rows });
  }

  async query(text: string, params: any[] = []) {
    this.sql.push(text.trim());

    if (/^BEGIN|^COMMIT|^ROLLBACK/.test(text.trim())) {
      return { rows: [], rowCount: 0 };
    }

    if (text.includes('to_regclass')) {
      return {
        rows: [{ entries: 'changelog_entries', modules: 'changelog_modules', sync: 'changelog_sync' }],
        rowCount: 1,
      };
    }

    if (text.includes('FILTER (WHERE NOT hidden)')) {
      return {
        rows: [{
          visible: this.entries.filter((e) => !e.hidden).length,
          total: this.entries.length,
        }],
        rowCount: 1,
      };
    }

    if (text.includes('FILTER (WHERE hidden)')) {
      return {
        rows: [{ total: this.entries.length, hidden: this.entries.filter((e) => e.hidden).length }],
        rowCount: 1,
      };
    }

    if (/^SELECT key, label, perm, href FROM public\.changelog_modules/.test(text.trim())) {
      return { rows: this.modules.map((m) => ({ ...m })), rowCount: this.modules.length };
    }

    if (text.includes('FROM public.changelog_entries') && text.includes('WHERE app_key = $1')) {
      const rows = this.entries
        .filter((e) => e.app_key === params[0])
        .map((e) => ({
          sha: e.sha,
          entry_date: e.entry_date, // ::text — a string, never a Date
          kind: e.kind,
          module_key: e.module_key,
          subject: e.subject,
          author: e.author,
          pr_number: e.pr_number,
          breaking: e.breaking,
          ordinal: e.ordinal,
        }));
      return { rows, rowCount: rows.length };
    }

    if (text.includes('INSERT INTO public.changelog_modules')) {
      const [key, label, perm, href] = params;
      const found = this.modules.find((m) => m.key === key);
      if (found) Object.assign(found, { label, perm, href });
      else this.modules.push({ key, label, perm, href });
      this.record('module-upsert', 1);
      return { rows: [], rowCount: 1 };
    }

    if (text.includes('INSERT INTO public.changelog_entries')) {
      if (this.failOnEntryInsert) throw new Error('connection reset mid-write');
      const columns = /INSERT INTO public\.changelog_entries\s*\(([^)]+)\)/
        .exec(text)![1]
        .split(',')
        .map((c) => c.trim());
      // Only the columns actually assigned from EXCLUDED are applied on conflict.
      // `hidden` is absent from that list on purpose; this is where that is proved.
      const setBlock = text.slice(text.indexOf('DO UPDATE'));
      const updatable = new Set(
        [...setBlock.matchAll(/(\w+)\s*=\s*EXCLUDED\.(\w+)/g)].map((m) => m[1])
      );
      let touched = 0;
      for (let i = 0; i < params.length; i += columns.length) {
        const incoming: Row = {};
        columns.forEach((c, n) => { incoming[c] = params[i + n]; });
        const found = this.entries.find(
          (e) => e.app_key === 'myjkkn' && e.sha === incoming.sha
        );
        if (found) {
          for (const c of updatable) found[c] = incoming[c];
        } else {
          this.entries.push({ ...incoming, app_key: 'myjkkn', hidden: false, hidden_reason: null });
        }
        touched += 1;
      }
      this.record('entry-upsert', touched);
      return { rows: [], rowCount: touched };
    }

    if (text.includes('DELETE FROM public.changelog_entries')) {
      const [keep, appKey] = params;
      const keepSet = new Set(keep as string[]);
      const doomed = this.entries.filter(
        (e) => e.app_key === appKey && !e.hidden && !keepSet.has(e.sha)
      );
      this.entries = this.entries.filter((e) => !doomed.includes(e));
      if (doomed.length) this.record('prune', doomed.length);
      return {
        rows: doomed.map((e) => ({ sha: e.sha, entry_date: e.entry_date, subject: e.subject })),
        rowCount: doomed.length,
      };
    }

    if (text.includes('UPDATE public.changelog_sync')) {
      if (!this.sync) return { rows: [], rowCount: 0 };
      Object.assign(this.sync, { last_ref: params[0], entry_count: params[1], last_synced_at: new Date() });
      this.record('sync-stamp', 1);
      return { rows: [], rowCount: 1 };
    }

    if (text.includes('INSERT INTO public.changelog_sync')) {
      this.sync = { singleton: true, last_ref: params[0], entry_count: params[1], last_synced_at: new Date() };
      this.record('sync-stamp', 1);
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`FakeDb was given a statement it does not model:\n${text}`);
  }

  /** Row-changing statements against the two content tables. The singleton sync
   *  stamp is excluded on purpose — it records that the run happened at all, and
   *  "nothing changed today" is a different fact from "nobody looked since
   *  Tuesday". */
  contentWrites() {
    return this.writes.filter((w) => w.kind !== 'sync-stamp');
  }

  reset() {
    this.sql = [];
    this.writes = [];
  }
}

const run = (db: FakeDb, entries: Row[], modules = gitModules()) =>
  writeChangelog({ client: db as any, entries, modules, ref: 'jicate/main' });

describe('a second sync over identical git history', () => {
  it('writes no entry or module row at all', async () => {
    const db = new FakeDb();
    const entries = gitEntries();

    const first = await run(db, entries);
    expect(first).toMatchObject({ read: SEED, unchanged: 0, inserted: SEED, updated: 0, pruned: 0 });
    expect(db.entries).toHaveLength(SEED);

    db.reset();
    const second = await run(db, entries);

    expect(second).toMatchObject({ read: SEED, unchanged: SEED, inserted: 0, updated: 0, pruned: 0 });
    expect(db.contentWrites()).toEqual([]);
    // Not merely "wrote nothing" — no INSERT was even issued.
    expect(db.sql.filter((s) => s.includes('INSERT INTO public.changelog_entries'))).toEqual([]);
    expect(db.sql.filter((s) => s.includes('INSERT INTO public.changelog_modules'))).toEqual([]);
    expect(db.entries).toHaveLength(SEED);
  });

  it('still writes the one entry that did change, and only that one', async () => {
    const db = new FakeDb();
    const entries = gitEntries();
    await run(db, entries);

    db.reset();
    const edited = entries.map((e, i) => (i === 7 ? { ...e, s: 'A corrected subject' } : e));
    const second = await run(db, edited);

    expect(second).toMatchObject({ unchanged: SEED - 1, inserted: 0, updated: 1, pruned: 0 });
    expect(db.contentWrites()).toEqual([{ kind: 'entry-upsert', rows: 1 }]);
    expect(db.entries.find((e) => e.sha === entries[7].h)!.subject).toBe('A corrected subject');
  });

  it('a new commit at the top does not renumber every older entry', async () => {
    // The regression this guards: with a global newest-first index, one commit
    // this morning shifts all 4,922 ordinals below it and the skip saves nothing
    // on any day work actually shipped.
    const db = new FakeDb();
    const entries = gitEntries();
    await run(db, entries);

    db.reset();
    // A commit landing on the day that is already newest — the ordinary case.
    const withNew = [
      { h: 'shaNEW000001', d: dayFor(0), t: 'new', m: 'platform', s: 'Shipped today', a: 'A Person' },
      ...entries,
    ];
    const second = await run(db, withNew);

    expect(second.inserted).toBe(1);
    // Only the ten entries sharing that date shift. Under the old global index
    // this would have been all 1,199.
    expect(second.updated).toBe(10);
    expect(second.unchanged).toBe(SEED - 10);
  });
});

describe('invariant 1 — the takedown guarantee', () => {
  it('a hidden entry stays hidden through an identical re-sync', async () => {
    const db = new FakeDb();
    const entries = gitEntries();
    await run(db, entries);

    const victim = db.entries.find((e) => e.sha === entries[3].h)!;
    victim.hidden = true;
    victim.hidden_reason = 'named a learner';

    await run(db, entries);

    const after = db.entries.find((e) => e.sha === entries[3].h)!;
    expect(after.hidden).toBe(true);
    expect(after.hidden_reason).toBe('named a learner');
  });

  it('a hidden entry stays hidden even when its content DID change and was rewritten', async () => {
    const db = new FakeDb();
    const entries = gitEntries();
    await run(db, entries);

    const victim = db.entries.find((e) => e.sha === entries[3].h)!;
    victim.hidden = true;
    victim.hidden_reason = 'named a learner';

    db.reset();
    const edited = entries.map((e, i) => (i === 3 ? { ...e, s: 'Rewritten by a rule change' } : e));
    const result = await run(db, edited);

    expect(result.updated).toBe(1);
    const after = db.entries.find((e) => e.sha === entries[3].h)!;
    expect(after.subject).toBe('Rewritten by a rule change');
    expect(after.hidden).toBe(true);
    expect(after.hidden_reason).toBe('named a learner');
  });

  it('the upsert never assigns hidden or hidden_reason from EXCLUDED', async () => {
    const db = new FakeDb();
    await run(db, gitEntries());
    const upsert = db.sql.find((s) => s.includes('INSERT INTO public.changelog_entries'))!;
    const setBlock = upsert.slice(upsert.indexOf('DO UPDATE'));
    expect(setBlock).not.toMatch(/hidden\s*=/);
    expect(setBlock).not.toMatch(/hidden_reason\s*=/);
  });
});

describe('invariant 2 — the prune guard', () => {
  it('still removes an entry the rules no longer produce', async () => {
    const db = new FakeDb();
    const entries = gitEntries();
    await run(db, entries);

    const dropped = entries[5].h;
    const result = await run(db, entries.filter((_, i) => i !== 5));

    expect(result.pruned).toBe(1);
    expect(db.entries.some((e) => e.sha === dropped)).toBe(false);
  });

  it('never deletes a hidden row that fell out of git', async () => {
    const db = new FakeDb();
    const entries = gitEntries();
    await run(db, entries);

    const kept = db.entries.find((e) => e.sha === entries[5].h)!;
    kept.hidden = true;

    const result = await run(db, entries.filter((_, i) => i !== 5));

    expect(result.pruned).toBe(0);
    expect(db.entries.some((e) => e.sha === entries[5].h)).toBe(true);
  });

  it('is compared against git\'s FULL sha list, not the changed rows', async () => {
    // The failure this exists for: prune against the skip's short list and the
    // first quiet morning deletes the whole changelog.
    const db = new FakeDb();
    const entries = gitEntries();
    await run(db, entries);

    db.reset();
    const result = await run(db, entries);

    expect(result.pruned).toBe(0);
    expect(db.entries).toHaveLength(SEED);
  });

  it('runs after the floor guard — a short read reaches no statement at all', async () => {
    const db = new FakeDb();
    const entries = gitEntries();
    await run(db, entries);

    db.reset();
    const result = await run(db, entries.slice(0, 40)); // below FIRST_SEED_FLOOR

    expect(result).toBeNull();
    expect(db.sql.some((s) => s.startsWith('BEGIN'))).toBe(false);
    expect(db.sql.some((s) => s.includes('DELETE FROM'))).toBe(false);
    expect(db.entries).toHaveLength(SEED);
    process.exitCode = 0; // fail() sets it; this test asserted the refusal deliberately
  });

  it('runs after the staleness guard — an 80% read reaches no statement at all', async () => {
    const db = new FakeDb();
    const entries = gitEntries();
    await run(db, entries);

    db.reset();
    const result = await run(db, entries.slice(0, Math.floor(SEED * 0.8)));

    expect(result).toBeNull();
    expect(db.sql.some((s) => s.startsWith('BEGIN'))).toBe(false);
    expect(db.entries).toHaveLength(SEED);
    process.exitCode = 0;
  });
});

describe('invariant 3 — one transaction', () => {
  it('every row-changing statement sits between exactly one BEGIN and one COMMIT', async () => {
    const db = new FakeDb();
    await run(db, gitEntries());

    const begins = db.sql.filter((s) => s.startsWith('BEGIN'));
    const commits = db.sql.filter((s) => s.startsWith('COMMIT'));
    expect(begins).toHaveLength(1);
    expect(commits).toHaveLength(1);

    const begin = db.sql.findIndex((s) => s.startsWith('BEGIN'));
    const commit = db.sql.findIndex((s) => s.startsWith('COMMIT'));
    db.sql.forEach((s, i) => {
      if (/INSERT INTO|DELETE FROM|UPDATE public/.test(s)) {
        expect({ statement: s.slice(0, 40), inside: i > begin && i < commit })
          .toEqual({ statement: s.slice(0, 40), inside: true });
      }
    });
  });

  it('a mid-write failure rolls back and never commits', async () => {
    const db = new FakeDb();
    db.failOnEntryInsert = true;

    const result = await run(db, gitEntries());

    expect(result).toBeNull();
    expect(db.sql.filter((s) => s.startsWith('COMMIT'))).toHaveLength(0);
    expect(db.sql.filter((s) => s.startsWith('ROLLBACK'))).toHaveLength(1);
    expect(db.entries).toHaveLength(0);
    process.exitCode = 0;
  });

  it('reads what is already stored INSIDE the transaction', async () => {
    // Comparing before BEGIN lets a concurrent run change a row between the
    // comparison and the write, and the skip then correctly decides there is
    // nothing to do about a row that no longer looks like that.
    const db = new FakeDb();
    await run(db, gitEntries());

    const begin = db.sql.findIndex((s) => s.startsWith('BEGIN'));
    const compare = db.sql.findIndex((s) => s.includes('WHERE app_key = $1'));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(compare).toBeGreaterThan(begin);
  });
});

describe('the fingerprint', () => {
  const base = { h: 'abc123abc123', d: '2026-09-12', t: 'fixed', m: 'billing', s: 'A thing', a: 'A Person' };

  it('covers every column the upsert can set — none is silently uncorrectable', async () => {
    const changes: Record<string, Row> = {
      entry_date: { ...base, d: '2026-09-11' },
      kind: { ...base, t: 'new' },
      module_key: { ...base, m: 'platform' },
      subject: { ...base, s: 'A different thing' },
      author: { ...base, a: 'Someone Else' },
      pr_number: { ...base, p: 4242 },
      breaking: { ...base, b: 1 },
    };
    const before = fingerprint(entryRow(base, 0), ENTRY_COLUMNS);
    for (const [column, edited] of Object.entries(changes)) {
      expect({ column, same: fingerprint(entryRow(edited, 0), ENTRY_COLUMNS) === before })
        .toEqual({ column, same: false });
    }
    // ordinal is the eighth; a move within its date must also be written
    expect(fingerprint(entryRow(base, 1), ENTRY_COLUMNS)).not.toBe(before);
  });

  it('treats a driver-parsed date the same as the ISO day', () => {
    // node-postgres parses `date` into a JS Date at LOCAL midnight. Reading that
    // back through toISOString() east of UTC gives the PREVIOUS day, which would
    // make every row look changed on every run — in IST only, so every test in a
    // UTC runner would still pass.
    const asText = { sha: 'x', entry_date: '2026-09-12', kind: 'fixed', module_key: 'm',
      subject: 's', author: 'a', pr_number: null, breaking: false, ordinal: 0 };
    const asDate = { ...asText, entry_date: new Date(2026, 8, 12) };
    expect(fingerprint(asDate, ENTRY_COLUMNS)).toBe(fingerprint(asText, ENTRY_COLUMNS));
  });

  it('treats an integer that came back as text the same as the number', () => {
    const asNumber = { sha: 'x', entry_date: '2026-09-12', kind: 'fixed', module_key: 'm',
      subject: 's', author: 'a', pr_number: 42, breaking: false, ordinal: 3 };
    const asText = { ...asNumber, pr_number: '42', ordinal: '3' };
    expect(fingerprint(asText, ENTRY_COLUMNS)).toBe(fingerprint(asNumber, ENTRY_COLUMNS));
  });
});

describe('assignOrdinals', () => {
  it('numbers from zero within each date, in git order', () => {
    const rows = assignOrdinals([
      { h: 'a', d: '2026-09-12', t: 'fixed', m: 'p', s: '1', a: 'x' },
      { h: 'b', d: '2026-09-12', t: 'fixed', m: 'p', s: '2', a: 'x' },
      { h: 'c', d: '2026-09-11', t: 'fixed', m: 'p', s: '3', a: 'x' },
      { h: 'd', d: '2026-09-12', t: 'fixed', m: 'p', s: '4', a: 'x' },
    ]);
    expect(rows.map((r) => [r.sha, r.entry_date, r.ordinal])).toEqual([
      ['a', '2026-09-12', 0],
      ['b', '2026-09-12', 1],
      ['c', '2026-09-11', 0],
      ['d', '2026-09-12', 2],
    ]);
  });

  it('preserves the rendered order — (entry_date DESC, ordinal ASC) is unchanged', () => {
    const entries = gitEntries(60);
    const rows = assignOrdinals(entries);
    const sorted = [...rows].sort(
      (x, y) => (x.entry_date < y.entry_date ? 1 : x.entry_date > y.entry_date ? -1 : x.ordinal - y.ordinal)
    );
    expect(sorted.map((r) => r.sha)).toEqual(entries.map((e) => e.h));
  });
});

describe('planEntryWrites', () => {
  it('reports read, unchanged, new and changed honestly', () => {
    const entries = gitEntries(30);
    const stored = new Map(
      assignOrdinals(entries).slice(0, 20).map((r) => [r.sha, fingerprint(r, ENTRY_COLUMNS)])
    );
    // Corrupt one stored fingerprint so it reads as changed.
    stored.set(entries[0].h, 'not-the-same-fingerprint');

    const plan = planEntryWrites(entries, stored);
    expect({ unchanged: plan.unchanged, inserted: plan.inserted, updated: plan.updated })
      .toEqual({ unchanged: 19, inserted: 10, updated: 1 });
    expect(plan.toWrite).toHaveLength(11);
  });
});
