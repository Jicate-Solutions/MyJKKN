// =====================================================================
// AI Pulse — Star-prompt semantic dedup (₹0 Max lane, decision #7).
// =====================================================================
// When a learner build graduates into the shared library it can express the
// SAME idea as an existing star on its shelf. This cron runs the "same idea?"
// judgement on the ₹0 claude_code Max lane and groups the newcomer under the
// star it duplicates (ai_pulse_prompt_builds.duplicate_of) so the library can
// later show just the best of a duplicate set.
//
// FLOW (one route, re-entrant, idempotent — mirrors aipulse-prompt-grade):
//   COLLECT first: drain done ai_pulse.prompt_dedup jobs, read the model's
//     duplicate index, map it back to a candidate build id (stashed in _ctx at
//     enqueue), record via fn_ai_pulse_record_prompt_dedup (service_role).
//   SUBMIT next: enqueue one dedup job per newly-graduated build via
//     fn_ai_pulse_enqueue_prompt_dedup (which self-dedupes: already-judged /
//     in-flight / no-peers builds are skipped inside the RPC).
//
// DARK until the kill switch prompt_dedup_enabled flips true (ai_pulse_policies).
// Both RPCs are dark-gated too (defense-in-depth), so this is a no-op until an
// admin turns it on. Idempotent: a judged build stays out of the enqueue set, so
// re-runs are no-ops.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-08-04.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

const JOB_TYPE = 'ai_pulse.prompt_dedup';
const ENABLED_KEY = 'prompt_dedup_enabled';
const CAP = 60; // max builds to submit/collect per run

type Admin = ReturnType<typeof createServiceRoleClient>;
type DedupContext = { build_id: string; candidates: string[] };
type GraduatedBuild = { id: string };

// ── config read (fail-safe: any error -> null -> treated as off) ────────────
async function readPolicy(admin: Admin, key: string): Promise<unknown> {
  try {
    const { data, error } = await admin
      .from('ai_pulse_policies')
      .select('value_jsonb')
      .eq('config_key', key)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return null;
    return (data as { value_jsonb?: unknown } | null)?.value_jsonb ?? null;
  } catch {
    return null;
  }
}

// Parse the model's dedup verdict → a 0-based index into the candidate array, or
// null for "unique" / unparseable (unparseable is treated as unique: a re-run
// leaves the build ungrouped rather than mis-grouping it).
function parseDupIndex(text: string | null, candidateCount: number): number | null {
  if (!text) return null;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const n = Number(o.duplicate_of_index ?? 0);
    if (!Number.isInteger(n) || n <= 0 || n > candidateCount) return null; // 0 or out-of-range → unique
    return n - 1; // 1-based (prompt) → 0-based (array)
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const admin = createServiceRoleClient();

  // Kill switch. DARK until an admin flips prompt_dedup_enabled = true.
  if (((await readPolicy(admin, ENABLED_KEY)) as unknown) !== true) {
    return NextResponse.json({ ok: true, enabled: false, note: 'prompt_dedup_enabled is off (DARK)' });
  }

  let recorded = 0;
  let enqueued = 0;
  let skipped = 0;

  // ── COLLECT: drain done dedup jobs, record their verdicts. ─────────────────
  try {
    const items = await collectJobsLane(admin, [JOB_TYPE], CAP);
    for (const item of items) {
      const ctx = item.context as unknown as DedupContext;
      const candidates = Array.isArray(ctx?.candidates) ? ctx.candidates : [];
      if (!ctx?.build_id || candidates.length === 0) { skipped++; continue; }
      const raw = item.message?.content?.find((b) => b.type === 'text');
      const text = raw && 'text' in raw ? (raw.text as string) : null;
      const idx = parseDupIndex(text, candidates.length);
      const dupId = idx === null ? null : (candidates[idx] ?? null);
      const { error } = await admin.rpc('fn_ai_pulse_record_prompt_dedup', {
        p_payload: { build_id: ctx.build_id, duplicate_of: dupId },
      });
      if (error) {
        console.error('[cron/aipulse-prompt-dedup] record failed:', error.message);
        skipped++;
      } else {
        recorded++;
      }
    }
  } catch (e) {
    console.error('[cron/aipulse-prompt-dedup] collect failed:', e);
  }

  // ── SUBMIT: enqueue a dedup job per graduated, ungrouped build. The RPC
  //    self-dedupes (already_judged / in_flight / no_peers → skipped). ────────
  try {
    const { data: builds, error: bErr } = await admin
      .from('ai_pulse_prompt_builds')
      .select('id')
      .not('graduated_at', 'is', null)
      .is('disqualified_at', null)
      .is('duplicate_of', null)
      .not('topic_type', 'is', null)
      .not('topic_id', 'is', null)
      .order('graduated_at', { ascending: false })
      .limit(CAP);
    if (bErr) {
      console.error('[cron/aipulse-prompt-dedup] graduated read failed:', bErr.message);
    } else {
      for (const row of (builds as GraduatedBuild[] | null) ?? []) {
        const { data, error } = await admin.rpc('fn_ai_pulse_enqueue_prompt_dedup', {
          p_build_id: row.id,
        });
        if (error) {
          console.warn('[cron/aipulse-prompt-dedup] enqueue failed:', error.message);
          skipped++;
          continue;
        }
        const r = data as { ok?: boolean } | null;
        if (r?.ok) {
          enqueued++;
        } else {
          skipped++; // disabled / not_eligible / already_judged / in_flight / no_peers
        }
      }
    }
  } catch (e) {
    console.error('[cron/aipulse-prompt-dedup] submit failed:', e);
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    recorded,
    enqueued,
    skipped,
    elapsed_ms: Date.now() - started,
  });
}
