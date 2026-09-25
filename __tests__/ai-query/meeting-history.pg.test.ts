/**
 * The assistant's meeting-history lookup — behavioural proof for
 * supabase/migrations/20270402090000_ai_rpc_meeting_history.sql
 *
 * WHAT MAKES THIS A PROOF AND NOT A RESTATEMENT
 * ---------------------------------------------
 * The REAL access rules are applied verbatim, not re-typed:
 *   20260714000000_meeting_action_items_pr2.sql   (meeting_action_items + its policy)
 *   20261213090000_meeting_notes_fireflies.sql     (meeting_notes, fn_can_view_meeting_note, policy)
 *   20270402090000_ai_rpc_meeting_history.sql      (the function under test + catalog row)
 * Only the tables those files assume already exist (profiles, meeting_bookings
 * with mb_host_select, meeting_type_cohosts) and the authority helpers are
 * fixtures. Every call runs as the `authenticated` role with a real
 * auth.uid(), so row level security is exercised, not stubbed open.
 *
 * WHO IS SEEDED
 *   superAdmin  super admin; attended unmatched note N1 (by email)
 *   admin       admin; attended nothing
 *   plainAtt    no admin; attended unmatched note N2 — RLS hides unmatched
 *               notes from non-admins, so the tool shows them nothing
 *   host        host of booking B1; N3 is linked to B1
 *   attendee    the booked attendee of B1 (by email)
 *   owner       owns action item AI2 on B1 but is not its host — RLS on
 *               meeting_action_items admits only admins and the host
 *   N4          unmatched note with an EMPTY attendee list — nobody reaches it
 *
 * REQUIRES a local PostgreSQL 16 with pgcrypto. It is NOT run by CI — every
 * `vitest run` in this repo names explicit paths — and it is loud rather than
 * skipped when no server is reachable.
 *
 *   ./node_modules/.bin/vitest run __tests__/ai-query/meeting-history.pg.test.ts
 *
 * Override the server with MEETING_HISTORY_TEST_PGHOST / _PGPORT / _PGUSER
 * (a unix-socket directory works as the host).
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATIONS = [
  'supabase/migrations/20260714000000_meeting_action_items_pr2.sql',
  'supabase/migrations/20261213090000_meeting_notes_fireflies.sql',
  'supabase/migrations/20270402090000_ai_rpc_meeting_history.sql',
].map((m) => path.join(REPO, m));

const PGHOST = process.env.MEETING_HISTORY_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.MEETING_HISTORY_TEST_PGPORT ?? '5432';
const PGUSER = process.env.MEETING_HISTORY_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const DBNAME = `myjkkn_mtghist_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const FIXTURE = `
DO $$ BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END;
END $$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.acting_uid', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth, public, extensions TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_own ON public.profiles FOR SELECT USING (id = auth.uid());
GRANT SELECT ON public.profiles TO authenticated;

-- Who holds what. Superuser-owned; read only through the DEFINER helpers.
CREATE TABLE public.test_authority (
  uid uuid PRIMARY KEY,
  is_super boolean NOT NULL DEFAULT false,
  is_adm boolean NOT NULL DEFAULT false,
  perms text[] NOT NULL DEFAULT '{}'
);
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_super FROM test_authority WHERE uid = auth.uid()), false);
$$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_super OR is_adm FROM test_authority WHERE uid = auth.uid()), false);
$$;
CREATE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p = ANY (perms) FROM test_authority WHERE uid = auth.uid()), false);
$$;
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE TABLE public.meeting_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL UNIQUE,
  meeting_type_id uuid,
  host_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  attendee_profile_id uuid REFERENCES public.profiles(id),
  attendee_name text NOT NULL,
  attendee_email text NOT NULL,
  start_time timestamptz NOT NULL
);
ALTER TABLE public.meeting_bookings ENABLE ROW LEVEL SECURITY;
-- mb_host_select, as defined in 20260611190000_native_scheduling_engine.sql.
CREATE POLICY "mb_host_select" ON public.meeting_bookings
FOR SELECT USING (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
);
GRANT SELECT ON public.meeting_bookings TO authenticated;

CREATE TABLE public.meeting_type_cohosts (
  meeting_type_id uuid NOT NULL,
  cohost_profile_id uuid NOT NULL
);
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

let client: Client;
let tmp: string;

const who = {
  superAdmin: '',
  admin: '',
  plainAtt: '',
  host: '',
  attendee: '',
  owner: '',
  stranger: '',
};
const note = { n1: '', n2: '', n3: '', n4: '' };
const BOOKING_UID = 'bk_quarterly_review_0001';

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await client.query(sql, params);
  return r.rows as T[];
}

type Args = {
  p_user_id?: string | null;
  p_person?: string | null;
  p_search?: string | null;
  p_date_from?: string | null;
  p_date_to?: string | null;
  p_include_action_items?: boolean;
  p_limit?: number;
};

/** Call the function exactly as PostgREST would: role authenticated, a real auth.uid(). */
async function ask(actingUid: string | null, args: Args = {}, role = 'authenticated'): Promise<any> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('test.acting_uid', $1, true)`, [actingUid ?? '']);
    await client.query(`SET LOCAL ROLE ${role}`);
    const r = await client.query(
      `SELECT public.ai_rpc_meeting_history(
         p_user_id => $1::uuid, p_person => $2, p_search => $3,
         p_date_from => $4, p_date_to => $5,
         p_include_action_items => $6, p_limit => $7) AS out`,
      [
        args.p_user_id ?? null,
        args.p_person ?? null,
        args.p_search ?? null,
        args.p_date_from ?? null,
        args.p_date_to ?? null,
        args.p_include_action_items ?? true,
        args.p_limit ?? 20,
      ]
    );
    return r.rows[0].out;
  } finally {
    await client.query('ROLLBACK');
  }
}

const noteIds = (out: any) => (out.data as any[]).map((n) => n.note_id).sort();
const itemTexts = (out: any) => (out.action_items as any[]).map((i) => i.action_text).sort();

function expectNoSecrets(out: any) {
  const s = JSON.stringify(out);
  for (const bad of ['recording_url', 'audio_url', 'video_url', '"raw"', 'RECORDING-SECRET']) {
    expect(s, `output leaked ${bad}`).not.toContain(bad);
  }
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}.\n` +
        `This suite applies the real migration files and proves behaviour against a\n` +
        `throwaway database; it will not pretend to pass without one.\n\n` +
        String(e?.stderr || e?.message || e)
    );
  }

  tmp = mkdtempSync(path.join(tmpdir(), 'mtghist-'));
  const fixturePath = path.join(tmp, 'fixture.sql');
  writeFileSync(fixturePath, FIXTURE);
  psql(['-d', DBNAME, '-f', fixturePath]);
  // Verbatim, in dependency order. Each file's own DO $assert$ block runs here.
  for (const m of MIGRATIONS) psql(['-d', DBNAME, '-f', m]);

  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();

  const email: Record<keyof typeof who, string> = {
    superAdmin: 'director@jkkn.ac.in',
    admin: 'admin.office@jkkn.ac.in',
    plainAtt: 'plain.attendee@jkkn.ac.in',
    host: 'host.person@jkkn.ac.in',
    attendee: 'Booked.Attendee@jkkn.ac.in', // mixed case on purpose
    owner: 'item.owner@jkkn.ac.in',
    stranger: 'stranger@jkkn.ac.in',
  };
  for (const k of Object.keys(who) as (keyof typeof who)[]) {
    who[k] = (await q(`INSERT INTO public.profiles (email) VALUES ($1) RETURNING id`, [email[k]]))[0].id;
  }
  await q(`INSERT INTO public.test_authority (uid, is_super) VALUES ($1, true)`, [who.superAdmin]);
  await q(`INSERT INTO public.test_authority (uid, is_adm) VALUES ($1, true)`, [who.admin]);

  const b1 = (
    await q(
      `INSERT INTO public.meeting_bookings (uid, host_profile_id, attendee_name, attendee_email, start_time)
       VALUES ($1, $2, 'Priya Booked', 'booked.attendee@jkkn.ac.in', '2026-09-10T05:00:00Z') RETURNING id`,
      [BOOKING_UID, who.host]
    )
  )[0].id;

  const mkNote = async (
    ref: string,
    bookingId: string | null,
    title: string,
    summary: string | null,
    occurred: string,
    attendees: unknown[],
    actionItems: string | null
  ) =>
    (
      await q(
        `INSERT INTO public.meeting_notes
           (booking_id, provider_ref, title, summary, transcript_url, recording_url, occurred_at, duration_minutes, raw)
         VALUES ($1, $2, $3, $4, 'https://app.fireflies.ai/view/' || $2, 'https://RECORDING-SECRET/' || $2, $5, 30, $6::jsonb)
         RETURNING id`,
        [
          bookingId,
          ref,
          title,
          summary,
          occurred,
          JSON.stringify({
            id: ref,
            audio_url: 'https://RECORDING-SECRET/audio',
            video_url: 'https://RECORDING-SECRET/video',
            meeting_attendees: attendees,
            summary: { overview: summary, action_items: actionItems },
          }),
        ]
      )
    )[0].id;

  note.n1 = await mkNote(
    'ff-n1',
    null,
    'Admission strategy',
    'Reviewed the admission funnel.',
    '2026-09-01T06:00:00Z',
    [
      { email: ' Director@JKKN.ac.in ', displayName: 'The Director' },
      { email: 'guest@outside.org', displayName: 'Outside Guest' },
    ],
    'Director to call the principal'
  );
  note.n2 = await mkNote(
    'ff-n2',
    null,
    'Plain team sync',
    'Weekly sync.',
    '2026-09-02T06:00:00Z',
    [{ email: 'plain.attendee@jkkn.ac.in', displayName: 'Plain Attendee' }],
    null
  );
  note.n3 = await mkNote(
    'ff-n3',
    b1,
    'Quarterly review',
    'Discussed the 100% attendance target.',
    '2026-09-10T05:00:00Z',
    [
      { email: 'host.person@jkkn.ac.in', displayName: 'Host Person' },
      { email: 'booked.attendee@jkkn.ac.in', displayName: 'Att Person' },
    ],
    'Host to send the attendance plan'
  );
  note.n4 = await mkNote('ff-n4', null, 'Nobody listed', null, '2026-09-03T06:00:00Z', [], null);

  await q(
    `INSERT INTO public.meeting_action_items (booking_id, host_profile_id, action_text, owner_label)
     VALUES ($1, $2, 'Send the attendance plan', 'Host Person')`,
    [b1, who.host]
  );
  await q(
    `INSERT INTO public.meeting_action_items (booking_id, host_profile_id, owner_profile_id, action_text, owner_label)
     VALUES ($1, $2, $3, 'Draft the parent letter', 'Item Owner')`,
    [b1, who.host, who.owner]
  );
}, 120_000);

afterAll(async () => {
  if (client) await client.end();
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`]);
  } catch {
    /* disposable */
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('each person sees exactly their own meetings', () => {
  it('super admin: only the unmatched note they attended, not every note RLS would allow', async () => {
    const out = await ask(who.superAdmin);
    expect(out.success).toBe(true);
    expect(noteIds(out)).toEqual([note.n1]);
    expect(out.data[0].attendees).toEqual([
      { name: 'The Director', email: ' Director@JKKN.ac.in ' },
      { name: 'Outside Guest', email: 'guest@outside.org' },
    ]);
    expect(out.data[0].fireflies_action_items).toBe('Director to call the principal');
    expect(out.data[0].booking_uid).toBeNull();
    // Super admin hosts nothing and owns nothing.
    expect(out.action_items).toEqual([]);
    expectNoSecrets(out);
  });

  it('admin who attended nothing: nothing', async () => {
    const out = await ask(who.admin);
    expect(out.data).toEqual([]);
    expect(out.action_items).toEqual([]);
    expect(out.metadata.total_count).toBe(0);
  });

  it('non-admin attendee of an unmatched note: nothing (RLS keeps unmatched notes to admins)', async () => {
    const out = await ask(who.plainAtt);
    expect(out.data).toEqual([]);
  });

  it('booking host: the linked note, the booking reference, and both items they host', async () => {
    const out = await ask(who.host);
    expect(noteIds(out)).toEqual([note.n3]);
    expect(out.data[0].booking_uid).toBe(BOOKING_UID);
    expect(out.data[0].summary).toBe('Discussed the 100% attendance target.');
    expect(out.data[0].transcript_url).toBe('https://app.fireflies.ai/view/ff-n3');
    expect(itemTexts(out)).toEqual(['Draft the parent letter', 'Send the attendance plan']);
    expect(out.action_items.every((i: any) => i.booking_uid === BOOKING_UID)).toBe(true);
    expectNoSecrets(out);
  });

  it('booked attendee: the note, but not the booking they cannot read, and no items', async () => {
    const out = await ask(who.attendee);
    expect(noteIds(out)).toEqual([note.n3]);
    expect(out.data[0].booking_uid).toBeNull();
    expect(out.action_items).toEqual([]);
    expectNoSecrets(out);
  });

  it('item owner who is not the host: nothing — RLS on action items admits only admins and the host', async () => {
    const out = await ask(who.owner);
    expect(out.data).toEqual([]);
    expect(out.action_items).toEqual([]);
  });

  it('the note with an empty attendee list reaches nobody', async () => {
    for (const uid of Object.values(who)) {
      const out = await ask(uid);
      expect(noteIds(out)).not.toContain(note.n4);
    }
  });
});

describe('identity and exposure', () => {
  it('ignores a caller-supplied p_user_id', async () => {
    const asSelf = await ask(who.attendee);
    const asHost = await ask(who.attendee, { p_user_id: who.host });
    expect(asHost).toEqual(asSelf);
    expect(asHost.data[0].booking_uid).toBeNull();
    const strangerPosingAsDirector = await ask(who.stranger, { p_user_id: who.superAdmin });
    expect(strangerPosingAsDirector.data).toEqual([]);
  });

  it('signed out: the UNAUTHORIZED envelope', async () => {
    const out = await ask(null);
    expect(out.success).toBe(false);
    expect(out.error.code).toBe('UNAUTHORIZED');
    expect(out.data).toEqual([]);
  });

  it('anon cannot execute it at all', async () => {
    await expect(ask(who.host, {}, 'anon')).rejects.toMatchObject({ code: '42501' });
  });

  it('is SECURITY INVOKER', async () => {
    const r = await q(`SELECT prosecdef FROM pg_proc WHERE proname = 'ai_rpc_meeting_history'`);
    expect(r).toEqual([{ prosecdef: false }]);
  });

  it('never returns raw, recording or audio/video links for anyone', async () => {
    for (const uid of Object.values(who)) {
      for (const args of [{}, { p_search: 'attendance' }, { p_person: 'person' }]) {
        expectNoSecrets(await ask(uid, args));
      }
    }
  });
});

describe('filters', () => {
  it("'%' and '_' are literal characters, not wildcards", async () => {
    expect((await ask(who.host, { p_search: '%%' })).data).toEqual([]);
    expect(noteIds(await ask(who.host, { p_search: '0%' }))).toEqual([note.n3]);
    expect((await ask(who.host, { p_search: '1_0' })).data).toEqual([]);
    expect((await ask(who.superAdmin, { p_person: '%' + '%' })).data).toEqual([]);
  });

  it('a filter shorter than two characters is ignored, not applied', async () => {
    const out = await ask(who.host, { p_search: ' x ' });
    expect(noteIds(out)).toEqual([note.n3]);
    expect(out.metadata.filters_applied).toEqual({});
  });

  it('person matches the attendee list, and the booked attendee only for a booking the caller can read', async () => {
    expect(noteIds(await ask(who.superAdmin, { p_person: 'outside guest' }))).toEqual([note.n1]);
    expect(noteIds(await ask(who.host, { p_person: 'priya' }))).toEqual([note.n3]);
    expect((await ask(who.attendee, { p_person: 'priya' })).data).toEqual([]);
    expect(noteIds(await ask(who.attendee, { p_person: 'host person' }))).toEqual([note.n3]);
  });

  it('search covers title, summary and the Fireflies action items', async () => {
    expect(noteIds(await ask(who.host, { p_search: 'QUARTERLY' }))).toEqual([note.n3]);
    expect(noteIds(await ask(who.superAdmin, { p_search: 'call the principal' }))).toEqual([note.n1]);
    expect((await ask(who.host, { p_search: 'admission' })).data).toEqual([]);
  });

  it('action items match their own text even when no note matches', async () => {
    const out = await ask(who.host, { p_search: 'parent letter' });
    expect(out.data).toEqual([]);
    expect(itemTexts(out)).toEqual(['Draft the parent letter']);
  });

  it('dates are IST calendar days; an impossible date is ignored', async () => {
    expect(noteIds(await ask(who.host, { p_date_from: '2026-09-10', p_date_to: '2026-09-10' }))).toEqual([note.n3]);
    expect((await ask(who.host, { p_date_to: '2026-09-09' })).data).toEqual([]);
    const bad = await ask(who.host, { p_date_from: '2026-13-45' });
    expect(noteIds(bad)).toEqual([note.n3]);
    expect(bad.metadata.filters_applied).toEqual({});
  });

  it('p_include_action_items = false leaves items out', async () => {
    const out = await ask(who.host, { p_include_action_items: false });
    expect(out.action_items).toEqual([]);
    expect(out.metadata.action_items_included).toBe(false);
  });

  it('limit is capped at 50 and metadata counts are real', async () => {
    const out = await ask(who.host, { p_limit: 5000 });
    expect(out.metadata).toMatchObject({ total_count: 1, returned_count: 1, has_more: false, notes_without_summary: 0 });
  });
});

describe('the catalog row', () => {
  it('is offered to the in-app assistant only, never the outside-AI door', async () => {
    const r = await q(
      `SELECT kind, target, is_write, audience, params->>'x-self-arg' AS self_arg
         FROM public.ai_tool_catalog WHERE name = 'meeting_history'`
    );
    expect(r).toEqual([
      { kind: 'rpc', target: 'ai_rpc_meeting_history', is_write: false, audience: ['assistant'], self_arg: 'p_user_id' },
    ]);
  });
});
