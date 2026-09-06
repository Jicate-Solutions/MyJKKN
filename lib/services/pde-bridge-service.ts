/**
 * PDE Tier 4 — T4.1 Bridge Service
 * =============================================================================
 *
 * Bridges legacy learner-earned PDE artifacts into `pde_demonstrations` rows
 * per Director strategy lock (c) Bridge old → new categories (2026-05-20).
 *
 *   pde_learner_capabilities  → demonstrations (embodied|social_leadership
 *                                based on capability name/category heuristic)
 *   pde_certificates          → demonstrations (cultural_civic if NEP-aligned,
 *                                else embodied)
 *   pde_quest_enrollments     → demonstrations (mapped by quest.risk_tier)
 *
 * NOT bridged: `pde_assessments` + `pde_submissions` — pre-rubric mental model,
 * deferred per Director's substrate decision.
 *
 * Safety
 * ------
 * - Dry-run is the default; admin must opt-in to apply.
 * - Idempotent: re-running over the same source row that already has an
 *   `applied` audit entry is a no-op (skipped).
 * - Old tables remain intact (parallel-run safety). On apply, we set
 *   `grandfathered=true` on bridged `pde_learner_capabilities` rows
 *   (Tier 2.5 column) so the legacy admin UI can grey them out.
 *
 * Pattern alignment: thin class + static methods, mirrors
 * `lib/services/pde-pace-cap-service.ts`. All writes go through the
 * SSR-cookie supabase client; the API route does the super_admin authz check.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  PDECategoryKey,
  PDEDemonstrationStatus,
} from '@/lib/types/pde-demonstrations';
import type {
  BridgeMapping,
  BridgeRunOptions,
  BridgeRunResult,
  BridgeSourceTable,
} from '@/lib/types/pde-bridge';

const SOURCE_TABLES: BridgeSourceTable[] = [
  'pde_learner_capabilities',
  'pde_certificates',
  'pde_quest_enrollments',
];

interface LegacyCapabilityRow {
  id: string;
  learner_id: string | null;
  capability_id: string | null;
  status: string | null;
  demonstrated_at: string | null;
  demonstration_evidence: Record<string, unknown> | null;
  demonstration_score: number | null;
  mastered_at: string | null;
  capability?: { name: string | null; category: string | null; level: number | null } | null;
}

interface LegacyCertificateRow {
  id: string;
  learner_id: string;
  course_id: string;
  certificate_number: string;
  certificate_type: string | null;
  issued_at: string | null;
  final_score: number | null;
  capabilities_demonstrated: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

interface LegacyQuestEnrollmentRow {
  id: string;
  quest_id: string | null;
  learner_id: string | null;
  status: string | null;
  completed_at: string | null;
  quest?: { title: string | null; risk_tier: string | null; difficulty: string | null } | null;
}

// ---------------------------------------------------------------------------
// Mapping heuristics
// ---------------------------------------------------------------------------

/**
 * Picks a `category_key` for a legacy capability based on its name + category.
 *
 * The legacy `pde_capabilities.category` is a free-text column (no constraint),
 * so we look for medical / physical keywords → embodied, leadership / peer /
 * community keywords → social_leadership, and fall back to embodied for
 * everything else (the most common legacy bucket).
 */
function pickCapabilityCategory(name: string | null, category: string | null): PDECategoryKey {
  const haystack = `${name ?? ''} ${category ?? ''}`.toLowerCase();
  if (/(lead|leader|peer|community|team|service|volunteer|mentor)/.test(haystack)) {
    return 'social_leadership';
  }
  if (/(judge|judgment|reason|decision|reflect)/.test(haystack)) {
    return 'judgment';
  }
  if (/(culture|civic|nep|heritage|tradition|language)/.test(haystack)) {
    return 'cultural_civic';
  }
  if (/(account|responsibility|own)/.test(haystack)) {
    return 'accountability';
  }
  if (/(problem|design|invent|create|build)/.test(haystack)) {
    return 'problem_finding';
  }
  // Default — embodied covers medical, physical, hands-on skills (the bulk of
  // legacy pre-framework capabilities).
  return 'embodied';
}

export function mapLegacyCapability(row: LegacyCapabilityRow): BridgeMapping | null {
  if (!row.learner_id) return null;
  const skillName = row.capability?.name ?? `legacy-capability-${row.id.slice(0, 8)}`;
  const category = pickCapabilityCategory(row.capability?.name ?? null, row.capability?.category ?? null);
  const passed = ['mastered', 'demonstrated', 'passed'].includes((row.status ?? '').toLowerCase());

  return {
    source_table: 'pde_learner_capabilities',
    source_row_id: row.id,
    learner_id: row.learner_id,
    institution_id: null,
    target_category_key: category,
    target_skill_name: skillName,
    target_evidence: {
      legacy_table: 'pde_learner_capabilities',
      legacy_capability_id: row.capability_id,
      legacy_status: row.status,
      legacy_evidence: row.demonstration_evidence ?? {},
      legacy_demonstrated_at: row.demonstrated_at,
      legacy_mastered_at: row.mastered_at,
      bridged_at: new Date().toISOString(),
    },
    target_evidence_type: 'legacy_capability',
    target_status: 'scored' as PDEDemonstrationStatus,
    target_passed: passed,
    target_weighted_score: row.demonstration_score ?? null,
  };
}

function pickCertificateCategory(row: LegacyCertificateRow): PDECategoryKey {
  const typ = (row.certificate_type ?? '').toLowerCase();
  // Heuristic — NEP-aligned credential types map to cultural_civic; everything
  // else lands in 'credential' (the 7th category exists specifically for this).
  if (/(nep|civic|cultural|heritage|language)/.test(typ)) return 'cultural_civic';
  return 'credential';
}

export function mapLegacyCertificate(row: LegacyCertificateRow): BridgeMapping {
  const category = pickCertificateCategory(row);
  return {
    source_table: 'pde_certificates',
    source_row_id: row.id,
    learner_id: row.learner_id,
    institution_id: null,
    target_category_key: category,
    target_skill_name: row.certificate_type ?? row.certificate_number,
    target_evidence: {
      legacy_table: 'pde_certificates',
      legacy_certificate_number: row.certificate_number,
      legacy_certificate_type: row.certificate_type,
      legacy_course_id: row.course_id,
      legacy_issued_at: row.issued_at,
      legacy_capabilities_demonstrated: row.capabilities_demonstrated ?? {},
      bridged_at: new Date().toISOString(),
    },
    target_evidence_type: 'legacy_certificate',
    target_status: 'scored' as PDEDemonstrationStatus,
    // A certificate exists = it was earned. By definition passed.
    target_passed: true,
    target_weighted_score: row.final_score ?? null,
  };
}

function pickQuestCategoryFromRiskTier(riskTier: string | null): PDECategoryKey {
  // Director's risk-tier framing maps tightly onto the new framework:
  //   green / low    → embodied (routine hands-on)
  //   amber / medium → problem_finding (some discovery)
  //   red / high     → judgment (live consequence)
  switch ((riskTier ?? '').toLowerCase()) {
    case 'red':
    case 'high':
    case 'critical':
      return 'judgment';
    case 'amber':
    case 'medium':
    case 'yellow':
      return 'problem_finding';
    default:
      return 'embodied';
  }
}

export function mapLegacyQuestEnrollment(row: LegacyQuestEnrollmentRow): BridgeMapping | null {
  if (!row.learner_id) return null;
  // Only bridge enrollments that actually represent learner achievement.
  const passed = ['passed', 'completed', 'verified'].includes((row.status ?? '').toLowerCase());
  if (!passed) return null;

  const category = pickQuestCategoryFromRiskTier(row.quest?.risk_tier ?? null);
  return {
    source_table: 'pde_quest_enrollments',
    source_row_id: row.id,
    learner_id: row.learner_id,
    institution_id: null,
    target_category_key: category,
    target_skill_name: row.quest?.title ?? `legacy-quest-${row.id.slice(0, 8)}`,
    target_evidence: {
      legacy_table: 'pde_quest_enrollments',
      legacy_quest_id: row.quest_id,
      legacy_quest_title: row.quest?.title,
      legacy_risk_tier: row.quest?.risk_tier,
      legacy_difficulty: row.quest?.difficulty,
      legacy_completed_at: row.completed_at,
      legacy_status: row.status,
      bridged_at: new Date().toISOString(),
    },
    target_evidence_type: 'legacy_quest_completion',
    target_status: 'scored' as PDEDemonstrationStatus,
    target_passed: true,
    target_weighted_score: null,
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Orchestrates a bridge run. Returns counts + per-source breakdown.
 *
 * Idempotency: a source row that already has an `applied` audit entry is
 * skipped (counted in `skipped`, not re-written). Dry-run audit entries DO
 * NOT block a subsequent apply — that's by design.
 */
export async function runBridge(options: BridgeRunOptions): Promise<BridgeRunResult> {
  const supabase = await createServerSupabaseClient();
  const startedAt = new Date().toISOString();
  const runId = options.run_id ?? cryptoRandomUuid();
  const learnerFilter =
    typeof options.scope === 'object' && 'learnerId' in options.scope
      ? options.scope.learnerId
      : null;

  const mappings: BridgeMapping[] = [];
  const errors: { source_row_id: string; message: string }[] = [];

  // ---- 1. Gather mappings from each legacy table -----------------------
  try {
    let q1 = supabase
      .from('pde_learner_capabilities')
      .select('id, learner_id, capability_id, status, demonstrated_at, demonstration_evidence, demonstration_score, mastered_at, capability:pde_capabilities(name, category, level)')
      .eq('grandfathered', false);
    if (learnerFilter) q1 = q1.eq('learner_id', learnerFilter);
    const { data: caps, error: capsErr } = await q1;
    if (capsErr) throw new Error(`fetch pde_learner_capabilities: ${capsErr.message}`);
    for (const row of (caps ?? []) as unknown as LegacyCapabilityRow[]) {
      const m = mapLegacyCapability(row);
      if (m) mappings.push(m);
    }
  } catch (e) {
    errors.push({ source_row_id: 'pde_learner_capabilities:fetch', message: (e as Error).message });
  }

  try {
    let q2 = supabase
      .from('pde_certificates')
      .select('id, learner_id, course_id, certificate_number, certificate_type, issued_at, final_score, capabilities_demonstrated, metadata');
    if (learnerFilter) q2 = q2.eq('learner_id', learnerFilter);
    const { data: certs, error: certsErr } = await q2;
    if (certsErr) throw new Error(`fetch pde_certificates: ${certsErr.message}`);
    for (const row of (certs ?? []) as unknown as LegacyCertificateRow[]) {
      mappings.push(mapLegacyCertificate(row));
    }
  } catch (e) {
    errors.push({ source_row_id: 'pde_certificates:fetch', message: (e as Error).message });
  }

  try {
    let q3 = supabase
      .from('pde_quest_enrollments')
      .select('id, quest_id, learner_id, status, completed_at, quest:pde_quests(title, risk_tier, difficulty)')
      .in('status', ['passed', 'completed', 'verified']);
    if (learnerFilter) q3 = q3.eq('learner_id', learnerFilter);
    const { data: quests, error: questsErr } = await q3;
    if (questsErr) throw new Error(`fetch pde_quest_enrollments: ${questsErr.message}`);
    for (const row of (quests ?? []) as unknown as LegacyQuestEnrollmentRow[]) {
      const m = mapLegacyQuestEnrollment(row);
      if (m) mappings.push(m);
    }
  } catch (e) {
    errors.push({ source_row_id: 'pde_quest_enrollments:fetch', message: (e as Error).message });
  }

  // ---- 2. Idempotency filter — drop mappings already applied ----------
  const alreadyApplied = await fetchAppliedSourceIds(mappings);
  const fresh = mappings.filter(
    (m) => !alreadyApplied.has(`${m.source_table}:${m.source_row_id}`)
  );
  const skipped = mappings.length - fresh.length;

  // ---- 3. Apply (or just write dry-run audit) -------------------------
  const applied = await applyBridge(fresh, {
    run_id: runId,
    started_at: startedAt,
    dry_run: options.dry_run,
  });

  const completedAt = new Date().toISOString();
  const perSource: Record<BridgeSourceTable, number> = {
    pde_learner_capabilities: 0,
    pde_certificates: 0,
    pde_quest_enrollments: 0,
  };
  for (const m of fresh) perSource[m.source_table]++;

  return {
    run_id: runId,
    bridged: applied.bridged,
    failed: applied.failed + errors.length,
    skipped,
    dry_run: options.dry_run,
    per_source: perSource,
    errors: [...errors, ...applied.errors],
    started_at: startedAt,
    completed_at: completedAt,
  };
}

async function fetchAppliedSourceIds(mappings: BridgeMapping[]): Promise<Set<string>> {
  if (mappings.length === 0) return new Set();
  const supabase = await createServerSupabaseClient();
  const result = new Set<string>();
  for (const sourceTable of SOURCE_TABLES) {
    const ids = mappings.filter((m) => m.source_table === sourceTable).map((m) => m.source_row_id);
    if (ids.length === 0) continue;
    const { data, error } = await supabase
      .from('pde_bridge_audit')
      .select('source_row_id')
      .eq('source_table', sourceTable)
      .eq('status', 'applied')
      .in('source_row_id', ids);
    if (error) continue;
    for (const r of data ?? []) {
      result.add(`${sourceTable}:${(r as { source_row_id: string }).source_row_id}`);
    }
  }
  return result;
}

interface RunMeta {
  run_id: string;
  started_at: string;
  dry_run: boolean;
}

/**
 * Writes new pde_demonstrations rows (if !dry_run) + pde_bridge_audit rows
 * (always). On apply, also sets `grandfathered=true` on the source
 * pde_learner_capabilities row.
 */
export async function applyBridge(
  mappings: BridgeMapping[],
  runMeta: RunMeta
): Promise<{ bridged: number; failed: number; errors: { source_row_id: string; message: string }[] }> {
  const supabase = await createServerSupabaseClient();
  const errors: { source_row_id: string; message: string }[] = [];
  let bridged = 0;
  const completedAt = new Date().toISOString();

  for (const m of mappings) {
    try {
      let targetDemoId: string | null = null;

      if (!runMeta.dry_run) {
        // Insert the demonstration row directly (per Director's instruction
        // not to modify pde-demonstration-service.ts which is hard-coded to
        // status='draft').
        const { data: demo, error: insertErr } = await supabase
          .from('pde_demonstrations')
          .insert({
            learner_id: m.learner_id,
            institution_id: m.institution_id,
            category_key: m.target_category_key,
            skill_name: m.target_skill_name,
            evidence: m.target_evidence,
            evidence_type: m.target_evidence_type,
            status: m.target_status,
            passed: m.target_passed,
            weighted_score: m.target_weighted_score,
            scored_at: completedAt,
          })
          .select('id')
          .single();

        if (insertErr) {
          throw new Error(`pde_demonstrations insert failed: ${insertErr.message}`);
        }
        targetDemoId = (demo as { id: string }).id;

        // Flag the source capability as grandfathered (Tier 2.5 column).
        if (m.source_table === 'pde_learner_capabilities') {
          await supabase
            .from('pde_learner_capabilities')
            .update({ grandfathered: true })
            .eq('id', m.source_row_id);
        }
      }

      await supabase.from('pde_bridge_audit').insert({
        source_table: m.source_table,
        source_row_id: m.source_row_id,
        target_demonstration_id: targetDemoId,
        learner_id: m.learner_id,
        institution_id: m.institution_id,
        category_key: m.target_category_key,
        status: runMeta.dry_run ? 'dry_run' : 'applied',
        run_id: runMeta.run_id,
        run_started_at: runMeta.started_at,
        run_completed_at: completedAt,
        dry_run: runMeta.dry_run,
      });

      bridged++;
    } catch (e) {
      // Audit the failure so the admin UI can show it.
      await supabase.from('pde_bridge_audit').insert({
        source_table: m.source_table,
        source_row_id: m.source_row_id,
        target_demonstration_id: null,
        learner_id: m.learner_id,
        institution_id: m.institution_id,
        category_key: m.target_category_key,
        status: 'failed',
        error_message: (e as Error).message,
        run_id: runMeta.run_id,
        run_started_at: runMeta.started_at,
        run_completed_at: completedAt,
        dry_run: runMeta.dry_run,
      });
      errors.push({ source_row_id: m.source_row_id, message: (e as Error).message });
    }
  }

  return { bridged, failed: errors.length, errors };
}

function cryptoRandomUuid(): string {
  // Node 18+ + browser-modern all expose globalThis.crypto.randomUUID.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // RFC4122-ish fallback for very old envs (shouldn't hit in Next 15).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
