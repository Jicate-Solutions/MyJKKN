#!/usr/bin/env node
/**
 * scripts/ci/check-anon-exposure-live.mjs
 *
 * Scheduled catalog assertion: asks PRODUCTION which relations the public `anon`
 * key can actually reach, and fails when the answer contains something nobody
 * approved.
 *
 * WHY THIS EXISTS — the PR gate cannot see everything.
 *   scripts/ci/check-table-anon-revoke.mjs inspects migration files in a PR diff.
 *   That is the right place to catch most of these, and it does. But on
 *   2026-07-29 `_bak_hostel_to_dayscholar_20260729` shipped with 21 learners'
 *   names, roll numbers and college emails readable AND deletable by anon — and
 *   the PR gate never ran, through no fault of its own. The commit that added the
 *   migration (900eb7148c) belongs to ZERO pull requests; it reached main through
 *   a local `Merge branch 'main' of …` pushed straight up. A PR-scoped gate has
 *   no diff to inspect when there is no PR.
 *
 *   Three separate leaks in four days (2,702 rows on 07-26, 384 rows on 07-28,
 *   21 learner identities on 07-29) all reached production. Two were caught by a
 *   sweep somebody happened to run by hand; the third sat open ~11 hours. Manual
 *   sweeps only ever see the past. This one runs on a timer and sees the present.
 *
 *   The companion guard's own header called for exactly this: "Pair this with a
 *   scheduled catalog assertion."
 *
 * WHAT IT CHECKS — both exposure shapes, because one sweep is blind to the other:
 *   Shape A  RLS off + anon holds the default grant.
 *   Shape B  RLS ON, defeated by a PERMISSIVE policy granted TO public with
 *            USING (true) — the catalog reads "protected" and PostgREST serves
 *            the rows anyway. Several such policies were literally named
 *            "System can manage …" while being wide open.
 *   Views and materialised views are included: Supabase's default privileges
 *   reach them too, and a view that is not security_invoker runs as its OWNER, so
 *   it can republish a correctly locked table.
 *
 * THE ALLOW-LIST IS A TRIPWIRE, NOT A PARDON (anon-exposure-allowlist.json)
 *   `approved`      — ruled on by a human. Silent.
 *   `grandfathered` — exposed when this was built, never explicitly ruled on.
 *                     WARNs every run, and ESCALATES TO FAILURE if the relation
 *                     gains rows while carrying an identity column.
 *   That escalation is the whole point: pde_certificates, pde_learner_badges and
 *   pde_reputation each carry learner_id and hold 0 rows today. A flat allow-list
 *   would bless them permanently and the first certificate issued would be public
 *   with nothing to notice. Emptiness is not safety; it is a deadline.
 *
 * IT NEVER WRITES. Catalog reads and one COUNT(*) per exposed relation. It does
 * not revoke, drop, alter or insert anything — a false positive costs a red run,
 * never a broken login. Locking anything is a human decision, deliberately.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://… node scripts/ci/check-anon-exposure-live.mjs
 *   … --json          machine-readable output
 *   … --report-only   always exit 0 (print findings without failing the run)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const REPORT_ONLY = argv.includes('--report-only');
const fixtureIdx = argv.indexOf('--fixture');
// --fixture <file>: classify rows from a JSON file instead of querying the
// database, so the decision logic is testable without production credentials.
// A gate that cannot be tested is a gate that quietly stops gating.
const FIXTURE = fixtureIdx !== -1 ? argv[fixtureIdx + 1] : null;

const HERE = dirname(fileURLToPath(import.meta.url));
const fnAllowIdx = argv.indexOf('--fn-allowlist');
const fnFixtureIdx = argv.indexOf('--fn-fixture');
const FN_FIXTURE = fnFixtureIdx !== -1 ? argv[fnFixtureIdx + 1] : null;
const allowIdx = argv.indexOf('--allowlist');
const ALLOWLIST_PATH = allowIdx !== -1
  ? resolve(process.cwd(), argv[allowIdx + 1])
  : resolve(HERE, 'anon-exposure-allowlist.json');

/**
 * Two transports, because the two places this runs hold different credentials.
 *
 *   SUPABASE_DB_URL                             → direct Postgres (GitHub Actions)
 *   SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF → Management API (this Mac)
 *
 * The Mac has a Management API token already and no Postgres URL; CI has neither
 * yet. Supporting both means the sweep can start running today on whichever host
 * is credentialled, instead of waiting on a secret nobody has added.
 *
 * DB_URL wins when both are present: a direct connection is one hop, and the
 * Management API can serve a read-replica snapshot several hours stale — which
 * for a security sweep would mean reporting an exposure as closed while it is
 * still open.
 */
const DB_URL = process.env.SUPABASE_DB_URL;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const MGMT_REF = process.env.SUPABASE_PROJECT_REF;
const TRANSPORT = DB_URL ? 'postgres' : (MGMT_TOKEN && MGMT_REF ? 'mgmt-api' : null);

if (!TRANSPORT && !FIXTURE) {
  console.error(`${RED}✗ No way to reach the database.${RESET}
Set ONE of:
  SUPABASE_DB_URL                                (direct Postgres — use the
                                                  SESSION POOLER string on port
                                                  6543; GitHub runners cannot
                                                  reach the direct 5432 host)
  SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF   (Management API)

Exiting 1 rather than 0: a credential-less run that "passes" is the failure mode
this whole script exists to prevent — silence that looks like safety.`);
  process.exit(1);
}

/** Run the exposure query over the Management API. Same SQL, different pipe. */
async function queryViaMgmtApi(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${MGMT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
        // Required — the endpoint refuses a request without a browser-ish UA.
        'User-Agent': 'Mozilla/5.0 (Macintosh)',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body)) {
    // Never fall through to "no rows found" on a transport error: an empty
    // result and a failed request must not look the same to this gate.
    throw new Error(
      `Management API query failed (HTTP ${res.status}): ${JSON.stringify(body)?.slice(0, 300)}`,
    );
  }
  return body;
}

/**
 * Identity columns. Presence does not by itself mean "personal data", but it is
 * the signal that a row here is ABOUT somebody, which is what turns an empty
 * grandfathered table into a future leak.
 */
const IDENTITY_COL_RE =
  '(learner_id|user_id|profile_id|staff_id|student_id|employee_id|assigned_to_user_id|phone|mobile|email|full_name|learner_name|roll_number)';

/**
 * `created_by` is deliberately NOT in that list, though it names a person.
 *
 * It is an AUDIT column: it records who last touched the row, not who the row is
 * about. Almost every config table carries one. Including it meant a lookup table
 * gaining its seventh status row tripped the escalation — rows increased AND
 * "has an identity column" — and hard-failed the run for an ordinary config edit.
 * Caught by running this against live production before shipping it. A gate that
 * cries wolf on routine work gets switched off, which is worse than no gate.
 *
 * assigned_to_user_id stays: a maintenance row genuinely is about the person
 * assigned to it, so publishing one publishes something about them.
 */

/**
 * Both shapes in one pass. `has_table_privilege(role, c.oid, …)` uses the OID
 * form on purpose: the text form resolves through search_path and dies on a
 * same-named table in another schema (hit live on storage.s3_multipart_uploads).
 */
const EXPOSURE_SQL = `
SELECT
  c.relname                                            AS name,
  c.relkind::text                                      AS kind,
  c.relrowsecurity                                     AS rls_on,
  (xpath('/row/cnt/text()',
     query_to_xml(format('SELECT count(*) AS cnt FROM public.%I', c.relname),
                  false, true, '')))[1]::text::bigint  AS rows,
  coalesce((
    SELECT string_agg(a.attname, ',' ORDER BY a.attnum)
    FROM pg_attribute a
    WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname ~* '${IDENTITY_COL_RE}'
  ), '')                                               AS identity_cols
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'v', 'm')
  AND has_table_privilege('anon', c.oid, 'SELECT')
  AND (
    (c.relkind = 'r' AND c.relrowsecurity = false)
    OR EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname
        AND p.permissive = 'PERMISSIVE'
        AND p.cmd IN ('SELECT', 'ALL')
        AND 'public' = ANY(p.roles)
        AND coalesce(p.qual, 'true') = 'true'
    )
  )
ORDER BY 4 DESC NULLS LAST, 1;
`;

const KIND_LABEL = { r: 'table', v: 'view', m: 'materialized view' };

/**
 * SECURITY DEFINER functions in schema public that `anon` can EXECUTE, excluding
 * trigger functions.
 *
 * Only SECDEF, deliberately. A SECDEF function runs as its OWNER, so it bypasses
 * RLS entirely — every table protection means nothing inside one. Non-SECDEF
 * functions run as the caller and RLS still applies; there are ~450 of those and
 * gating them would be noise rather than safety.
 *
 * has_function_privilege() is true whether EXECUTE was granted to anon directly
 * or inherited from PUBLIC, which is the case that matters: the four functions
 * closed on 2026-07-30 had NO anon grant of their own and were reachable purely
 * through PostgreSQL's default EXECUTE-to-PUBLIC.
 *
 * `writes_data` and `has_guard` are text heuristics over the function body, not
 * proof — `%update %` also matches `updated_at`. They are used only to decide
 * WARN vs ESCALATE, never to declare something safe.
 */
const FUNCTION_SQL = `
SELECT
  p.proname                                        AS name,
  pg_get_function_identity_arguments(p.oid)        AS args,
  (pg_get_functiondef(p.oid) ILIKE '%insert into%'
   OR pg_get_functiondef(p.oid) ILIKE '%delete from%'
   OR pg_get_functiondef(p.oid) ~ 'UPDATE[[:space:]]+public\\.')  AS writes_data,
  (pg_get_functiondef(p.oid) ILIKE '%is_super_admin%'
   OR pg_get_functiondef(p.oid) ILIKE '%user_has_permission%'
   OR pg_get_functiondef(p.oid) ILIKE '%auth.uid%'
   OR pg_get_functiondef(p.oid) ILIKE '%role_has_institution_access%'
   OR pg_get_functiondef(p.oid) ILIKE '%api_key_has_permission%')  AS has_guard
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND p.prorettype <> 'trigger'::regtype
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY 1;
`;

function loadAllowlist() {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  const byName = new Map();
  for (const e of raw.relations ?? []) byName.set(e.name, e);
  return byName;
}

/**
 * Function allow-list. Absent file => no function entries => every exposed
 * function reports as unapproved, which fails loudly rather than passing quietly.
 */
function loadFunctionAllowlist() {
  const path = fnAllowIdx !== -1
    ? resolve(process.cwd(), argv[fnAllowIdx + 1])
    : resolve(HERE, 'anon-exposure-functions.json');
  const byName = new Map();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    for (const e of raw.functions ?? []) byName.set(e.name, e);
  } catch {
    if (!JSON_OUT) console.log(`${DIM}(no function allow-list at ${path})${RESET}`);
  }
  return byName;
}

async function runQuery(sql, fixturePath) {
  if (fixturePath) return JSON.parse(readFileSync(resolve(process.cwd(), fixturePath), 'utf8'));
  if (TRANSPORT === 'mgmt-api') return queryViaMgmtApi(sql);
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query(sql)).rows;
  } finally {
    await client.end();
  }
}

const exposed = await runQuery(EXPOSURE_SQL, FIXTURE);
// SKIP_FUNCTIONS keeps the existing relation-only fixtures meaningful: a fixture
// of table rows says nothing about functions, and querying live functions during
// a fixture run would mix real state into a test.
const exposedFns = (FIXTURE && !FN_FIXTURE)
  ? []
  : await runQuery(FUNCTION_SQL, FN_FIXTURE);

const allow = loadAllowlist();

const unapproved = [];   // never allow-listed → hard fail
const escalated = [];    // grandfathered, gained rows, has identity cols → hard fail
const warned = [];       // grandfathered, still quiet
const approved = [];     // ruled on
const seen = new Set();

for (const r of exposed) {
  seen.add(r.name);
  const rows = Number(r.rows ?? 0);
  const ident = r.identity_cols ? r.identity_cols.split(',') : [];
  const entry = allow.get(r.name);
  const rec = { ...r, rows, identity_cols: ident, kind_label: KIND_LABEL[r.kind] ?? r.kind };

  if (!entry) { unapproved.push(rec); continue; }
  if (entry.status === 'approved') { approved.push(rec); continue; }

  const at = Number(entry.rows_at_grandfather ?? 0);
  if (ident.length > 0 && rows > at) {
    escalated.push({ ...rec, rows_at_grandfather: at, reason: entry.reason });
  } else {
    warned.push({ ...rec, rows_at_grandfather: at, reason: entry.reason });
  }
}

// An allow-list entry whose relation is no longer exposed is stale. Not a
// failure — but left forever it becomes a pre-approval for a NAME, so that if a
// future table is created with the same name it is silently blessed.
const stale = [...allow.values()].filter((e) => !seen.has(e.name)).map((e) => e.name);

// --- functions ---------------------------------------------------------------
const fnAllow = loadFunctionAllowlist();
const fnUnapproved = [];  // never allow-listed → hard fail
const fnEscalated = [];   // grandfathered AND writes AND no guard → hard fail
const fnWarned = [];      // grandfathered, guarded or read-only
const fnApproved = [];
const fnSeen = new Set();

for (const f of exposedFns) {
  fnSeen.add(f.name);
  const entry = fnAllow.get(f.name);
  const rec = { ...f, writes_data: !!f.writes_data, has_guard: !!f.has_guard };

  if (!entry) { fnUnapproved.push(rec); continue; }
  if (entry.status === 'approved') { fnApproved.push(rec); continue; }

  // ESCALATE on writes-AND-unguarded, not on writes alone. Two grandfathered
  // writers (fn_update_recruitment_step_comment, generate_hr_leave_balances)
  // raise on a permission check before touching a row, so failing on them would
  // make the gate permanently red for functions that are actually fine — and a
  // permanently red gate gets ignored. Write + no guard is precisely the shape of
  // the four closed on 2026-07-30.
  if (rec.writes_data && !rec.has_guard) {
    fnEscalated.push({ ...rec, reason: entry.reason });
  } else {
    fnWarned.push({ ...rec, reason: entry.reason });
  }
}

const fnStale = [...fnAllow.values()].filter((e) => !fnSeen.has(e.name)).map((e) => e.name);

const failing = unapproved.length + escalated.length + fnUnapproved.length + fnEscalated.length;

if (JSON_OUT) {
  console.log(JSON.stringify({
    exposed: exposed.length, unapproved, escalated, warned, approved: approved.length, stale,
    functions: {
      exposed: exposedFns.length,
      unapproved: fnUnapproved, escalated: fnEscalated,
      warned: fnWarned.length, approved: fnApproved.length, stale: fnStale,
    },
  }, null, 2));
} else {
  console.log(`\n${BOLD}Live anon-exposure sweep${RESET} — ${exposed.length} relation(s) reachable by the anon key.`);
  console.log(`${DIM}  approved ${approved.length} · grandfathered ${warned.length} · escalated ${escalated.length} · unapproved ${unapproved.length}${RESET}`);
  console.log(`${BOLD}SECURITY DEFINER functions${RESET} — ${exposedFns.length} executable by the anon key.`);
  console.log(`${DIM}  approved ${fnApproved.length} · grandfathered ${fnWarned.length} · escalated ${fnEscalated.length} · unapproved ${fnUnapproved.length}${RESET}`);

  if (fnUnapproved.length) {
    console.error(`\n${RED}${BOLD}✗ ${fnUnapproved.length} anon-executable SECDEF function(s) nobody approved:${RESET}`);
    for (const f of fnUnapproved) {
      const tags = [f.writes_data ? `${RED}WRITES${RESET}` : 'reads', f.has_guard ? 'guarded' : `${RED}no guard${RESET}`].join(', ');
      console.error(`  ${RED}•${RESET} ${BOLD}${f.name}${RESET}(${DIM}${f.args}${RESET})  [${tags}]`);
    }
    console.error(`
${YELLOW}A SECDEF function runs as its OWNER, so it bypasses RLS completely.${RESET} Locking the
tables it reads protects nothing inside it. If it takes a caller-supplied id and
has no permission check, anyone can pass any id — that is how 49 learners' names
and emails were readable on 2026-07-30.

${YELLOW}If it should not be public${RESET} — in a migration:
  ${DIM}REVOKE EXECUTE ON FUNCTION public.${fnUnapproved[0].name}(...) FROM anon, PUBLIC;${RESET}
  ${DIM}GRANT  EXECUTE ON FUNCTION public.${fnUnapproved[0].name}(...) TO authenticated;  -- or service_role${RESET}

${YELLOW}The PUBLIC in that REVOKE is load-bearing.${RESET} PostgreSQL grants EXECUTE to PUBLIC by
default, so anon usually has NO grant of its own — meaning REVOKE ... FROM anon
alone changes nothing and reports success. Check the ACL: an entry beginning "=X/"
IS the PUBLIC grant.

${YELLOW}If it is public on purpose${RESET} (a slug, an access code, a share token — the caller has
no account) add it to scripts/ci/anon-exposure-functions.json as "approved" with a
reason a stranger can evaluate.`);
  }

  if (fnEscalated.length) {
    console.error(`\n${RED}${BOLD}✗ ${fnEscalated.length} grandfathered function(s) TRIPPED — they WRITE and have no permission check:${RESET}`);
    for (const f of fnEscalated) {
      console.error(`  ${RED}•${RESET} ${BOLD}${f.name}${RESET}(${DIM}${f.args}${RESET})`);
      console.error(`    ${DIM}${f.reason}${RESET}`);
    }
    console.error(`
${YELLOW}An unauthenticated write is worse than an unauthenticated read.${RESET} A leak can be
closed; a write has already changed your records, and nobody was watching when it
happened. Lock it, or move it to "approved" with a reason why a stranger is
allowed to write here.`);
  }

  if (fnWarned.length) {
    console.log(`\n${YELLOW}⚠ ${fnWarned.length} grandfathered function(s) — anon-executable, never explicitly ruled on:${RESET}`);
    for (const f of fnWarned) {
      const tags = [f.writes_data ? `${YELLOW}writes${RESET}` : 'reads', f.has_guard ? 'guarded' : `${YELLOW}no guard${RESET}`].join(', ');
      console.log(`  ${DIM}·${RESET} ${f.name} ${DIM}[${tags}]${RESET}`);
    }
    console.log(`${DIM}  Not failing the run. Each still deserves a yes/no.${RESET}`);
  }

  if (fnStale.length) {
    console.log(`\n${DIM}ℹ ${fnStale.length} function allow-list entr(ies) no longer anon-executable — safe to delete: ${fnStale.join(', ')}${RESET}`);
  }

  if (unapproved.length) {
    console.error(`\n${RED}${BOLD}✗ ${unapproved.length} relation(s) nobody approved:${RESET}`);
    for (const r of unapproved) {
      const id = r.identity_cols.length ? `  ${RED}identity: ${r.identity_cols.join(', ')}${RESET}` : '';
      console.error(`  ${RED}•${RESET} ${BOLD}${r.name}${RESET} ${DIM}(${r.kind_label}, ${r.rows} rows, RLS ${r.rls_on ? 'on' : 'OFF'})${RESET}${id}`);
    }
    console.error(`
${YELLOW}If it should be private${RESET} — in a migration:
  ${DIM}REVOKE ALL ON TABLE public.${unapproved[0].name} FROM anon, PUBLIC;${RESET}
  ${DIM}ALTER TABLE public.${unapproved[0].name} ENABLE ROW LEVEL SECURITY;${RESET}
  ${DIM}-- RLS on with no policy denies every role; service_role still bypasses it.${RESET}
If RLS is already ON, look for a PERMISSIVE policy granted TO public with
USING (true) — that makes RLS a no-op no matter how reassuring its name is.

${YELLOW}If it is public on purpose${RESET} — add it to scripts/ci/anon-exposure-allowlist.json
with status "approved" and a reason a stranger can evaluate.`);
  }

  if (escalated.length) {
    console.error(`\n${RED}${BOLD}✗ ${escalated.length} grandfathered relation(s) TRIPPED — they gained rows and carry identity columns:${RESET}`);
    for (const r of escalated) {
      console.error(`  ${RED}•${RESET} ${BOLD}${r.name}${RESET} ${DIM}${r.rows_at_grandfather} → ${r.rows} rows${RESET}  ${RED}identity: ${r.identity_cols.join(', ')}${RESET}`);
      console.error(`    ${DIM}${r.reason}${RESET}`);
    }
    console.error(`
${YELLOW}This is the tripwire firing, not a new mistake.${RESET} The relation was empty when it
was grandfathered, so nobody had to decide. It now holds rows about real people
and is readable by the public key. Lock it, or move it to "approved" with a
reason that explains why those rows are public on purpose.`);
  }

  if (warned.length) {
    console.log(`\n${YELLOW}⚠ ${warned.length} grandfathered relation(s) — exposed, never explicitly ruled on:${RESET}`);
    for (const r of warned) {
      const id = r.identity_cols.length ? ` ${YELLOW}[identity: ${r.identity_cols.join(', ')}]${RESET}` : '';
      console.log(`  ${DIM}·${RESET} ${r.name} ${DIM}(${r.kind_label}, ${r.rows} rows)${RESET}${id}`);
    }
    console.log(`${DIM}  Not failing the run. Each still deserves a yes/no — move it to "approved" or lock it.${RESET}`);
  }

  if (stale.length) {
    console.log(`\n${DIM}ℹ ${stale.length} allow-list entr(ies) no longer exposed — safe to delete: ${stale.join(', ')}${RESET}`);
    console.log(`${DIM}  Worth removing: an entry left behind pre-approves the NAME, so a future${RESET}`);
    console.log(`${DIM}  relation created with the same name would be blessed without review.${RESET}`);
  }

  if (!failing) console.log(`\n${GREEN}✓ Nothing reachable by anon that was not approved.${RESET}`);
}

if (REPORT_ONLY && failing) {
  console.log(`\n${DIM}--report-only: ${failing} finding(s) would have failed this run.${RESET}`);
  process.exit(0);
}
process.exit(failing ? 1 : 0);
