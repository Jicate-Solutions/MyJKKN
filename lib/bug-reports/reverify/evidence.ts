// lib/bug-reports/reverify/evidence.ts
// Tier 2 bug re-verification — evidence gathering.
//
// Gathers evidence, AS THE REPORTER where possible, about whether a previously
// reported bug is still reproducible. All checks are READ-ONLY. The evidence is
// handed to the `bug.reverify` recipe, which only JUDGES it — it never acts.
//
// Three generic signals ship in v1 (no per-page mapping required):
//   1. reporter reachability   — impersonate reporter_user_id (60s JWT) and
//        confirm the account/role/institution scope still resolves under RLS.
//        Catches "I lost access" regressions from the reporter's own vantage.
//   2. error-signature recurrence — has the console error captured on this
//        report reappeared on any report filed AFTER the fix went live?
//   3. symptom recurrence — within this bug's duplicate cluster, how many
//        members were filed after the fix went live, and how recently? (still
//        arriving = not fixed; quiet since the fix = likely fixed/worked-around).
//
// Both recurrence checks measure against the FIX BOUNDARY (when the fix
// deployed), not each report's own filing date — see gatherEvidence's
// `fixBoundaryIso`. Pre-fix reports are what the fix targets, never evidence it
// failed.
//
// The `ReverifyProbe` registry is the extension point for per-surface
// data-presence probes (v1.1): e.g. "does learner X now appear in Semester
// Search for the reporter's scope?" Unmapped surfaces degrade gracefully to the
// three generic signals above — never a false "fixed".

import { createImpersonatedClient } from '@/lib/auth/impersonate';

export interface ReverifyBug {
  id: string;
  display_id: string | null;
  description: string | null;
  page_url: string | null;
  module_name: string | null;
  sub_module_name: string | null;
  category: string | null;
  console_logs: unknown;
  reporter_user_id: string | null;
  institution_id: string | null;
  created_at: string;
}

export interface EvidenceBundle {
  reporter_reachable: string; // human-readable, goes straight into the prompt
  reporter_scope_note: string;
  probe_result: string;
  error_recurrence: string;
  symptom_recurrence: string;
}

/** A per-surface data-presence probe. Registry is empty in v1; v1.1 adds one
 *  entry per instrumented read surface. `match` decides if the probe applies to
 *  a bug; `run` re-executes the read AS THE REPORTER (the passed client is a
 *  Supabase client scoped to the reporter's JWT) and returns a human-readable
 *  result line for the evidence bundle. */
export interface ReverifyProbe {
  id: string;
  match: (bug: ReverifyBug) => boolean;
  run: (reporterClient: any, bug: ReverifyBug) => Promise<string>;
}

// Scope columns on learners_profiles that the /learners/profiles list filters by
// (mirrors app/(routes)/learners/profiles/_data/get-learner-profiles.ts). Parsed
// from the report's page_url so the probe re-runs the reporter's exact query.
const LEARNER_SCOPE_KEYS = [
  'institution_id',
  'degree_id',
  'department_id',
  'program_id',
  'semester_id',
  'section_id',
] as const;

// Common non-name words to strip when pulling a person-name out of free text.
const NAME_STOPWORDS = new Set([
  'learner', 'learners', 'profile', 'profiles', 'search', 'semester', 'support',
  'team', 'dear', 'subject', 'issue', 'kindly', 'thank', 'student', 'section',
  'department', 'program', 'degree', 'institution', 'myjkkn', 'the', 'however',
]);

/** Pull candidate person-names (Title-case runs) from a report, dropping common
 *  non-name phrases. Heuristic by design — the probe reports what it matched, so
 *  a miss degrades to a scope-count signal rather than a false verdict. */
export function extractCandidateNames(text: string): string[] {
  const out: string[] = [];
  const re = /\b([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]*){1,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text ?? '')) !== null) {
    const words = m[1].trim().split(/\s+/);
    const meaningful = words.filter((w) => !NAME_STOPWORDS.has(w.toLowerCase().replace(/\./g, '')));
    if (meaningful.length >= 2) out.push(meaningful.join(' '));
  }
  return [...new Set(out)].slice(0, 4);
}

/** Significant name tokens for fuzzy matching — drops single-letter initials so
 *  "Lakshmi Priya R" matches a DB record stored as "R.LAKSHMI PRIYA". */
function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/\./g, ' ').split(/\s+/).filter((t) => t.length > 1);
}

// v1.1 data-presence probes. Each re-runs the reporter's real read AS THE
// REPORTER (RLS-scoped) and reports whether the expected data is now present.
export const REVERIFY_PROBES: ReverifyProbe[] = [
  {
    // Learner-visibility: "a specific learner is not showing / not appearing in
    // the list or semester search". Re-runs the /learners/profiles list as the
    // reporter for the exact scope in page_url and checks whether the named
    // learner is now present. Because it runs under the reporter's RLS, a
    // permission regression surfaces as an error/empty (still-broken), and a
    // data fix (learner now tagged to the scope) surfaces as present (fixed).
    id: 'learner-in-scope',
    match: (bug) => {
      const url = bug.page_url ?? '';
      const desc = (bug.description ?? '').toLowerCase();
      return (
        /\/learners\//.test(url) &&
        /[?&](department_id|program_id|semester_id|section_id)=/.test(url) &&
        /(not (showing|appear|visible|found|listed)|missing|can'?t (see|find)|does ?n'?t (show|appear)|unable to (see|find|view))/.test(
          desc
        )
      );
    },
    run: async (client, bug) => {
      let scope: Array<[string, string]>;
      try {
        const u = new URL(bug.page_url!);
        scope = LEARNER_SCOPE_KEYS.map(
          (k) => [k, u.searchParams.get(k)] as [string, string | null]
        ).filter((e): e is [string, string] => !!e[1]);
      } catch {
        return 'Could not parse the scope from the report page URL.';
      }
      if (scope.length === 0) return 'The report page URL carries no learner scope to re-query.';

      let q = client
        .from('learners_profiles')
        .select('first_name, last_name', { count: 'exact' });
      for (const [k, v] of scope) q = q.eq(k, v);
      const { data, count, error } = await q.limit(300);
      if (error) {
        return `Re-running the learners list AS THE REPORTER failed under their access (${String(
          error.message
        ).slice(0, 100)}) — the reporter may still be unable to see this data.`;
      }
      const total = count ?? data?.length ?? 0;
      const scopeLabel = scope.map(([k]) => k.replace('_id', '')).join('+');

      const names = extractCandidateNames(bug.description ?? '');
      if (names.length === 0) {
        return `Re-ran the learners list as the reporter for their ${scopeLabel} scope: ${total} learner(s) now visible to them. (No specific learner name found in the report to check individually.)`;
      }
      for (const name of names) {
        const toks = nameTokens(name);
        if (toks.length === 0) continue;
        const hit = (data ?? []).find((r: any) => {
          const full = `${r.first_name ?? ''} ${r.last_name ?? ''}`.toLowerCase();
          return toks.every((t) => full.includes(t));
        });
        if (hit) {
          return `Re-ran the learners list as the reporter (${total} visible in their ${scopeLabel} scope): a learner matching "${name}" IS now present (${hit.first_name} ${hit.last_name}) — the reported item appears fixed.`;
        }
      }
      return `Re-ran the learners list as the reporter (${total} visible in their ${scopeLabel} scope): NO learner matching ${names
        .map((n) => `"${n}"`)
        .join(' / ')} was found — the reported item still appears missing.`;
    },
  },
];

/** Cheap "is this a read symptom" heuristic. Write symptoms cannot be safely
 *  re-checked read-only, so they are flagged for the judge to return
 *  inconclusive/reproducible:write. */
export function classifyReproducibility(description: string): 'read' | 'write' | 'unknown' {
  const d = (description ?? '').toLowerCase();
  const write = /(submit|saving|save|unable to mark|not generat|not creat|upload|delet|update|can'?t add|not post)/;
  const read = /(not showing|not appear|can'?t see|cannot see|not visible|missing|empty|blank|no data|does not show|doesn'?t show|unable to (view|access|find|open))/;
  if (write.test(d)) return 'write';
  if (read.test(d)) return 'read';
  return 'unknown';
}

/** Extract a short, stable error signature from a report's console_logs so we
 *  can look for the same failure on newer reports. */
export function errorSignature(consoleLogs: unknown): string | null {
  if (!Array.isArray(consoleLogs)) return null;
  const err = consoleLogs.find(
    (l: any) => l && (l.type === 'error' || l.level === 'error') && typeof l.message === 'string'
  ) as any;
  if (!err?.message) return null;
  // First ~60 chars of the message, stripped of volatile ids/timestamps.
  return String(err.message).replace(/[0-9a-f-]{16,}/gi, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * Gather the evidence bundle. `admin` is a service-role client (used for the
 * recurrence queries, which read across reporters). The reachability probe uses
 * a fresh impersonated client scoped to the reporter.
 *
 * `fixBoundaryIso` is when the fix went live (the verify request time — a human
 * only clicks Verify AFTER merge + deploy, so it is a guaranteed-post-deploy
 * boundary). Recurrence is measured relative to it, NOT the report's own filing
 * date: reports that predate the fix are the very reports the fix TARGETS — they
 * are not evidence the fix failed. Without this, every member of a pre-fix
 * duplicate wave counts as "still recurring", so a genuinely-fixed group's
 * re-check reads "still broken". Omitted → falls back to the report date (the
 * old behaviour) for callers that have no fix boundary.
 */
export async function gatherEvidence(
  bug: ReverifyBug,
  admin: any,
  fixBoundaryIso?: string
): Promise<EvidenceBundle> {
  // The recurrence window starts at the later of (fix went live, report filed).
  // For a post-deploy re-check this is the fix boundary; with no boundary it is
  // the report date (unchanged v1 behaviour).
  const since =
    fixBoundaryIso && fixBoundaryIso > bug.created_at ? fixBoundaryIso : bug.created_at;
  const sinceIsFixBoundary = since === fixBoundaryIso;

  // Fault-isolate each signal: a failure in one must not sink the others (the
  // cluster-recurrence signal is the most valuable and must survive on its own).
  const settle = async (p: Promise<any>, fallback: any) => {
    try { return await p; } catch { return fallback; }
  };
  const [reach, errRec, symRec] = await Promise.all([
    settle(gatherReporterReachability(bug), { reachable: 'unknown', note: 'Reachability check errored.' }),
    settle(gatherErrorRecurrence(bug, admin, since, sinceIsFixBoundary), 'Error-recurrence check unavailable.'),
    settle(gatherSymptomRecurrence(bug, admin, since, sinceIsFixBoundary), 'Recurrence check unavailable.'),
  ]);

  // v1: no registered data-presence probes → generic evidence only.
  const probe = REVERIFY_PROBES.find((p) => p.match(bug));
  let probe_result = 'No data-presence probe is registered for this surface — judged on access + recurrence signals only.';
  if (probe && bug.reporter_user_id) {
    try {
      const client = await createImpersonatedClient(bug.reporter_user_id);
      probe_result = await probe.run(client as any, bug);
    } catch (e: any) {
      probe_result = `Data-presence probe '${probe.id}' could not run: ${String(e?.message ?? e).slice(0, 120)}`;
    }
  }

  return {
    reporter_reachable: reach.reachable,
    reporter_scope_note: reach.note,
    probe_result,
    error_recurrence: errRec,
    symptom_recurrence: symRec,
  };
}

async function gatherReporterReachability(
  bug: ReverifyBug
): Promise<{ reachable: string; note: string }> {
  if (!bug.reporter_user_id) {
    return { reachable: 'unknown', note: 'Report has no linked reporter account to impersonate.' };
  }
  try {
    const client = await createImpersonatedClient(bug.reporter_user_id);
    // Read own profile under the reporter's RLS: proves the account resolves and
    // the JWT scope is valid. `is_active`/role/institution reveal access regressions.
    const { data, error } = await (client as any)
      .from('profiles')
      .select('id, role, institution_id, is_active')
      .eq('id', bug.reporter_user_id)
      .maybeSingle();

    if (error) {
      return {
        reachable: 'no',
        note: `Reporter's own session could not read their profile (RLS/scope error): ${String(error.message).slice(0, 100)}. Possible access regression.`,
      };
    }
    if (!data) {
      return {
        reachable: 'no',
        note: 'Reporter can no longer see their own profile row — likely deactivated or scope-stripped.',
      };
    }
    const active = (data as any).is_active !== false;
    const roleNow = (data as any).role ?? 'unknown';
    const instMatch = (data as any).institution_id === bug.institution_id;
    return {
      reachable: active ? 'yes' : 'account inactive',
      note: `Reporter account active=${active}, role='${roleNow}', institution ${instMatch ? 'matches' : 'DIFFERS from'} the report's. This confirms account-level access only, not visibility of the specific data.`,
    };
  } catch (e: any) {
    return {
      reachable: 'unknown',
      note: `Impersonation unavailable: ${String(e?.message ?? e).slice(0, 100)}`,
    };
  }
}

async function gatherErrorRecurrence(
  bug: ReverifyBug,
  admin: any,
  since: string,
  sinceIsFixBoundary: boolean
): Promise<string> {
  const sig = errorSignature(bug.console_logs);
  if (!sig) return 'This report captured no console error signature to look for.';
  // console_logs is jsonb (no implicit text cast for ILIKE), so fetch a bounded
  // window of newer same-module reports and scan their logs in JS for the
  // signature. Same module keeps the window small and relevant. `since` is the
  // fix boundary on a post-deploy re-check — only errors AFTER the fix count.
  const window = sinceIsFixBoundary ? 'since the fix was deployed' : 'filed since this one';
  const { data, error } = await admin
    .from('bug_reports')
    .select('display_id, console_logs')
    .eq('module_name', bug.module_name)
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) return `Could not check error recurrence: ${String(error.message).slice(0, 80)}`;
  const needle = sig.toLowerCase();
  const hits = (data ?? []).filter((r: any) => {
    try { return JSON.stringify(r.console_logs ?? '').toLowerCase().includes(needle); }
    catch { return false; }
  });
  if (hits.length === 0) {
    return `The error signature ("${sig}") has NOT reappeared on any '${bug.module_name}' report ${window} — a positive signal.`;
  }
  return `The same error signature ("${sig}") reappeared on ${hits.length} report(s) ${window}, e.g. ${hits[0].display_id} — the failure is still occurring.`;
}

async function gatherSymptomRecurrence(
  bug: ReverifyBug,
  admin: any,
  since: string,
  sinceIsFixBoundary: boolean
): Promise<string> {
  // Find this bug's duplicate cluster, then measure how many members were filed
  // AFTER the fix boundary (`since`) — NOT after this report. On a post-deploy
  // re-check the pre-fix wave is what the fix targets; counting it as recurrence
  // is the false-"still broken" bug. This is the strongest "is it STILL
  // happening (now that the fix is live)" signal.
  const { data: cluster } = await admin
    .from('bug_clusters')
    .select('member_ids, member_count')
    .contains('member_ids', [bug.id])
    .maybeSingle();

  if (!cluster) {
    return 'This report is not part of a duplicate cluster — no recurrence group to measure.';
  }

  const { data: members, error } = await admin
    .from('bug_reports')
    .select('created_at, status')
    .in('id', cluster.member_ids as string[]);
  if (error || !members) {
    return `Cluster of ${cluster.member_count} similar reports found, but member dates were unreadable.`;
  }

  const newer = members.filter((m: any) => m.created_at > since);
  const newestAfter = newer.reduce(
    (max: string | null, m: any) => (!max || m.created_at > max ? m.created_at : max),
    null as string | null
  );
  const openNewer = newer.filter((m: any) =>
    ['new', 'seen', 'in_progress'].includes(m.status)
  ).length;

  if (newer.length === 0) {
    return sinceIsFixBoundary
      ? `No new report has arrived in this cluster of ${cluster.member_count} since the fix was deployed — a positive signal the fix landed (the earlier reports are the ones it targeted). Reporter confirmation is still the ground truth.`
      : `This is the newest report in its cluster of ${cluster.member_count}. No similar report has arrived since — a positive signal it may be resolved or worked around.`;
  }
  const days = Math.floor((Date.now() - new Date(newestAfter!).getTime()) / 86_400_000);
  const frame = sinceIsFixBoundary ? 'AFTER the fix deployed' : 'AFTER this one';
  return `Cluster of ${cluster.member_count} similar reports. ${newer.length} were filed ${frame} (${openNewer} still open); the most recent was ${days} day(s) ago. ${
    days <= 3 ? 'Still actively recurring.' : 'Recurrence appears to have stopped.'
  }`;
}
