/**
 * AI estate guard — proof of life for everything that runs itself.
 *
 * WHY THIS EXISTS
 *   On 2026-08-04 an audit found five nightly routines that had thrown the same
 *   Postgres error every night for weeks. The error text was sitting in
 *   ai_routine_schedules.last_status the whole time. The data existed. Nothing
 *   read it.
 *
 *   The same audit found the live anon-exposure sweep red for 23 consecutive
 *   runs since 2026-07-31, and three Max-lane routines enabled since creation
 *   that have never fired once.
 *
 *   None of those were capability failures. Every one was a nobody-was-looking
 *   failure. This script is the looking.
 *
 * THE DEAD-MAN'S SWITCH IS THE POINT
 *   It reports EVERY run, including the all-clear. That is deliberate. If this
 *   job only spoke up when something was wrong, then silence would mean both
 *   "everything is healthy" and "the guard itself is dead" — which is exactly
 *   the ambiguity that let the five routines rot. A guard that can fail silently
 *   is not a guard.
 *
 * IT NEVER WRITES.
 *   Catalog and status reads only. It does not re-run, disable, requeue or
 *   repair anything. Acting on a finding stays a human decision, so a false
 *   positive costs a noisy digest and never a broken subsystem.
 *
 * SEVERITY, AND WHY SILENT-ZERO IS ITS OWN TIER
 *   DOWN   — crashed, or enabled and never once fired. Unambiguous.
 *   SILENT — reported success while producing nothing from work it had found.
 *            This is the tier that motivated the script: scf-learner-notes
 *            reported HTTP 200 with "generated 0 ... candidates 623". A green
 *            tick covered it. Correct-zero and broken-zero are indistinguishable
 *            from outside, so this tier ASKS rather than asserts.
 *   STALE  — enabled, fired once, but not recently enough for its own cadence.
 *   NOTE   — did nothing, but had nothing to do. Listed for completeness only.
 *
 * TRANSPORT — same two-way pattern as check-anon-exposure-live.mjs:
 *   SUPABASE_DB_URL                          → direct Postgres (GitHub Actions)
 *   SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF → management API (local runs)
 *   DB_URL wins when both are present: one hop instead of two.
 *
 * USAGE
 *   SUPABASE_DB_URL=postgres://… node scripts/ci/ai-estate-guard.mjs
 *   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node scripts/ci/ai-estate-guard.mjs
 *
 * EXIT CODES
 *   0 — ran to completion. Findings are reported, never fatal: a red X that
 *       means "something is broken somewhere" trains people to ignore red Xs,
 *       which is how the anon sweep went unread for four days.
 *   1 — the guard could not do its job (no transport, query failed). This is
 *       the only real failure, because it is the only state where the digest
 *       would be a lie.
 */

import pg from 'pg';

const DB_URL = process.env.SUPABASE_DB_URL;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const MGMT_REF = process.env.SUPABASE_PROJECT_REF;
const TRANSPORT = DB_URL ? 'postgres' : (MGMT_TOKEN && MGMT_REF ? 'mgmt-api' : null);

const GH_TOKEN = process.env.GITHUB_TOKEN;
const GH_REPO = process.env.GITHUB_REPOSITORY || 'Jicate-Solutions/MyJKKN';

// NOTE: the transport check lives inside main(), not here. This module is
// imported by its own test suite to exercise classify() without a database, and
// a top-level process.exit(1) would kill the test runner on import.

/* ------------------------------------------------------------------ *
 * Query transport
 * ------------------------------------------------------------------ */

async function query(sql) {
  if (TRANSPORT === 'postgres') {
    const client = new pg.Client({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 30_000,
    });
    await client.connect();
    try {
      const res = await client.query(sql);
      return res.rows;
    } finally {
      await client.end();
    }
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${MGMT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'MyJKKN-ai-estate-guard/1.0',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error(`management API refused the query: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json;
}

/* ------------------------------------------------------------------ *
 * Reading last_status
 *
 * The routines write a human sentence, not a structured result, so this parses
 * prose. Every branch below is derived from real strings observed in production
 * on 2026-08-04 — they are quoted in the comments so a future reader can tell
 * whether a new format has drifted past this parser.
 * ------------------------------------------------------------------ */

// "HTTP 500 · error: there is no unique or exclusion constraint matching…"
// "HTTP 503 · error: Not authorised to refresh the CAC attendance rollup"
const RE_HTTP_FAIL = /HTTP\s+[45]\d\d/i;
const RE_ERROR_WORD = /\berror\b\s*:/i;
// "skipped: not in registry"
const RE_NOT_REGISTERED = /not in registry/i;

// Counters the routines emit for work they FOUND but had not yet done.
const INTAKE_KEYS = ['candidates'];
// Counters for work they actually COMPLETED.
const OUTPUT_KEYS = ['generated', 'created', 'recorded', 'measured', 'sent', 'processed'];

export function readCounters(status) {
  // Matches "candidates 623", "generated 0", "skipped 19" anywhere in the string.
  const counters = {};
  const re = /\b([a-z_]+)\s+(\d+)\b/gi;
  let m;
  while ((m = re.exec(status)) !== null) {
    counters[m[1].toLowerCase()] = Number(m[2]);
  }
  return counters;
}

export function classify(row, now) {
  const status = row.last_status;
  const enabled = row.enabled === true;

  if (!enabled) return { tier: 'OFF', why: 'switched off' };

  if (status === null || status === undefined || row.last_fired_at === null) {
    return {
      tier: 'DOWN',
      why: 'enabled, but has never fired even once — nothing is starting it',
    };
  }

  if (RE_NOT_REGISTERED.test(status)) {
    return { tier: 'DOWN', why: 'the runner does not know this routine exists' };
  }

  if (RE_HTTP_FAIL.test(status) || RE_ERROR_WORD.test(status)) {
    return { tier: 'DOWN', why: status };
  }

  // --- staleness, judged against the routine's own cadence ---------------
  const daysList = Array.isArray(row.days_of_week) ? row.days_of_week : null;
  const runsDaily = !daysList || daysList.length >= 7;
  const graceDays = runsDaily ? 2 : 9;
  const firedAt = new Date(row.last_fired_at);
  const ageDays = (now - firedAt.getTime()) / 86_400_000;
  if (ageDays > graceDays) {
    return {
      tier: 'STALE',
      why: `last fired ${Math.floor(ageDays)} days ago (expected within ${graceDays})`,
    };
  }

  // --- silent zero -------------------------------------------------------
  const counters = readCounters(status);
  const intake = INTAKE_KEYS.reduce((n, k) => n + (counters[k] ?? 0), 0);
  const outputKeysPresent = OUTPUT_KEYS.filter((k) => k in counters);
  const output = outputKeysPresent.reduce((n, k) => n + counters[k], 0);

  if (intake > 0 && output === 0) {
    return {
      tier: 'SILENT',
      why: `found ${intake} item(s) to work on and produced nothing — either every one was correctly skipped, or this is failing quietly`,
    };
  }

  if (outputKeysPresent.length > 0 && output === 0 && intake === 0) {
    return { tier: 'NOTE', why: 'produced nothing, but found nothing to do' };
  }

  return { tier: 'OK', why: status };
}

/* ------------------------------------------------------------------ *
 * Checks
 * ------------------------------------------------------------------ */

const SQL_ROUTINES = `
  SELECT routine_id, enabled, last_status, last_fired_at, days_of_week
  FROM ai_routine_schedules
  ORDER BY routine_id
`;

const SQL_QUEUE = `
  SELECT
    count(*) FILTER (WHERE status = 'error'   AND requested_at > now() - interval '24 hours') AS errors_24h,
    count(*) FILTER (WHERE status = 'done'    AND requested_at > now() - interval '24 hours') AS done_24h,
    count(*) FILTER (WHERE status = 'pending' AND requested_at < now() - interval '2 hours')  AS stuck_pending,
    max(requested_at)                                                                        AS newest
  FROM ai_jobs
`;

async function checkScheduledWorkflows() {
  // Scheduled GitHub workflows are the other half of the estate that runs
  // itself. The anon-exposure sweep was red 23 times running and nothing said
  // so — a repo-side check is the only thing that would have surfaced it.
  if (!GH_TOKEN) {
    return { skipped: 'no GITHUB_TOKEN — scheduled workflow health not checked' };
  }
  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'MyJKKN-ai-estate-guard/1.0',
  };

  const wfRes = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows?per_page=100`, { headers });
  if (!wfRes.ok) return { skipped: `GitHub API said ${wfRes.status}` };
  const { workflows = [] } = await wfRes.json();

  const failing = [];
  for (const wf of workflows) {
    if (wf.state !== 'active') continue;
    // MUST be the per-workflow runs endpoint. The collection endpoint
    // /actions/runs?workflow_id=… silently IGNORES workflow_id and returns the
    // repo's most recent run instead — which made every workflow look like it
    // shared one failing run. Caught in testing on 2026-08-04; had it shipped,
    // the digest would have cried wolf 25 times a day and been ignored within a
    // week, which is the exact failure this guard exists to prevent.
    const runRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${wf.id}/runs?event=schedule&per_page=1`,
      { headers }
    );
    if (!runRes.ok) continue;
    const { workflow_runs = [] } = await runRes.json();
    const latest = workflow_runs[0];
    if (!latest) continue; // never ran on a schedule — not a scheduled workflow
    if (latest.conclusion && latest.conclusion !== 'success') {
      failing.push({
        name: wf.name,
        conclusion: latest.conclusion,
        when: latest.created_at,
        url: latest.html_url,
      });
    }
  }
  return { failing, checked: workflows.length };
}

/**
 * Has anything been merged to main that production is not yet serving?
 *
 * WHY THIS IS HERE
 *   Merging to main is supposed to trigger a Vercel deploy through the GitHub
 *   integration. On 2026-08-04 it did not fire for six merges, and again on
 *   2026-08-05 for one more — three separate occasions where the deploy hook had
 *   to be fired by hand. Nothing anywhere announced the gap.
 *
 *   That failure is invisible by construction: the site keeps serving happily,
 *   every check is green, and the only symptom is that a change somebody merged
 *   simply is not live. No error, no red tick, no alert — the merge looks done.
 *
 *   The routine half of this guard would never catch it, because nothing is
 *   broken in the database. It needs asking from the repository side.
 *
 * Never throws. On any failure it returns a "could not check" shape rather than
 * a clean bill of health, because "I could not tell" and "nothing is wrong" must
 * not look the same — the same rule the blind-digest path follows.
 */
async function checkDeployDrift() {
  if (!GH_TOKEN) return { skipped: 'no GITHUB_TOKEN — deploy drift not checked' };
  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'MyJKKN-ai-estate-guard/1.0',
  };

  try {
    const headRes = await fetch(`https://api.github.com/repos/${GH_REPO}/commits/main`, { headers });
    if (!headRes.ok) return { skipped: `GitHub API said ${headRes.status} for main` };
    const head = await headRes.json();
    const headSha = head?.sha;
    if (!headSha) return { skipped: 'could not read main HEAD' };

    const depRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/deployments?environment=Production%20%E2%80%93%20my-jkkn&per_page=1`,
      { headers },
    );
    // The environment name contains an en dash and is easy to get wrong; fall
    // back to the unfiltered list rather than silently reporting "no deploys".
    let deployments = depRes.ok ? await depRes.json() : [];
    if (!Array.isArray(deployments) || deployments.length === 0) {
      const anyRes = await fetch(`https://api.github.com/repos/${GH_REPO}/deployments?per_page=1`, { headers });
      deployments = anyRes.ok ? await anyRes.json() : [];
    }
    if (!Array.isArray(deployments) || deployments.length === 0) {
      return { skipped: 'no deployment records found' };
    }

    const deployedSha = deployments[0].sha;
    if (deployedSha === headSha) return { drifted: false, headSha, deployedSha };

    // How far behind? A count makes "one merge ago" and "nine merges ago"
    // different sentences, which they should be.
    let behind = null;
    const cmpRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/compare/${deployedSha}...${headSha}`,
      { headers },
    );
    if (cmpRes.ok) {
      const cmp = await cmpRes.json();
      behind = typeof cmp.ahead_by === 'number' ? cmp.ahead_by : null;
    }

    return { drifted: true, headSha, deployedSha, behind };
  } catch (err) {
    return { skipped: `deploy-drift check threw: ${err.message}` };
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const TIER_ORDER = ['DOWN', 'SILENT', 'STALE', 'NOTE', 'OFF', 'OK'];
const TIER_TITLE = {
  DOWN:   'Down — crashed, or never started',
  SILENT: 'Silent — reported success but produced nothing from work it found',
  STALE:  'Stale — has not run recently enough for its own schedule',
  NOTE:   'Idle — nothing produced, but nothing to do',
  OFF:    'Switched off',
};

function buildReport({ routines, queue, workflows, deploy, now }) {
  const buckets = Object.fromEntries(TIER_ORDER.map((t) => [t, []]));
  for (const r of routines) {
    const verdict = classify(r, now);
    buckets[verdict.tier].push({ id: r.routine_id, why: verdict.why });
  }

  const problems = buckets.DOWN.length + buckets.SILENT.length + buckets.STALE.length;
  const wfFailing = workflows.failing?.length ?? 0;
  const stamp = new Date(now).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  const L = [];
  L.push(`# AI estate — proof of life`);
  L.push('');
  L.push(`_Checked ${stamp}. This report is sent every run, including when everything is fine — so if it ever stops arriving, the guard itself has died._`);
  L.push('');

  // --- headline ---------------------------------------------------------
  if (problems === 0 && wfFailing === 0 && !deploy?.drifted) {
    L.push(`**All clear.** ${routines.length} routines checked, nothing down, nothing stale, nothing silently producing zero.`);
  } else {
    const bits = [];
    if (buckets.DOWN.length) bits.push(`${buckets.DOWN.length} down`);
    if (buckets.SILENT.length) bits.push(`${buckets.SILENT.length} silent`);
    if (buckets.STALE.length) bits.push(`${buckets.STALE.length} stale`);
    if (wfFailing) bits.push(`${wfFailing} scheduled check failing`);
    if (deploy?.drifted) bits.push('merged code NOT deployed');
    L.push(`**${bits.join(' · ')}** out of ${routines.length} routines.`);
  }
  L.push('');

  // --- routine tiers ----------------------------------------------------
  for (const tier of ['DOWN', 'SILENT', 'STALE']) {
    if (!buckets[tier].length) continue;
    L.push(`## ${TIER_TITLE[tier]}`);
    L.push('');
    for (const item of buckets[tier]) {
      L.push(`- **\`${item.id}\`** — ${item.why}`);
    }
    L.push('');
  }

  // --- deploy drift -----------------------------------------------------
  L.push('## Is production serving what was merged?');
  L.push('');
  if (deploy.skipped) {
    L.push(`_Not checked: ${deploy.skipped}_`);
  } else if (deploy.drifted) {
    const n = deploy.behind;
    L.push(
      `- ⚠️ **Merged but NOT deployed.** \`main\` is at \`${deploy.headSha.slice(0, 10)}\`, ` +
      `production is serving \`${deploy.deployedSha.slice(0, 10)}\`` +
      (n ? ` — **${n} commit${n === 1 ? '' : 's'} behind**.` : '.'),
    );
    L.push('');
    L.push(
      '  Merging is supposed to trigger a deploy automatically. It did not fire on ' +
      '2026-08-04 (six merges) or 2026-08-05 (one), so this is a known-recurring gap. ' +
      'Nothing looks broken when it happens — the site keeps serving the older build.',
    );
  } else {
    L.push(`Yes — production is serving \`${deploy.deployedSha.slice(0, 10)}\`, the current tip of main.`);
  }
  L.push('');

  // --- scheduled workflows ---------------------------------------------
  L.push('## Scheduled checks (GitHub Actions)');
  L.push('');
  if (workflows.skipped) {
    L.push(`_Not checked: ${workflows.skipped}_`);
  } else if (!wfFailing) {
    L.push(`All ${workflows.checked} active workflows with a schedule last ran green.`);
  } else {
    for (const f of workflows.failing) {
      L.push(`- **${f.name}** — last scheduled run \`${f.conclusion}\` at ${f.when.slice(0, 16).replace('T', ' ')} · [run log](${f.url})`);
    }
  }
  L.push('');

  // --- job queue --------------------------------------------------------
  L.push('## Job queue (last 24 hours)');
  L.push('');
  const q = queue;
  L.push(`- Completed: **${q.done_24h}**`);
  L.push(`- Errored: **${q.errors_24h}**`);
  L.push(`- Stuck waiting over 2 hours: **${q.stuck_pending}**${Number(q.stuck_pending) > 0 ? ' — a worker for that lane is probably not running' : ''}`);
  if (q.newest) {
    const ageH = Math.floor((now - new Date(q.newest).getTime()) / 3_600_000);
    L.push(`- Newest job requested: ${ageH} hour(s) ago${ageH > 24 ? ' — nothing has queued a job in over a day' : ''}`);
  }
  L.push('');

  // --- quiet tiers, folded ---------------------------------------------
  const quiet = [...buckets.NOTE, ...buckets.OFF];
  if (quiet.length) {
    L.push('<details><summary>');
    L.push(`Idle or switched off (${quiet.length}) — listed for completeness, no action implied`);
    L.push('</summary>');
    L.push('');
    for (const item of quiet) L.push(`- \`${item.id}\` — ${item.why}`);
    L.push('');
    L.push('</details>');
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push(`Healthy: **${buckets.OK.length}** · Idle: ${buckets.NOTE.length} · Off: ${buckets.OFF.length} · Total: ${routines.length}`);
  L.push('');
  L.push('_Generated by `scripts/ci/ai-estate-guard.mjs`. It reads only — it never re-runs, disables or repairs anything._');

  return { markdown: L.join('\n'), problems, wfFailing, buckets };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  if (!TRANSPORT) {
    console.error(
      'FATAL: no way to reach the database.\n' +
      '  Set SUPABASE_DB_URL (direct Postgres), or both SUPABASE_ACCESS_TOKEN and\n' +
      '  SUPABASE_PROJECT_REF (management API).'
    );
    process.exit(1);
  }

  const now = Date.now();

  let routines, queueRows, workflows;
  try {
    [routines, queueRows] = await Promise.all([query(SQL_ROUTINES), query(SQL_QUEUE)]);
  } catch (err) {
    console.error(`FATAL: the guard could not read the database — ${err.message}`);
    console.error('Reporting nothing would look identical to reporting all-clear, so this exits 1.');
    process.exit(1);
  }

  let deploy;
  try {
    workflows = await checkScheduledWorkflows();
  } catch (err) {
    workflows = { skipped: `check threw: ${err.message}` };
  }
  deploy = await checkDeployDrift();

  const report = buildReport({
    routines,
    queue: queueRows[0] ?? {},
    workflows,
    deploy,
    now,
  });

  console.log(report.markdown);

  // Machine-readable tail for the workflow step that posts the digest.
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    const summary = report.problems === 0 && report.wfFailing === 0
      ? 'all clear'
      : `${report.buckets.DOWN.length} down, ${report.buckets.SILENT.length} silent, ${report.buckets.STALE.length} stale, ${report.wfFailing} checks red`;
    appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summary}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `problems=${report.problems + report.wfFailing}\n`);
  }
}

// Only sweep when executed directly. Importing this module (the test suite does)
// must not hit the network.
const RUN_DIRECTLY =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (RUN_DIRECTLY) {
  main().catch((err) => {
    console.error(`FATAL: ${err.stack || err.message}`);
    process.exit(1);
  });
}
