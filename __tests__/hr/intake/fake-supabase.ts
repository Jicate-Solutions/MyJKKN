/**
 * A small in-memory stand-in for the supabase-js query builder and storage,
 * covering exactly what the intake service calls. It does NOT model RLS — the
 * policies are proven against real PostgreSQL in intake-schema.pg.test.ts.
 */
import { randomUUID } from 'crypto';

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type Failure = { code?: string; message: string };

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isNullish = (v: unknown) => v === null || v === undefined;

function likeToRegex(pattern: string): RegExp {
  const esc = pattern.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}

function orFilter(expr: string): Filter {
  const parts = expr.split(',').map((p) => {
    const [col, op, ...rest] = p.split('.');
    const value = rest.join('.');
    return (r: Row) => {
      const v = r[col];
      if (op === 'is') return value === 'null' ? isNullish(v) : String(v) === value;
      if (op === 'eq') return String(v) === value;
      if (op === 'lt') return !isNullish(v) && String(v) < value;
      if (op === 'ilike') return !isNullish(v) && likeToRegex(value).test(String(v));
      throw new Error(`fake or(): unsupported op ${op}`);
    };
  });
  return (r) => parts.some((f) => f(r));
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  /** `${table}.${op}` -> error returned once. */
  failures = new Map<string, Failure>();
  /** `${table}.${op}` -> the write is APPLIED, then this error is returned once (a lost reply). */
  lostReplies = new Map<string, Failure>();
  log: string[] = [];
  signedUploadOpts: { path: string; upsert: boolean | undefined }[] = [];
  /** Called after every update that changed rows: lets a test interleave another request. */
  afterUpdate: ((table: string, patch: unknown) => void) | null = null;
  /** Rows the SESSION client cannot read (a stand-in for RLS on that table); the service role reads all. */
  sessionHides: ((table: string, row: Row) => boolean) | null = null;
  /** Like PostgREST's max-rows: a select returns at most this many rows. A count is never capped. */
  maxRows: number | null = null;
  /** A storage listing returns at most this many entries per call, whatever limit was asked. */
  listMax: number | null = null;
  /** Called after every select ran: lets a test change the data between two reads. */
  afterSelect: ((table: string) => void) | null = null;

  table(name: string): Row[] {
    this.tables[name] ??= [];
    return this.tables[name];
  }

  from(name: string) {
    return new Query(this, name);
  }

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, bytes: Uint8Array, opts?: { contentType?: string; upsert?: boolean }) => {
        const key = `${bucket}/${path}`;
        if (this.objects.has(key) && !opts?.upsert) return { data: null, error: { message: 'The resource already exists' } };
        this.objects.set(key, { bytes, contentType: opts?.contentType });
        return { data: { path }, error: null };
      },
      download: async (path: string) => {
        const o = this.objects.get(`${bucket}/${path}`);
        if (!o) return { data: null, error: { message: 'Object not found' } };
        return { data: new Blob([o.bytes]), error: null };
      },
      remove: async (paths: string[]) => {
        for (const p of paths) this.objects.delete(`${bucket}/${p}`);
        this.log.push(`remove ${paths.length}`);
        return { data: paths.map((name) => ({ name })), error: null };
      },
      list: async (prefix: string, opts?: { limit?: number; offset?: number }) => {
        // Sorted by name and paged by limit/offset, as storage lists.
        const names = prefix === ''
          // The bucket's top level: each folder once.
          ? [...new Set([...this.objects.keys()]
              .filter((k) => k.startsWith(`${bucket}/`))
              .map((k) => k.slice(`${bucket}/`.length).split('/')[0]))]
          : [...this.objects.keys()]
              .filter((k) => k.startsWith(`${bucket}/${prefix}/`))
              .map((k) => k.slice(`${bucket}/${prefix}/`.length))
              .filter((n) => !n.includes('/'));
        names.sort();
        const offset = opts?.offset ?? 0;
        const limit = Math.min(opts?.limit ?? 100, this.listMax ?? Infinity);
        return { data: names.slice(offset, offset + limit).map((name) => ({ name })), error: null };
      },
      createSignedUploadUrl: async (path: string, opts?: { upsert?: boolean }) => {
        this.signedUploadOpts.push({ path, upsert: opts?.upsert });
        return {
          data: { signedUrl: `https://storage.example/upload/${path}?token=t`, token: `t-${path}`, path },
          error: null,
        };
      },
    }),
  };

  /** role_has_institution_access answers from here; every college by default. */
  reachable: ((institutionId: string) => boolean) | null = null;
  rpcCalls: { name: string; args: unknown }[] = [];

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    if (name === 'role_has_institution_access') {
      const id = args.check_institution_id as string | null;
      // Like production: a NULL institution answers TRUE.
      return { data: id == null ? true : this.reachable ? this.reachable(id) : true, error: null };
    }
    return { data: null, error: { message: `fake rpc(): unknown ${name}` } };
  }

  /** What a client sees: one object can play both the session and the admin client. */
  asClient(): never {
    return this as never;
  }

  /**
   * The signed-in person's session as production grants it: SELECT only on every
   * table it touches. Any insert/update/delete through it fails with 42501, so a
   * test proves every write goes through the service role.
   */
  asSession(): never {
    return {
      from: (name: string) => new Query(this, name, true),
      rpc: (name: string, args: Record<string, unknown>) => this.rpc(name, args),
      storage: { from: () => { throw new Error('the session client has no storage access'); } },
    } as never;
  }
}

type Result = { data: unknown; error: Failure | null; count?: number };

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private counting = false;
  private headOnly = false;
  private filters: Filter[] = [];
  private payload: unknown;
  private returning = false;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;

  constructor(private db: FakeSupabase, private name: string, private readOnly = false) {}

  select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
    if (opts?.count) this.counting = true;
    if (opts?.head) this.headOnly = true;
    if (this.op === 'select') return this;
    this.returning = true;
    return this;
  }
  insert(p: unknown) { this.op = 'insert'; this.payload = p; return this; }
  update(p: unknown) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: null) { this.filters.push((r) => (v === null ? isNullish(r[c]) : r[c] === v)); return this; }
  not(c: string, op: 'is', v: null) {
    if (op !== 'is' || v !== null) throw new Error(`fake not(): unsupported ${op} ${String(v)}`);
    this.filters.push((r) => !isNullish(r[c]));
    return this;
  }
  lt(c: string, v: string) { this.filters.push((r) => !isNullish(r[c]) && String(r[c]) < v); return this; }
  or(expr: string) { this.filters.push(orFilter(expr)); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  then<A = Result, B = never>(
    ok?: ((v: Result) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => {
        const result = this.run();
        // After the result is copied out, so a change made here is not in it.
        if (this.op === 'select') this.db.afterSelect?.(this.name);
        return result;
      })
      .then(ok, bad);
  }

  private run(): Result {
    if (this.readOnly && this.op !== 'select') {
      this.db.log.push(`REFUSED session ${this.op} ${this.name}`);
      return { data: null, error: { code: '42501', message: `permission denied for table ${this.name}` } };
    }
    const failure = this.db.failures.get(`${this.name}.${this.op}`);
    if (failure) {
      this.db.failures.delete(`${this.name}.${this.op}`);
      return { data: null, error: failure };
    }
    const table = this.db.table(this.name);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[] = [];
    const now = new Date().toISOString();

    if (this.op === 'select') {
      out = table.filter(match);
      if (this.readOnly && this.db.sessionHides) out = out.filter((r) => !this.db.sessionHides!(this.name, r));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (this.counting) {
        const count = out.length;
        if (this.headOnly) return { data: null, error: null, count };
        out = this.capped(out);
        return { data: clone(out), error: null, count };
      }
      out = this.capped(out);
    } else if (this.op === 'insert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      for (const p of list) {
        const row: Row = { id: randomUUID(), created_at: now, updated_at: now, ...clone(p) };
        if (this.name === 'hr_intake_match_rules') row.times_used ??= 0;
        if (this.name === 'hr_intake_rows') row.decision_corrected ??= false;
        if (this.name === 'hr_intake_batches') row.skipped_files ??= [];
        if (this.name === 'hr_job_applications' && table.some((t) => t.id === row.id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        // uq_hr_job_applications_cvviz_job_email
        if (
          this.name === 'hr_job_applications' && row.source === 'cvviz_import' && typeof row.email === 'string' &&
          table.some((t) => t.source === 'cvviz_import' && t.job_id === row.job_id && String(t.email).toLowerCase() === String(row.email).toLowerCase())
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_hr_job_applications_cvviz_job_email"' } };
        }
        // uq_hr_intake_match_rules_title_institution
        if (
          this.name === 'hr_intake_match_rules' &&
          table.some((t) => t.cvviz_job_title_norm === row.cvviz_job_title_norm && t.institution_id === row.institution_id)
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_hr_intake_match_rules_title_institution"' } };
        }
        table.push(row);
        out.push(row);
      }
      this.db.log.push(`insert ${this.name} ${list.length}`);
    } else if (this.op === 'update') {
      for (const r of table.filter(match)) {
        Object.assign(r, clone(this.payload), { updated_at: now });
        out.push(r);
      }
      this.db.log.push(`update ${this.name} ${out.length}`);
      if (out.length > 0) this.db.afterUpdate?.(this.name, this.payload);
    } else {
      const keep: Row[] = [];
      for (const r of table) (match(r) ? out : keep).push(r);
      this.db.tables[this.name] = keep;
      this.db.log.push(`delete ${this.name} ${out.length}`);
    }

    const lost = this.db.lostReplies.get(`${this.name}.${this.op}`);
    if (lost && out.length > 0) {
      this.db.lostReplies.delete(`${this.name}.${this.op}`);
      return { data: null, error: lost };
    }
    if (this.op !== 'select' && !this.returning) return { data: null, error: null };
    const data = clone(out);
    if (this.mode === 'single') {
      return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${data.length}` } };
    }
    if (this.mode === 'maybe') return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }

  private capped(out: Row[]): Row[] {
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    if (this.db.maxRows !== null) out = out.slice(0, this.db.maxRows);
    return out;
  }
}
