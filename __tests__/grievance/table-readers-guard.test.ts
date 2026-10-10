/**
 * THE APP-SIDE READER GATE for complaints marked "about the Joint MD"
 * (deep review of #4079 round 3: three panels in a row each found one more
 * reader that still showed them).
 *
 * Every file under lib/, app/ and supabase/functions/ that names
 * grievance_tickets, grievance_comments or grievance_history must be on the
 * list below, classified:
 *
 *   user-client     reads under the caller's own session. Row-level security
 *                   (migration 20271010020000, section 11) hides these
 *                   complaints from the Joint MD.
 *   service-role    skips row-level security (service role, MCP, B2A key, a
 *                   cron job): MUST leave them out through the one shared
 *                   helper, lib/grievance/about-joint-md-filter.ts.
 *   service-role-internal
 *                   service role, but shows nobody a row or a count (the
 *                   reason says why).
 *   mention-only    names a table only in comments, constraint names or
 *                   strings; reads nothing.
 *   type-or-test    types and tests.
 *   helper          the shared helper itself.
 *
 * It fails on: a file that names the tables and is not listed (a new reader
 * someone added), a listed file that no longer names them (a stale list), a
 * service-role reader without the helper, ANY inline about_joint_md filter
 * outside the helper, a mention-only file that queries a table, and a
 * user-client file that also builds a service-role client without saying why.
 * The database half of the gate is fn_grievance_jmd_reader_gate (section 12b).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

type Kind = 'user-client' | 'service-role' | 'service-role-internal' | 'mention-only' | 'type-or-test' | 'helper';
interface Entry {
  kind: Kind;
  reason: string;
  /** user-client files that ALSO build a service-role client: what it is used for. */
  serviceRoleUse?: string;
}

const GRIEVANCE_TABLE_READERS: Record<string, Entry> = {
  // ── user client: row-level security decides ────────────────────────────────
  'app/(routes)/learners-council/page.tsx': { kind: 'user-client', reason: 'council page counts under the viewer\'s own session' },
  'lib/grievance/actions.ts': {
    kind: 'user-client',
    reason: 'status / send-back actions on the caller\'s own session',
    serviceRoleUse: 'handed to notifyFilerOfChange for the filer\'s bell only; no grievance read',
  },
  'lib/grievance/my-complaints.ts': { kind: 'user-client', reason: 'the filer\'s own complaints, her session' },
  'lib/services/grievance/grievance-service.ts': { kind: 'user-client', reason: 'browser client (createClientSupabaseClient)' },
  'lib/services/learners-council/issue-service.ts': {
    kind: 'user-client',
    reason: 'browser client by default; the InstaSolver route hands it a service-role client for the INSERT only, whose select returns the filer\'s own new row',
  },
  'lib/services/orchestration/director-signals.ts': { kind: 'user-client', reason: 'evaluated with the viewer\'s server session (createClient)' },

  // ── service role: must use the shared helper ───────────────────────────────
  'app/api/b2a/grievance/route.ts': { kind: 'service-role', reason: 'B2A list for an API key' },
  'app/api/b2a/grievance/[id]/route.ts': { kind: 'service-role', reason: 'B2A detail for an API key' },
  'app/api/b2a/grievance/dashboard/route.ts': { kind: 'service-role', reason: 'B2A counts for an API key' },
  'lib/mcp/tools/grievance.ts': { kind: 'service-role', reason: 'MCP tool; ctx.supabase is the service role' },
  'lib/campus-walk/report-card-run.ts': { kind: 'service-role', reason: 'weekly report cards: complaint counts per college' },
  'app/api/learners-council/issues/[id]/route.ts': {
    kind: 'service-role',
    reason: 'the council\'s elevated lookup + update; its before-read (status / assignee of one id, for the filer bell) is never returned',
  },

  // ── service role, shows nothing ────────────────────────────────────────────
  'app/api/cron/grievance-sla-breach-check/route.ts': {
    kind: 'service-role',
    reason: 'pre-migration fallback breach stamp (escalation function missing); through the helper like every service-role reader',
  },

  // ── names only ─────────────────────────────────────────────────────────────
  'app/(routes)/campus-walk/scoreboard/_lib/scoreboard-page.tsx': { kind: 'mention-only', reason: 'comment: nothing here reads complaints' },
  'app/(routes)/instasolver/broken/page.tsx': { kind: 'mention-only', reason: 'comment: broken things never go into complaints' },
  'app/(routes)/instasolver/track/[token]/page.tsx': { kind: 'mention-only', reason: 'comment; reads via fn_track_issue_by_token (allow-listed in the database gate: token holder only)' },
  'app/(routes)/learners-council/issues/_components/issues-kanban-client.tsx': { kind: 'mention-only', reason: 'comment naming a CHECK rule' },
  'app/api/b2a/service_request/route.ts': { kind: 'mention-only', reason: 'a stub\'s explanation string' },
  'app/api/instasolver/broken/route.ts': { kind: 'mention-only', reason: 'comment: why broken things are not complaints' },
  'app/api/instasolver/complaint/route.ts': { kind: 'mention-only', reason: 'comments; files through LCIssueService (listed above)' },
  'lib/campus-walk/repeats.ts': { kind: 'mention-only', reason: 'comment' },
  'lib/campus-walk/report-card.ts': { kind: 'mention-only', reason: 'comments and row types; pure functions over rows report-card-run read' },
  'lib/campus-walk/scoreboard.ts': { kind: 'mention-only', reason: 'comment: nothing here reads complaints' },
  'lib/grievance/complaint-display.ts': { kind: 'mention-only', reason: 'comments on display helpers' },
  'lib/grievance/filer-updates.ts': { kind: 'mention-only', reason: 'comments; writes the filer\'s bell, reads profiles only' },
  'lib/grievance/schema-compat.ts': { kind: 'mention-only', reason: 'comment naming the column' },
  'lib/instasolver/complaint.ts': { kind: 'mention-only', reason: 'comments on columns' },
  'lib/services/campus-walk/campus-walk-service.ts': { kind: 'mention-only', reason: 'comment: why Campus Walk is not complaints' },
  'lib/validations/grievance-ticket.ts': { kind: 'mention-only', reason: 'constraint names it maps to plain words' },

  // ── types and tests ────────────────────────────────────────────────────────
  'lib/types/grievance.ts': { kind: 'type-or-test', reason: 'type definitions only' },
  'lib/types/issues.ts': { kind: 'type-or-test', reason: 'type definitions only' },
  'lib/validations/__tests__/grievance-ticket.test.ts': { kind: 'type-or-test', reason: 'unit test of the constraint wording' },

  // ── the helper ─────────────────────────────────────────────────────────────
  'lib/grievance/about-joint-md-filter.ts': { kind: 'helper', reason: 'the one shared exclusion (and its deploy-order probe)' },
};

const ROOT = join(__dirname, '..', '..');
const SCANNED = ['lib', 'app', 'supabase/functions'];
const TABLES = /\bgrievance_(tickets|comments|history)\b/;
const QUERIES_A_TABLE = /\.from\(\s*['"`]grievance_(tickets|comments|history)['"`]/;
const INLINE_FILTER = /\.(eq|neq|is|not|in|filter|match|or)\(\s*(['"`]about_joint_md\b|ABOUT_JOINT_MD_COLUMN)/;
const SERVICE_ROLE = /createServiceRoleClient|createAdminClient|SUPABASE_SERVICE_ROLE_KEY/;
const HELPER_IMPORT = /from\s+['"]@\/lib\/grievance\/about-joint-md-filter['"]/;
const HELPER_CALL = /\b(readLeavingOutAboutJointMd|leaveOutAboutJointMd)\(/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
}

function scanGrievanceReaders(root: string = ROOT): { all: string[]; naming: string[] } {
  const all: string[] = [];
  for (const d of SCANNED) walk(join(root, d), all);
  const rel = all.map((f) => relative(root, f).split('\\').join('/')).sort();
  return { all: rel, naming: rel.filter((f) => TABLES.test(readFileSync(join(root, f), 'utf8'))) };
}

const { all, naming } = scanGrievanceReaders();
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

describe('every file that names a grievance table is classified', () => {
  it('none is missing from the list (a new reader must be classified here)', () => {
    const missing = naming.filter((f) => !(f in GRIEVANCE_TABLE_READERS));
    expect(missing).toEqual([]);
  });

  it('none on the list is stale', () => {
    const stale = Object.keys(GRIEVANCE_TABLE_READERS).filter((f) => !naming.includes(f));
    expect(stale).toEqual([]);
  });

  it('every entry says why', () => {
    for (const [f, e] of Object.entries(GRIEVANCE_TABLE_READERS)) {
      expect(e.reason.length, f).toBeGreaterThan(5);
    }
  });
});

describe('service-role and MCP readers leave out complaints about the Joint MD', () => {
  const serviceRole = Object.entries(GRIEVANCE_TABLE_READERS).filter(([, e]) => e.kind === 'service-role');

  it.each(serviceRole.map(([f]) => f))('%s goes through the shared helper', (f) => {
    const src = read(f);
    expect(src).toMatch(HELPER_IMPORT);
    expect(src).toMatch(HELPER_CALL);
  });

  it('nothing filters about_joint_md inline: only the helper may', () => {
    const inline = all.filter((f) => f !== 'lib/grievance/about-joint-md-filter.ts' && INLINE_FILTER.test(read(f)));
    expect(inline).toEqual([]);
  });

  it('a mention-only file never queries a grievance table', () => {
    const querying = Object.entries(GRIEVANCE_TABLE_READERS)
      .filter(([f, e]) => (e.kind === 'mention-only' || e.kind === 'type-or-test') && QUERIES_A_TABLE.test(read(f)))
      .map(([f]) => f);
    expect(querying).toEqual([]);
  });

  it('a user-client file that also builds a service-role client says what for', () => {
    const unexplained = Object.entries(GRIEVANCE_TABLE_READERS)
      .filter(([f, e]) => e.kind === 'user-client' && SERVICE_ROLE.test(read(f)) && !e.serviceRoleUse)
      .map(([f]) => f);
    expect(unexplained).toEqual([]);
  });
});
