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
const allowIdx = argv.indexOf('--allowlist');
const ALLOWLIST_PATH = allowIdx !== -1
  ? resolve(process.cwd(), argv[allowIdx + 1])
  : resolve(HERE, 'anon-exposure-allowlist.json');

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL && !FIXTURE) {
  console.error(`${RED}✗ SUPABASE_DB_URL is not set.${RESET}
This gate reads production directly. Set the secret at /settings/secrets/actions.
Exiting 1 rather than 0: a credential-less run that "passes" is the failure mode
this whole script exists to prevent — silence that looks like safety.`);
  process.exit(1);
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

function loadAllowlist() {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  const byName = new Map();
  for (const e of raw.relations ?? []) byName.set(e.name, e);
  return byName;
}

let exposed;
if (FIXTURE) {
  exposed = JSON.parse(readFileSync(resolve(process.cwd(), FIXTURE), 'utf8'));
} else {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    exposed = (await client.query(EXPOSURE_SQL)).rows;
  } finally {
    await client.end();
  }
}

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

const failing = unapproved.length + escalated.length;

if (JSON_OUT) {
  console.log(JSON.stringify(
    { exposed: exposed.length, unapproved, escalated, warned, approved: approved.length, stale }, null, 2));
} else {
  console.log(`\n${BOLD}Live anon-exposure sweep${RESET} — ${exposed.length} relation(s) reachable by the anon key.`);
  console.log(`${DIM}  approved ${approved.length} · grandfathered ${warned.length} · escalated ${escalated.length} · unapproved ${unapproved.length}${RESET}`);

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
