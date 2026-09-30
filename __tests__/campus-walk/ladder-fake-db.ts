// __tests__/campus-walk/ladder-fake-db.ts
// ============================================================================
// A chainable stand-in for the Supabase query builder for the chase-up ladder
// and the Director's morning summary. Records every query — table, operation,
// payload, and every eq / in / not / lt filter — and lets one `respond`
// callback decide what each returns. Kept separate from fake-db.ts (#4133's)
// because the ladder uses `.in()`, `.delete()` and ordering that one ignores.
//
// Not a test file itself (no `.test.` in the name), so vitest never collects it.
// ============================================================================

export interface LadderQuery {
  table: string;
  op: 'select' | 'update' | 'insert' | 'delete';
  columns: string | null;
  payload: any;
  filters: Array<[string, string, unknown]>;
}

export type LadderRespond = (q: LadderQuery) => { data?: any; error?: any } | undefined;

export function makeLadderDb(respond: LadderRespond) {
  const queries: LadderQuery[] = [];

  function builder(table: string) {
    const q: LadderQuery = { table, op: 'select', columns: null, payload: null, filters: [] };
    queries.push(q);
    const run = () => {
      const r = respond(q) ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    };
    const b: any = {
      select: (cols?: string) => {
        if (q.op === 'select') q.columns = cols ?? '*';
        return b;
      },
      update: (p: any) => {
        q.op = 'update';
        q.payload = p;
        return b;
      },
      insert: (p: any) => {
        q.op = 'insert';
        q.payload = p;
        return b;
      },
      delete: () => {
        q.op = 'delete';
        return b;
      },
      eq: (c: string, v: unknown) => {
        q.filters.push(['eq', c, v]);
        return b;
      },
      in: (c: string, v: unknown) => {
        q.filters.push(['in', c, v]);
        return b;
      },
      not: (c: string, op: string, v: unknown) => {
        q.filters.push(['not', c, `${op} ${String(v)}`]);
        return b;
      },
      lt: (c: string, v: unknown) => {
        q.filters.push(['lt', c, v]);
        return b;
      },
      order: () => b,
      limit: () => b,
      maybeSingle: () => run(),
      single: () => run(),
      then: (res: any, rej: any) => run().then(res, rej),
    };
    return b;
  }

  return { db: { from: (t: string) => builder(t) } as any, queries };
}

/** The value a query filtered a column on with the given operator, or undefined. */
export function filterValue(q: LadderQuery, op: string, column: string): unknown {
  return q.filters.find(([o, c]) => o === op && c === column)?.[2];
}
