/**
 * Behavioural proof for
 * supabase/migrations/20271008123017_wall_handover_hr_playbooks_manage.sql
 * (Director 8 Oct 05:30: a Director handover must not hand over playbook
 * management).
 *
 * Each case builds a throwaway database, applies main's previous wall file
 * (20270710090000) and then this file VERBATIM with psql in ONE transaction
 * (`-1`), the way the operator's apply wraps it.
 *
 * The file opens with a drift guard: it may only replace a body that is
 * byte-identical to 20270710090000's. The last two cases prove the guard
 * fires — and that, because it fires before the replace, nothing changes.
 *
 * HANDOVER_WALL_TEST_PGUSER overrides the user (CI: postgres).
 * REQUIRES a local PostgreSQL 16 (see "THE POSTGRES SERVICE" in .github/workflows/test-suite.yml).
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '..', '..');
const PREVIOUS = path.join(REPO, 'supabase/migrations/20270710090000_wall_handover_safe_split.sql');
const THIS_FILE =
  process.env.HANDOVER_WALL_TEST_MIGRATION ??
  path.join(REPO, 'supabase/migrations/20271008123017_wall_handover_hr_playbooks_manage.sql');
const PGHOST = process.env.HANDOVER_WALL_TEST_PGHOST ?? 'localhost';
const PGPORT = process.env.HANDOVER_WALL_TEST_PGPORT ?? '5432';
const PGUSER =
  process.env.HANDOVER_WALL_TEST_PGUSER ?? (process.env.CI ? 'postgres' : process.env.USER ?? 'postgres');

const PRELUDE = `
DO $$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase's default: every new function is executable by anon and authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

const TMP = mkdtempSync(path.join(os.tmpdir(), 'hwall-'));
const created: string[] = [];

function psql(db: string, args: string[]) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-v', 'ON_ERROR_STOP=1', '-q', '-d', db, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function freshDb(): string {
  const db = `hwall_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  try {
    psql('postgres', ['-c', `CREATE DATABASE ${db}`]);
  } catch (e) {
    throw new Error(`Local PostgreSQL 16 is required (${String(e).slice(0, 200)})`);
  }
  created.push(db);
  psql(db, ['-c', PRELUDE]);
  return db;
}

/** Apply a file in one transaction; return the error text, or null. */
function apply(db: string, file: string): string | null {
  try {
    psql(db, ['-1', '-f', file]);
    return null;
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return String(err.stderr ?? err.message ?? e);
  }
}

function blocked(db: string, key: string): boolean {
  const out = psql(db, ['-At', '-c', `SELECT public.fn_handover_key_is_blocked('${key}')`]).trim();
  return out === 't';
}

function bodyMd5(db: string): string {
  return psql(db, [
    '-At',
    '-c',
    `SELECT md5(prosrc) FROM pg_proc WHERE proname = 'fn_handover_key_is_blocked'`,
  ]).trim();
}

afterAll(() => {
  for (const db of created) {
    try {
      psql('postgres', ['-c', `DROP DATABASE IF EXISTS ${db}`]);
    } catch {
      /* best effort */
    }
  }
});

describe('20271008123017 — playbook management cannot be handed over', () => {
  it('before: main left hr.harness.playbooks.manage handable; after: it is walled', () => {
    const db = freshDb();
    expect(apply(db, PREVIOUS)).toBeNull();
    expect(blocked(db, 'hr.harness.playbooks.manage')).toBe(false);

    expect(apply(db, THIS_FILE)).toBeNull();
    expect(blocked(db, 'hr.harness.playbooks.manage')).toBe(true);
  });

  it('walls the exact key only — the harness desk view and earlier decisions are unchanged', () => {
    const db = freshDb();
    expect(apply(db, PREVIOUS)).toBeNull();
    expect(apply(db, THIS_FILE)).toBeNull();
    // Still handable.
    for (const key of ['hr.harness.desks.view', 'hr.leave.approve', 'events.edit', 'learners.leave_types.view']) {
      expect(blocked(db, key), key).toBe(false);
    }
    // Still walled.
    for (const key of ['learners.leave_types.manage', 'users.create', 'super_admin', 'hr.payroll.view']) {
      expect(blocked(db, key), key).toBe(true);
    }
  });

  it('anon cannot execute it; authenticated and service_role can', () => {
    const db = freshDb();
    expect(apply(db, PREVIOUS)).toBeNull();
    expect(apply(db, THIS_FILE)).toBeNull();
    const out = psql(db, [
      '-At',
      '-c',
      `SELECT has_function_privilege('anon', 'public.fn_handover_key_is_blocked(text)', 'EXECUTE'),
              has_function_privilege('authenticated', 'public.fn_handover_key_is_blocked(text)', 'EXECUTE'),
              has_function_privilege('service_role', 'public.fn_handover_key_is_blocked(text)', 'EXECUTE')`,
    ]).trim();
    expect(out).toBe('f|t|t');
  });

  it('a second apply is harmless', () => {
    const db = freshDb();
    expect(apply(db, PREVIOUS)).toBeNull();
    expect(apply(db, THIS_FILE)).toBeNull();
    expect(apply(db, THIS_FILE)).toBeNull();
    expect(blocked(db, 'hr.harness.playbooks.manage')).toBe(true);
  });
});

describe('20271008123017 — the drift guard', () => {
  it('refuses, changing nothing, when the live body is not main\'s 20270710090000 body', () => {
    // A live body that moved: someone walled events.edit by hand.
    const drifted = readFileSync(PREVIOUS, 'utf8').replace(
      "'learners.leave_types.manage',          -- define leave types and their approval flows",
      "'learners.leave_types.manage', 'events.edit_hand_walled', -- define leave types and their approval flows",
    );
    expect(drifted).not.toBe(readFileSync(PREVIOUS, 'utf8'));
    const driftedFile = path.join(TMP, 'drifted.sql');
    writeFileSync(driftedFile, drifted);

    const db = freshDb();
    expect(apply(db, driftedFile)).toBeNull();
    const before = bodyMd5(db);

    const error = apply(db, THIS_FILE);
    expect(error).toMatch(/drifted from main/);
    expect(error).toMatch(/Nothing was changed/);
    // The replace never ran: same body, key still handable, hand-made wall kept.
    expect(bodyMd5(db)).toBe(before);
    expect(blocked(db, 'hr.harness.playbooks.manage')).toBe(false);
    expect(blocked(db, 'events.edit_hand_walled')).toBe(true);
  });

  it('refuses when the function does not exist at all', () => {
    const db = freshDb();
    const error = apply(db, THIS_FILE);
    expect(error).toMatch(/fn_handover_key_is_blocked\(text\) is missing/);
    const n = psql(db, ['-At', '-c', `SELECT count(*) FROM pg_proc WHERE proname = 'fn_handover_key_is_blocked'`]).trim();
    expect(n).toBe('0');
  });
});
