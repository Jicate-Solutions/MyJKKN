/**
 * Review Comments — learner in-charges of a tournament (BUG-006176) —
 * behavioural proof for
 * supabase/migrations/20270321090401_event_review_comments_tournament_learner_incharges.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The five migrations that built the review thread (20261128090000 →
 * 20261224110000) and the new one are applied VERBATIM with psql on a throwaway
 * database. The suite then signs in as each person (auth.uid() reads a session
 * setting; the role is `authenticated`, so every RLS policy and trigger runs
 * for real) and performs the WRITES the read-only production rehearsal never
 * did: posting, replying, editing, closing a thread, deleting, tagging.
 *
 * It also proves the migration's drift guard: a live body changed outside the
 * migrations makes the file refuse, rather than silently reverting the change.
 *
 * REQUIRES a local PostgreSQL 16. NOT run by CI — every `vitest run` in this
 * repo names explicit paths — and deliberately loud rather than skipped when no
 * server is reachable, following __tests__/events/event-waitlist-seat-holding.pg.test.ts.
 *
 *   brew services start postgresql@16
 *   ./node_modules/.bin/vitest run __tests__/events/event-review-comments-learner-incharge.pg.test.ts
 *
 * Override the server with ERC_TEST_PGHOST / _PGPORT / _PGUSER.
 */
import { execFileSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIG = (f: string) => path.join(REPO, 'supabase/migrations', f);
const BASE = [
  '20261128090000_event_review_comments.sql',
  '20261130090000_event_review_comments_permission_keys.sql',
  '20261220096000_event_review_comment_mentions.sql',
  '20261220097000_event_review_comments_committees_staff_only.sql',
  '20261224110000_event_review_mentions_same_institution_untag.sql',
].map(MIG);
const NEW = MIG('20270321090401_event_review_comments_tournament_learner_incharges.sql');

const PGHOST = process.env.ERC_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.ERC_TEST_PGPORT ?? '5432';
const PGUSER = process.env.ERC_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const DBNAME = `myjkkn_erc_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

/**
 * Production shapes reduced to the columns these migrations touch. The
 * authority helpers answer from real rows (profiles.role, events.config
 * incharges), so the functions under test are asked the question they are
 * asked in production.
 */
const FIXTURE = `
DO $$ BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.acting_uid', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, role text, is_active boolean DEFAULT true,
  institution_id uuid, full_name text, is_super_admin boolean NOT NULL DEFAULT false,
  perms text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}', created_by uuid, institution_id uuid
);
CREATE TABLE public.event_committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid, lead_id uuid,
  lead_ids uuid[] DEFAULT '{}', member_ids uuid[] DEFAULT '{}', lead_name text, member_names text[] DEFAULT '{}'
);
CREATE TABLE public.event_volunteer_checkins (event_id uuid, member_id uuid);
CREATE TABLE public.custom_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role_key text, is_active boolean DEFAULT true, permissions jsonb, updated_at timestamptz);
CREATE TABLE public.user_roles (user_id uuid, role_id uuid);
GRANT SELECT ON public.profiles, public.events TO authenticated;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false) $$;
CREATE FUNCTION public.get_current_user_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() $$;
CREATE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p = ANY(perms) FROM public.profiles WHERE id = auth.uid()), false) $$;
CREATE FUNCTION public.role_has_institution_access(i uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.fn_is_event_incharge(p_event_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.events e, jsonb_array_elements(COALESCE(e.config->'incharges','[]'::jsonb)) inc
                 WHERE e.id = p_event_id AND inc->>'member_id' = auth.uid()::text) $$;
CREATE FUNCTION public.fn_is_event_committee_member(p_event_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.event_committees mc WHERE mc.event_id = p_event_id
                 AND (mc.lead_id = auth.uid() OR auth.uid() = ANY(mc.member_ids))) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

/** The text between `AS $$` and `$$;` of a CREATE FUNCTION in a file — what pg stores as prosrc. */
function bodyOf(file: string, fn: string): string {
  const s = readFileSync(file, 'utf8');
  const i = s.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`);
  if (i < 0) throw new Error(`${fn} not in ${file}`);
  const j = s.indexOf('AS $$', i) + 'AS $$'.length;
  return s.slice(j, s.indexOf('$$;', j));
}
const md5 = (t: string) => createHash('md5').update(t).digest('hex');

let admin: Client;
let tmp: string;
const INST = randomUUID();
const OTHER_INST = randomUUID();
const id = {
  coo: randomUUID(), // super admin, the reviewing authority
  hod: randomUUID(), // staff in-charge of the tournament
  staffPeer: randomUUID(), // staff of the same institution, not on the event
  learnerIc: randomUUID(), // learner in-charge of the tournament
  learnerIc2: randomUUID(), // a second learner in-charge of the tournament
  lectureLearnerIc: randomUUID(), // learner in-charge of a LECTURE only
  learner: randomUUID(), // ordinary learner, nothing to do with either event
  inactiveLearnerIc: randomUUID(), // learner in-charge whose profile is inactive
  participantIc: randomUUID(), // course_participant named in-charge of the tournament
  tournament: randomUUID(),
  lecture: randomUUID(),
  cooThread: '',
};

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await admin.query(sql, params)).rows as T[];
}

/** Run `fn` signed in as `uid` under role authenticated, on a fresh connection. */
async function as<T>(uid: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await c.connect();
  try {
    await c.query(`SELECT set_config('test.acting_uid', $1, false)`, [uid]);
    await c.query('SET ROLE authenticated');
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function attempt(c: Client, sql: string, params: unknown[] = []) {
  try {
    const r = await c.query(sql, params);
    return { rows: r.rows, rowCount: r.rowCount ?? 0, code: null as string | null, message: '' };
  } catch (e: any) {
    return { rows: [] as any[], rowCount: 0, code: (e.code ?? 'unknown') as string, message: String(e.message) };
  }
}

const canRead = (uid: string, eventId: string) =>
  as(uid, async (c) => {
    const r = await c.query('SELECT public.fn_can_read_event_review_comments($1) AS ok', [eventId]);
    return r.rows[0].ok as boolean;
  });

/** The migration file text run on the admin connection inside a transaction that is always rolled back. */
async function applyNewInRolledBackTx(tamper: string): Promise<string | null> {
  await admin.query('BEGIN');
  try {
    await admin.query(tamper);
    await admin.query(readFileSync(NEW, 'utf8'));
    return null;
  } catch (e: any) {
    return String(e.message);
  } finally {
    await admin.query('ROLLBACK');
  }
}

const liveMd5 = async (sig: string) =>
  (await q(`SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = $1::regprocedure`, [sig]))[0].m as string;

const before = { read: '', guard: '' };

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `This suite applies the real migration files and proves behaviour against a\n` +
        `throwaway database; it will not pretend to pass without one.\n` +
        `  brew services start postgresql@16\n\n` +
        String(e?.stderr || e?.message || e),
    );
  }
  tmp = mkdtempSync(path.join(tmpdir(), 'erc-'));
  const fixturePath = path.join(tmp, 'fixture.sql');
  writeFileSync(fixturePath, FIXTURE);
  psql(['-d', DBNAME, '-f', fixturePath]);
  for (const f of BASE) psql(['-d', DBNAME, '-f', f]);

  admin = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await admin.connect();

  const people: [string, string, boolean, string, boolean][] = [
    [id.coo, 'super_admin', true, INST, true],
    [id.hod, 'hod', true, INST, false],
    [id.staffPeer, 'faculty', true, INST, false],
    [id.learnerIc, 'student', true, INST, false],
    [id.learnerIc2, 'student', true, INST, false],
    [id.lectureLearnerIc, 'student', true, INST, false],
    [id.learner, 'student', true, INST, false],
    [id.inactiveLearnerIc, 'student', false, INST, false],
    [id.participantIc, 'course_participant', true, INST, false],
  ];
  for (const [pid, role, active, inst, su] of people) {
    await q(
      `INSERT INTO public.profiles (id, role, is_active, institution_id, full_name, is_super_admin)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [pid, role, active, inst, pid, su],
    );
  }
  const incharges = (ids: string[]) =>
    JSON.stringify({ incharges: ids.map((m) => ({ member_id: m })) });
  await q(
    `INSERT INTO public.events (id, event_type, config, created_by, institution_id)
     VALUES ($1, 'sports_tournament', $2::jsonb, $3, $4)`,
    [
      id.tournament,
      incharges([id.hod, id.learnerIc, id.learnerIc2, id.inactiveLearnerIc, id.participantIc]),
      id.coo,
      INST,
    ],
  );
  await q(
    `INSERT INTO public.events (id, event_type, config, created_by, institution_id)
     VALUES ($1, 'lecture', $2::jsonb, $3, $4)`,
    [id.lecture, incharges([id.lectureLearnerIc]), id.coo, OTHER_INST],
  );
  // The COO's remark, as it stands on production (written as him, so the
  // author default and the INSERT policy are the real ones).
  id.cooThread = await as(id.coo, async (c) => {
    const r = await c.query(
      `INSERT INTO public.event_review_comments (event_id, body) VALUES ($1, 'Fixtures not published yet.') RETURNING id`,
      [id.tournament],
    );
    return r.rows[0].id as string;
  });

  before.read = await liveMd5('public.fn_can_read_event_review_comments(uuid)');
  before.guard = await liveMd5('public.fn_guard_event_review_comment_mention()');
}, 120_000);

afterAll(async () => {
  if (admin) await admin.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`]);
  } catch {
    /* disposable */
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('control: the bug reproduces before the migration', () => {
  it('a learner in-charge of the tournament is refused; the team-member in-charge is admitted', async () => {
    expect(await canRead(id.learnerIc, id.tournament)).toBe(false);
    expect(await canRead(id.hod, id.tournament)).toBe(true);
  });
});

describe('drift guard: the md5 constants are the files, and a changed live body is refused', () => {
  const src = readFileSync(NEW, 'utf8');

  it('the four md5s in the file are exactly what the migrations produce', () => {
    const readOld = md5(bodyOf(BASE[3], 'fn_can_read_event_review_comments'));
    const guardOld = md5(bodyOf(BASE[4], 'fn_guard_event_review_comment_mention'));
    const readNew = md5(bodyOf(NEW, 'fn_can_read_event_review_comments'));
    const guardNew = md5(bodyOf(NEW, 'fn_guard_event_review_comment_mention'));
    // What PostgreSQL actually stored after applying 20261220097000 / 20261224110000 verbatim.
    expect(before.read).toBe(readOld);
    expect(before.guard).toBe(guardOld);
    for (const m of [readOld, guardOld, readNew, guardNew]) expect(src).toContain(`'${m}'`);
  });

  it('refuses when fn_can_read_event_review_comments was changed by hand, and changes nothing', async () => {
    const err = await applyNewInRolledBackTx(
      `CREATE OR REPLACE FUNCTION public.fn_can_read_event_review_comments(p_event_id uuid)
       RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
       AS $f$ SELECT public.is_super_admin() $f$`,
    );
    expect(err).toMatch(/fn_can_read_event_review_comments: live body .* changed outside the migrations/);
    expect(await liveMd5('public.fn_can_read_event_review_comments(uuid)')).toBe(before.read);
  });

  it('refuses when the tag guard was changed by hand', async () => {
    const err = await applyNewInRolledBackTx(
      `CREATE OR REPLACE FUNCTION public.fn_guard_event_review_comment_mention()
       RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
       AS $f$ BEGIN RETURN NEW; END; $f$`,
    );
    expect(err).toMatch(/fn_guard_event_review_comment_mention: live body .* Refusing/);
  });

  it('applies verbatim on the untouched database, and again (idempotent)', () => {
    psql(['-d', DBNAME, '-f', NEW]);
    psql(['-d', DBNAME, '-f', NEW]);
  });
});

describe('who is admitted after the migration', () => {
  it('the two learner in-charges of the tournament flip to true', async () => {
    expect(await canRead(id.learnerIc, id.tournament)).toBe(true);
    expect(await canRead(id.learnerIc2, id.tournament)).toBe(true);
  });
  it('the team-member in-charge and the creator are unchanged', async () => {
    expect(await canRead(id.hod, id.tournament)).toBe(true);
    expect(await canRead(id.coo, id.tournament)).toBe(true);
  });
  it('still refused: lecture learner in-charge, ordinary learner, inactive learner in-charge, participant in-charge, and a tournament learner on the lecture', async () => {
    expect(await canRead(id.lectureLearnerIc, id.lecture)).toBe(false);
    expect(await canRead(id.lectureLearnerIc, id.tournament)).toBe(false);
    expect(await canRead(id.learner, id.tournament)).toBe(false);
    expect(await canRead(id.inactiveLearnerIc, id.tournament)).toBe(false);
    expect(await canRead(id.participantIc, id.tournament)).toBe(false);
    expect(await canRead(id.learnerIc, id.lecture)).toBe(false);
  });
});

describe('the WRITE path, as the learner in-charge (never exercised on production)', () => {
  let myRoot = '';

  it('reads the COO remark', async () => {
    const rows = await as(id.learnerIc, async (c) =>
      (await c.query(`SELECT id, body FROM public.event_review_comments WHERE event_id = $1`, [id.tournament])).rows,
    );
    expect(rows.map((r) => r.id)).toContain(id.cooThread);
  });

  it('replies to the COO thread and opens a thread of their own, signed as themselves', async () => {
    await as(id.learnerIc, async (c) => {
      const reply = await attempt(
        c,
        `INSERT INTO public.event_review_comments (event_id, parent_id, body)
         VALUES ($1, $2, 'Fixtures go up tonight.') RETURNING author_id`,
        [id.tournament, id.cooThread],
      );
      expect(reply.code).toBeNull();
      expect(reply.rows[0].author_id).toBe(id.learnerIc);
      const root = await attempt(
        c,
        `INSERT INTO public.event_review_comments (event_id, body) VALUES ($1, 'Need two more referees.') RETURNING id`,
        [id.tournament],
      );
      expect(root.code).toBeNull();
      myRoot = root.rows[0].id;
      // Cannot sign as somebody else.
      const forged = await attempt(
        c,
        `INSERT INTO public.event_review_comments (event_id, author_id, body) VALUES ($1, $2, 'x')`,
        [id.tournament, id.coo],
      );
      expect(forged.code).toBe('42501');
    });
  });

  it('edits its own words; cannot edit the COO’s', async () => {
    await as(id.learnerIc, async (c) => {
      const mine = await attempt(c, `UPDATE public.event_review_comments SET body = 'Need three referees.' WHERE id = $1`, [myRoot]);
      expect(mine.code).toBeNull();
      expect(mine.rowCount).toBe(1);
      const theirs = await attempt(c, `UPDATE public.event_review_comments SET body = 'edited' WHERE id = $1`, [id.cooThread]);
      expect(theirs.rowCount).toBe(0); // UPDATE policy: author or review admin
    });
    expect((await q(`SELECT body FROM public.event_review_comments WHERE id = $1`, [id.cooThread]))[0].body).toBe(
      'Fixtures not published yet.',
    );
  });

  it('CLOSES a thread it raised (the author half of the close rule) — and cannot close the COO’s', async () => {
    await as(id.learnerIc, async (c) => {
      const own = await attempt(c, `UPDATE public.event_review_comments SET is_resolved = true WHERE id = $1 RETURNING resolved_by`, [myRoot]);
      expect(own.code).toBeNull();
      expect(own.rows[0].resolved_by).toBe(id.learnerIc);
      const coo = await attempt(c, `UPDATE public.event_review_comments SET is_resolved = true WHERE id = $1`, [id.cooThread]);
      expect(coo.rowCount).toBe(0);
    });
    expect((await q(`SELECT is_resolved FROM public.event_review_comments WHERE id = $1`, [id.cooThread]))[0].is_resolved).toBe(false);
  });

  it('cannot delete the COO’s remark', async () => {
    const r = await as(id.learnerIc, (c) => attempt(c, `DELETE FROM public.event_review_comments WHERE id = $1`, [id.cooThread]));
    expect(r.rowCount).toBe(0);
    expect((await q(`SELECT count(*)::int AS n FROM public.event_review_comments WHERE id = $1`, [id.cooThread]))[0].n).toBe(1);
  });

  it('TAGS a team member of the institution, who is then admitted; the tag is stamped as the learner’s', async () => {
    expect(await canRead(id.staffPeer, id.tournament)).toBe(false);
    const r = await as(id.learnerIc, (c) =>
      attempt(
        c,
        `INSERT INTO public.event_review_comment_mentions (comment_id, event_id, mentioned_user_id)
         VALUES ($1, $2, $3) RETURNING mentioned_by`,
        [myRoot, id.lecture /* lies about the event; the guard overwrites it */, id.staffPeer],
      ),
    );
    expect(r.code).toBeNull();
    expect(r.rows[0].mentioned_by).toBe(id.learnerIc);
    expect(await canRead(id.staffPeer, id.tournament)).toBe(true);
  });

  it('cannot tag a learner — and the refusal no longer says learners never see the thread', async () => {
    const r = await as(id.learnerIc, (c) =>
      attempt(
        c,
        `INSERT INTO public.event_review_comment_mentions (comment_id, event_id, mentioned_user_id) VALUES ($1, $2, $3)`,
        [myRoot, id.tournament, id.learner],
      ),
    );
    expect(r.code).toBe('42501');
    expect(r.message).toContain('learners cannot be tagged');
    expect(r.message).not.toContain('never see this thread');
  });

  it('cannot tag on the COO’s comment (only the author tags)', async () => {
    const r = await as(id.learnerIc, (c) =>
      attempt(
        c,
        `INSERT INTO public.event_review_comment_mentions (comment_id, event_id, mentioned_user_id) VALUES ($1, $2, $3)`,
        [id.cooThread, id.tournament, id.hod],
      ),
    );
    expect(r.code).toBe('42501');
  });

  it('sees the tagged roster on the thread (declared)', async () => {
    const rows = await as(id.learnerIc, async (c) =>
      (await c.query(`SELECT mentioned_user_id FROM public.event_review_comment_mentions WHERE event_id = $1`, [id.tournament])).rows,
    );
    expect(rows.map((r) => r.mentioned_user_id)).toEqual([id.staffPeer]);
  });

  it('the second learner in-charge cannot edit, close or delete the first one’s thread', async () => {
    await as(id.learnerIc2, async (c) => {
      expect((await attempt(c, `UPDATE public.event_review_comments SET is_resolved = false WHERE id = $1`, [myRoot])).rowCount).toBe(0);
      expect((await attempt(c, `DELETE FROM public.event_review_comments WHERE id = $1`, [myRoot])).rowCount).toBe(0);
    });
  });
});

describe('the WRITE path stays shut for everyone the rule still refuses', () => {
  it('the lecture’s learner in-charge cannot post on its own lecture', async () => {
    const r = await as(id.lectureLearnerIc, (c) =>
      attempt(c, `INSERT INTO public.event_review_comments (event_id, body) VALUES ($1, 'x')`, [id.lecture]),
    );
    expect(r.code).toBe('42501');
  });
  it('an ordinary learner cannot post on, or read, the tournament', async () => {
    await as(id.learner, async (c) => {
      expect((await attempt(c, `INSERT INTO public.event_review_comments (event_id, body) VALUES ($1, 'x')`, [id.tournament])).code).toBe('42501');
      expect((await c.query(`SELECT count(*)::int AS n FROM public.event_review_comments`)).rows[0].n).toBe(0);
      expect((await c.query(`SELECT count(*)::int AS n FROM public.event_review_comment_mentions`)).rows[0].n).toBe(0);
    });
  });
  it('the participant in-charge and the inactive learner in-charge cannot post', async () => {
    for (const who of [id.participantIc, id.inactiveLearnerIc]) {
      const r = await as(who, (c) =>
        attempt(c, `INSERT INTO public.event_review_comments (event_id, body) VALUES ($1, 'x')`, [id.tournament]),
      );
      expect(r.code).toBe('42501');
    }
  });
});

describe('the database describes the rule it enforces', () => {
  it('the table comment no longer says learners never read it', async () => {
    const c = (await q(`SELECT obj_description('public.event_review_comments'::regclass, 'pg_class') AS d`))[0].d as string;
    expect(c).not.toMatch(/never by students/);
    expect(c).toMatch(/learner in-charges of a sports tournament/);
  });
  it('anon holds EXECUTE on neither function', async () => {
    const r = await q(
      `SELECT has_function_privilege('anon', 'public.fn_can_read_event_review_comments(uuid)', 'EXECUTE') AS a,
              has_function_privilege('anon', 'public.fn_guard_event_review_comment_mention()', 'EXECUTE') AS b`,
    );
    expect(r[0]).toEqual({ a: false, b: false });
  });
});
