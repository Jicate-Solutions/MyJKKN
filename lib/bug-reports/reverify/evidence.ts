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
//        report reappeared on any report filed AFTER it?
//   3. symptom recurrence — within this bug's duplicate cluster, how many
//        members were filed after it, and how recently? (still arriving = not
//        fixed; long quiet = likely fixed/worked-around).
//
// The `ReverifyProbe` registry is the extension point for per-surface
// data-presence probes (v1.1): e.g. "does student X now appear in Semester
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

// v1.1 extension point — register concrete data-presence probes here.
// Example (semester search, BUG-005009 shape):
//   { id: 'learner-in-semester-search',
//     match: b => b.module_name === 'learners' && /not (showing|appearing|visible)/i.test(b.description ?? ''),
//     run: async (client, bug) => { /* re-run the semester-search read as the
//        reporter using ids parsed from bug.page_url; report present/absent */ } }
export const REVERIFY_PROBES: ReverifyProbe[] = [];

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
 */
export async function gatherEvidence(bug: ReverifyBug, admin: any): Promise<EvidenceBundle> {
  // Fault-isolate each signal: a failure in one must not sink the others (the
  // cluster-recurrence signal is the most valuable and must survive on its own).
  const settle = async (p: Promise<any>, fallback: any) => {
    try { return await p; } catch { return fallback; }
  };
  const [reach, errRec, symRec] = await Promise.all([
    settle(gatherReporterReachability(bug), { reachable: 'unknown', note: 'Reachability check errored.' }),
    settle(gatherErrorRecurrence(bug, admin), 'Error-recurrence check unavailable.'),
    settle(gatherSymptomRecurrence(bug, admin), 'Recurrence check unavailable.'),
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

async function gatherErrorRecurrence(bug: ReverifyBug, admin: any): Promise<string> {
  const sig = errorSignature(bug.console_logs);
  if (!sig) return 'This report captured no console error signature to look for.';
  // console_logs is jsonb (no implicit text cast for ILIKE), so fetch a bounded
  // window of newer same-module reports and scan their logs in JS for the
  // signature. Same module keeps the window small and relevant.
  const { data, error } = await admin
    .from('bug_reports')
    .select('display_id, console_logs')
    .eq('module_name', bug.module_name)
    .gt('created_at', bug.created_at)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) return `Could not check error recurrence: ${String(error.message).slice(0, 80)}`;
  const needle = sig.toLowerCase();
  const hits = (data ?? []).filter((r: any) => {
    try { return JSON.stringify(r.console_logs ?? '').toLowerCase().includes(needle); }
    catch { return false; }
  });
  if (hits.length === 0) {
    return `The error signature ("${sig}") has NOT reappeared on any '${bug.module_name}' report filed since this one — a positive signal.`;
  }
  return `The same error signature ("${sig}") reappeared on ${hits.length} newer report(s), e.g. ${hits[0].display_id} — the failure is still occurring.`;
}

async function gatherSymptomRecurrence(bug: ReverifyBug, admin: any): Promise<string> {
  // Find this bug's duplicate cluster, then measure how many members were filed
  // after it and how recently. This is the strongest "is it still happening" signal.
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

  const newer = members.filter((m: any) => m.created_at > bug.created_at);
  const newestAfter = newer.reduce(
    (max: string | null, m: any) => (!max || m.created_at > max ? m.created_at : max),
    null as string | null
  );
  const openNewer = newer.filter((m: any) =>
    ['new', 'seen', 'in_progress'].includes(m.status)
  ).length;

  if (newer.length === 0) {
    return `This is the newest report in its cluster of ${cluster.member_count}. No similar report has arrived since — a positive signal it may be resolved or worked around.`;
  }
  const days = Math.floor((Date.now() - new Date(newestAfter!).getTime()) / 86_400_000);
  return `Cluster of ${cluster.member_count} similar reports. ${newer.length} were filed AFTER this one (${openNewer} still open); the most recent was ${days} day(s) ago. ${
    days <= 3 ? 'Still actively recurring.' : 'Recurrence appears to have stopped.'
  }`;
}
