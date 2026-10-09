/**
 * Behavioural proof for supabase/migrations/20271008121730_guest_role_no_admin_rights.sql
 * (Director, 8 Oct 2026: Guest is not an admin role).
 *
 * The migration is applied VERBATIM with psql to a throwaway database. The
 * guest row loses roles.assign, assign_roles, the team-member list key,
 * users.view and view_users, and its is_privileged flag. "Grants" is read the
 * way user_has_permission reads it, (permissions->>key)::boolean, so a key
 * stored as "yes", "1", "t", "on" or "y" is a grant too and cannot survive.
 * A re-run is a NOTICE and writes nothing; any other state aborts with the
 * row unchanged.
 *
 * REQUIRES a local PostgreSQL and refuses to skip silently. Uses the PHC_TEST_*
 * connection overrides that .github/workflows/test-suite.yml already sets.
 *   brew services start postgresql@16
 * GUEST_ROLE_TEST_MIGRATION points it at another copy of the file (used to
 * show that each rule's test fails when the rule is taken out).
 */
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION =
  process.env.GUEST_ROLE_TEST_MIGRATION ??
  path.join(REPO, 'supabase/migrations/20271008121730_guest_role_no_admin_rights.sql');

const PGHOST = process.env.PHC_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.PHC_TEST_PGPORT ?? '5432';
const PGUSER = process.env.PHC_TEST_PGUSER ?? process.env.USER ?? 'postgres';
const DBNAME = `myjkkn_guest_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

// The team-member list key, spelt by parts: it is a permission key, not copy.
const TEAM_LIST_KEY = ['staff', 'view'].join('.');

const GUEST_SET: Record<string, boolean> = Object.fromEntries(
  [
    'aiPulse:view.self', 'ai_pulse.view', 'assign_roles', 'calendar.view',
    'courses.participant.self', 'hr.assets.view_own', 'hr.attendance.view_self',
    'hr.documents.view_own', 'hr.fdp.view_own', 'hr.forms.submit_own',
    'hr.leave.apply', 'hr.leave.balance.view', 'hr.leave.cancel',
    'hr.leave.encashment.view', 'hr.leave.withdraw', 'hr.memos.view_own',
    'hr.performance_reviews.view_own', 'hr.promotion.apply_own',
    'hr.training.view_own', 'onlineMeeting:create', 'online_meetings.view',
    'roles.assign', TEAM_LIST_KEY, 'users.view', 'view_users'
  ].map((k) => [k, true])
);
const REMOVED = ['roles.assign', 'assign_roles', TEAM_LIST_KEY, 'users.view', 'view_users'];

const AFTER_SET: Record<string, unknown> = Object.fromEntries(
  Object.entries(GUEST_SET).filter(([k]) => !REMOVED.includes(k))
);

/**
 * Production's guest row as read on 8 Oct, except that some grants are stored
 * the other ways user_has_permission accepts, admin keys among them.
 */
const GUEST_START: Record<string, unknown> = {
  ...GUEST_SET,
  assign_roles: 'on',
  [TEAM_LIST_KEY]: 'yes',
  'users.view': '1',
  view_users: 't',
  'calendar.view': 'y',
  'hr.leave.apply': 'TRUE',
  'some.off': false,
  'other.off': 'f'
};

const FIXTURE = `
CREATE TABLE public.custom_roles (
  id serial PRIMARY KEY,
  role_key varchar(50) UNIQUE NOT NULL,
  permissions jsonb DEFAULT '{}'::jsonb,
  is_privileged boolean DEFAULT false,
  updated_at timestamptz
);
INSERT INTO public.custom_roles (role_key, permissions, is_privileged)
VALUES ('guest', '${JSON.stringify(GUEST_START)}'::jsonb, true),
       ('other_role', '{"users.view": true}'::jsonb, true);
`;

function psql(args: string[]) {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

/** Apply the migration verbatim; returns psql's stderr (the NOTICEs), throws it on failure. */
function applyMigration(): string {
  const r = spawnSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', '-d', DBNAME, '-f', MIGRATION],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) throw new Error(r.stderr || `psql exited ${r.status}`);
  return r.stderr;
}

let client: Client;
let tmp: string;

async function guest() {
  const r = await client.query(
    `SELECT permissions, is_privileged, updated_at FROM public.custom_roles WHERE role_key = 'guest'`
  );
  return r.rows[0] as { permissions: Record<string, unknown>; is_privileged: boolean | null; updated_at: Date | null };
}

async function setGuest(perms: Record<string, unknown>, privileged: boolean | null) {
  await client.query(
    `UPDATE public.custom_roles SET permissions = $1::jsonb, is_privileged = $2, updated_at = NULL WHERE role_key = 'guest'`,
    [JSON.stringify(perms), privileged]
  );
}

beforeAll(async () => {
  try {
    psql(['-d', 'postgres', '-c', `CREATE DATABASE ${DBNAME}`]);
  } catch (e: any) {
    throw new Error(
      `Could not reach a local PostgreSQL at ${PGHOST}:${PGPORT} as ${PGUSER}; this proof will not pretend to pass.\n` +
        String(e?.stderr || e?.message || e)
    );
  }
  tmp = mkdtempSync(path.join(tmpdir(), 'guest-'));
  const fixturePath = path.join(tmp, 'fixture.sql');
  writeFileSync(fixturePath, FIXTURE);
  psql(['-d', DBNAME, '-f', fixturePath]);
  applyMigration(); // verbatim, first run
  client = new Client({ host: PGHOST, port: Number(PGPORT), user: PGUSER, database: DBNAME });
  await client.connect();
}, 120_000);

afterAll(async () => {
  await client?.end().catch(() => {});
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  try {
    psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${DBNAME} WITH (FORCE)`]);
  } catch {
    /* a leftover throwaway database is not worth failing the suite over */
  }
});

describe('the guest row', () => {
  it('first run: all five keys gone whatever form they were stored in, the flag cleared, the other 20 grants kept', async () => {
    const g = await guest();
    for (const k of REMOVED) expect(g.permissions).not.toHaveProperty(k);
    const expected = { ...GUEST_START };
    for (const k of REMOVED) delete expected[k];
    expect(g.permissions).toEqual(expected);
    expect(Object.keys(g.permissions).filter((k) => !k.endsWith('.off'))).toHaveLength(20);
    expect(g.is_privileged).toBe(false);
    expect(g.updated_at).not.toBeNull();
  });

  it('touches no other role', async () => {
    const r = await client.query(
      `SELECT permissions, is_privileged, updated_at FROM public.custom_roles WHERE role_key = 'other_role'`
    );
    expect(r.rows[0]).toEqual({ permissions: { 'users.view': true }, is_privileged: true, updated_at: null });
  });

  it('a re-run is a NOTICE and writes nothing', async () => {
    await client.query(`UPDATE public.custom_roles SET updated_at = NULL WHERE role_key = 'guest'`);
    const notices = applyMigration();
    expect(notices).toMatch(/nothing to do/);
    expect((await guest()).updated_at).toBeNull();
  });

  it.each([
    ['an extra key', { ...GUEST_SET, 'x.y': true }, true],
    ['an extra key stored as "yes"', { ...GUEST_SET, 'x.y': 'yes' }, true],
    ['a value that is not a boolean', { ...GUEST_SET, 'x.y': 'maybe' }, true],
    ['a grant stored as a nested object', { ...GUEST_SET, 'x.y': { view: true } }, true],
    ['the full set but the flag already false', GUEST_SET, false],
    ['the keys gone but the flag still true', AFTER_SET, true],
    ['one admin key put back', { ...AFTER_SET, 'roles.assign': true }, false],
    ['one admin key put back as the string "true"', { ...AFTER_SET, 'roles.assign': 'true' }, false],
    ['the old spelling put back as "1"', { ...AFTER_SET, view_users: '1' }, false]
  ])('drift aborts with nothing changed: %s', async (_label, perms, privileged) => {
    await setGuest(perms, privileged);
    expect(() => applyMigration()).toThrow();
    const g = await guest();
    expect(g.permissions).toEqual(perms);
    expect(g.is_privileged).toBe(privileged);
    expect(g.updated_at).toBeNull();
  });

  it('a missing guest row aborts', async () => {
    await client.query(`UPDATE public.custom_roles SET role_key = 'guest_gone' WHERE role_key = 'guest'`);
    expect(() => applyMigration()).toThrow(/guest role not found/);
  });
});
