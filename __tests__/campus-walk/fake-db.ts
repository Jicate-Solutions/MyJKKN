// __tests__/campus-walk/fake-db.ts
// ============================================================================
// A tiny chainable stand-in for the Supabase query builder, shared by the
// Campus Walk closure / fix / not-fixed tests. Every query is recorded (table,
// operation, payload, filters) so a test can assert exactly WHAT was written
// and under WHICH compare-and-set filter, and a single `respond` callback
// decides what each query returns.
//
// Not a test file itself (no `.test.` in the name), so vitest never collects it.
// ============================================================================

export type Terminal = 'many' | 'maybeSingle' | 'single';

export interface RecordedQuery {
  table: string;
  op: 'select' | 'update' | 'insert';
  payload: any;
  filters: Array<[string, unknown]>;
  terminal: Terminal | null;
}

export type Respond = (q: RecordedQuery) => { data?: any; error?: any; count?: number | null };

export function makeFakeDb(respond: Respond) {
  const queries: RecordedQuery[] = [];
  const uploads: Array<{ path: string }> = [];

  function builder(table: string) {
    const q: RecordedQuery = { table, op: 'select', payload: null, filters: [], terminal: null };
    queries.push(q);
    const run = (terminal: Terminal) => {
      q.terminal = terminal;
      const r = respond(q) ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null });
    };
    const b: any = {
      select: () => b,
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
      eq: (c: string, v: unknown) => {
        q.filters.push([c, v]);
        return b;
      },
      in: () => b,
      not: () => b,
      lt: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => run('maybeSingle'),
      single: () => run('single'),
      then: (res: any, rej: any) => run('many').then(res, rej),
    };
    return b;
  }

  const db = {
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push({ path });
          return { error: null };
        },
        createSignedUrls: async () => ({ data: [], error: null }),
      }),
    },
  };

  return { db, queries, uploads };
}

/** The filter value a query applied to a column, or undefined. */
export function filterOf(q: RecordedQuery, column: string): unknown {
  return q.filters.find(([c]) => c === column)?.[1];
}
