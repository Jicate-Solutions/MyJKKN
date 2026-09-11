// __tests__/analytics/engagement-fake-db.ts
//
// A small in-memory stand-in for the Supabase query builder, shared by the
// Engagement Analytics scope tests. It runs the filters (eq, in, not-is-null,
// gte, lte), embeds related rows the way PostgREST does (`table!inner(cols)`
// drops a parent row whose related row is missing), and fails a query that
// names a column the table does not have, as PostgREST does. That last part is
// what makes "allowed scope returns data" mean something: the department
// breakdown used to select departments.name, which does not exist, so it was
// always empty in production.

export type Row = Record<string, any>;
export type Db = Record<string, Row[]>;

export interface QueryCall {
  table: string;
  op: 'eq' | 'in';
  column: string;
  value: unknown;
}

/** Columns each table has (a subset is enough; unknown tables are not checked). */
const SCHEMA: Record<string, string[]> = {
  institutions: ['id', 'name'],
  departments: ['id', 'department_name', 'institution_id', 'head_of_department_id'],
  programs: ['id', 'program_name', 'institution_id', 'department_id', 'is_active'],
  semesters: ['id', 'semester_name', 'institution_id', 'department_id', 'program_id', 'is_active'],
  sections: ['id', 'section_name', 'institution_id', 'department_id', 'program_id', 'semester_id', 'is_active'],
  profiles: ['id', 'role', 'is_super_admin', 'institution_id', 'department_id', 'full_name', 'email', 'phone_number'],
  'staff': ['id', 'profile_id', 'department_id'],
  timetable_slots: ['id', 'staff_id', 'section_id']
};

/** How an embedded table joins to each parent table: parent column -> related id. */
const EMBED_KEYS: Record<string, string> = {
  institutions: 'institution_id',
  departments: 'department_id',
  programs: 'program_id',
  semesters: 'semester_id',
  sections: 'section_id',
  profiles: 'user_id'
};

const EMBED_PATTERN = /(\w+)(!inner)?\(([^)]*)\)/g;

function columnError(table: string, column: string) {
  return { message: `column ${table}.${column} does not exist`, code: '42703' };
}

function splitColumns(list: string): string[] {
  return list
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== '*');
}

function validateSelect(table: string, select: string) {
  for (const match of select.matchAll(EMBED_PATTERN)) {
    const [, related, , columns] = match;
    const known = SCHEMA[related];
    if (!known) continue;
    for (const column of splitColumns(columns)) {
      if (!known.includes(column)) return columnError(related, column);
    }
  }
  const base = select.replace(EMBED_PATTERN, '');
  const known = SCHEMA[table];
  if (known) {
    for (const column of splitColumns(base)) {
      if (!known.includes(column)) return columnError(table, column);
    }
  }
  return null;
}

function embedRow(db: Db, row: Row, select: string): Row | null {
  const out: Row = { ...row };
  for (const match of select.matchAll(EMBED_PATTERN)) {
    const [, related, inner, columns] = match;
    const key = EMBED_KEYS[related];
    const target = key ? (db[related] ?? []).find((r) => r.id === row[key]) : undefined;
    if (!target) {
      if (inner) return null;
      out[related] = null;
      continue;
    }
    const picked: Row = {};
    for (const column of splitColumns(columns)) picked[column] = target[column];
    out[related] = picked;
  }
  return out;
}

export function createFakeClient(db: Db, calls: QueryCall[]) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let select = '*';
      let order: { column: string; ascending: boolean } | null = null;
      let limit: number | null = null;

      const run = () => {
        const error = validateSelect(table, select);
        if (error) return Promise.resolve({ data: null, error, count: null });
        let rows = (db[table] ?? [])
          .filter((r) => filters.every((f) => f(r)))
          .map((r) => embedRow(db, r, select))
          .filter((r): r is Row => r !== null);
        if (order) {
          const { column, ascending } = order;
          rows = [...rows].sort((a, b) =>
            a[column] === b[column] ? 0 : (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1)
          );
        }
        const count = rows.length;
        if (limit !== null) rows = rows.slice(0, limit);
        return Promise.resolve({ data: rows, error: null, count });
      };

      const builder: any = {
        select(columns = '*') {
          select = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          calls.push({ table, op: 'eq', column, value });
          filters.push((r) => r[column] === value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          calls.push({ table, op: 'in', column, value: values });
          filters.push((r) => values.includes(r[column]));
          return builder;
        },
        not(column: string, operator: string, value: unknown) {
          if (operator === 'is' && value === null) filters.push((r) => r[column] != null);
          return builder;
        },
        gte(column: string, value: any) {
          filters.push((r) => r[column] >= value);
          return builder;
        },
        lte(column: string, value: any) {
          filters.push((r) => r[column] <= value);
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          order = { column, ascending: options?.ascending !== false };
          return builder;
        },
        limit(n: number) {
          limit = n;
          return builder;
        },
        returns() {
          return builder;
        },
        single() {
          return run().then((res) => {
            if (res.error) return { data: null, error: res.error };
            return res.data!.length === 1
              ? { data: res.data![0], error: null }
              : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
          });
        },
        maybeSingle() {
          return run().then((res) => {
            if (res.error) return { data: null, error: res.error };
            if (res.data!.length > 1) return { data: null, error: { message: 'multiple rows' } };
            return { data: res.data![0] ?? null, error: null };
          });
        },
        then(resolve: any, reject: any) {
          return run().then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

// ---------------------------------------------------------------------------
// The organisation used by every scope test: two institutions, A and B.
// A has departments A1 and A2; B has B1. Each department has one program,
// semester and section, and each section one learner with a score today.
// ---------------------------------------------------------------------------

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

export const IDS = {
  instA: id('a'),
  instB: id('b'),
  deptA1: id('a1'),
  deptA2: id('a2'),
  deptB1: id('b1'),
  progA1: id('1a1'),
  progA2: id('1a2'),
  progB1: id('1b1'),
  semA1: id('2a1'),
  semA2: id('2a2'),
  semB1: id('2b1'),
  secA1: id('3a1'),
  secA2: id('3a2'),
  secB1: id('3b1'),
  learnerA1: id('4a1'),
  learnerA2: id('4a2'),
  learnerB1: id('4b1'),
  learnerBNoSection: id('4b0'),
  superAdmin: id('5001'),
  principalA: id('5002'),
  hodA1: id('5003'),
  facultyA1: id('5004'),
  adminA: id('5005'),
  staffFacultyA1: id('6004')
};

export const today = () => new Date().toISOString().split('T')[0];

function place(dept: 'A1' | 'A2' | 'B1') {
  const inst = dept === 'B1' ? IDS.instB : IDS.instA;
  const d = { A1: 'deptA1', A2: 'deptA2', B1: 'deptB1' } as const;
  const p = { A1: 'progA1', A2: 'progA2', B1: 'progB1' } as const;
  const s = { A1: 'semA1', A2: 'semA2', B1: 'semB1' } as const;
  const x = { A1: 'secA1', A2: 'secA2', B1: 'secB1' } as const;
  return {
    institution_id: inst,
    department_id: IDS[d[dept]],
    program_id: IDS[p[dept]],
    semester_id: IDS[s[dept]],
    section_id: IDS[x[dept]]
  };
}

function score(userId: string, dept: 'A1' | 'A2' | 'B1', overrides: Row = {}): Row {
  return {
    id: `score-${userId}`,
    user_id: userId,
    calculation_date: today(),
    ...place(dept),
    logins_last_7_days: 3,
    logins_last_30_days: 9,
    avg_session_duration_minutes: 12.4,
    modules_accessed_count: 4,
    percentile_rank: 50,
    engagement_level: 'at_risk',
    is_at_risk: true,
    last_login_at: `${today()}T04:30:00.000Z`,
    ...overrides
  };
}

export function buildOrgDb(): Db {
  return {
    institutions: [
      { id: IDS.instA, name: 'Institution A' },
      { id: IDS.instB, name: 'Institution B' }
    ],
    departments: [
      { id: IDS.deptA1, department_name: 'Dept A1', institution_id: IDS.instA },
      { id: IDS.deptA2, department_name: 'Dept A2', institution_id: IDS.instA },
      { id: IDS.deptB1, department_name: 'Dept B1', institution_id: IDS.instB }
    ],
    programs: (['A1', 'A2', 'B1'] as const).map((d) => {
      const p = place(d);
      return { id: p.program_id, program_name: `Program ${d}`, institution_id: p.institution_id, department_id: p.department_id };
    }),
    semesters: (['A1', 'A2', 'B1'] as const).map((d) => {
      const p = place(d);
      return { id: p.semester_id, semester_name: `Semester ${d}`, institution_id: p.institution_id, department_id: p.department_id, program_id: p.program_id };
    }),
    sections: (['A1', 'A2', 'B1'] as const).map((d) => {
      const p = place(d);
      return { id: p.section_id, section_name: `Section ${d}`, ...p };
    }),
    profiles: [
      { id: IDS.superAdmin, role: 'super_admin', is_super_admin: true, institution_id: IDS.instB, department_id: null },
      { id: IDS.principalA, role: 'principal', is_super_admin: false, institution_id: IDS.instA, department_id: null },
      { id: IDS.hodA1, role: 'hod', is_super_admin: false, institution_id: IDS.instA, department_id: IDS.deptA1 },
      { id: IDS.facultyA1, role: 'faculty', is_super_admin: false, institution_id: IDS.instA, department_id: IDS.deptA1 },
      { id: IDS.adminA, role: 'admin', is_super_admin: false, institution_id: IDS.instA, department_id: null },
      { id: IDS.learnerA1, role: 'student', full_name: 'Learner A1', email: 'a1@jkkn.ac.in', phone_number: '900000001' },
      { id: IDS.learnerA2, role: 'student', full_name: 'Learner A2', email: 'a2@jkkn.ac.in', phone_number: '900000002' },
      { id: IDS.learnerB1, role: 'student', full_name: 'Learner B1', email: 'b1@jkkn.ac.in', phone_number: '900000003' },
      { id: IDS.learnerBNoSection, role: 'student', full_name: 'Learner B0', email: 'b0@jkkn.ac.in', phone_number: '900000004' }
    ],
    staff: [{ id: IDS.staffFacultyA1, profile_id: IDS.facultyA1, department_id: IDS.deptA1 }],
    timetable_slots: [{ id: 'slot-1', staff_id: IDS.staffFacultyA1, section_id: IDS.secA1 }],
    student_engagement_scores: [
      score(IDS.learnerA1, 'A1', { percentile_rank: 80, engagement_level: 'high', is_at_risk: false }),
      score(IDS.learnerA2, 'A2', { percentile_rank: 40 }),
      score(IDS.learnerB1, 'B1', { percentile_rank: 60 }),
      // A learner with no section: the old detail check let any viewer through for these.
      score(IDS.learnerBNoSection, 'B1', { section_id: null, semester_id: null, percentile_rank: 10 })
    ],
    daily_engagement_metrics: (['A1', 'A2', 'B1'] as const).map((d) => ({
      id: `metric-${d}`,
      metric_date: today(),
      ...place(d),
      role: 'student',
      total_logins: 10,
      unique_users: 1,
      avg_session_duration_minutes: 12,
      total_active_time_hours: 2,
      avg_modules_per_user: 3
    })),
    mv_engagement_overview: (['A1', 'A2', 'B1'] as const).map((d) => ({
      ...place(d),
      total_students: 1,
      active_last_7d: 1,
      at_risk_count: d === 'A1' ? 0 : 1,
      avg_logins_7d: 3,
      avg_session_duration: 12
    })),
    user_sessions: []
  };
}
