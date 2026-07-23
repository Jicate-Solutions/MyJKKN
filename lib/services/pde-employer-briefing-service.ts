/**
 * PDE Employer Briefing Service — T3.6 (Tier 3)
 * ============================================================================
 *
 * Active employer briefing flow. When a learner crosses the PDE
 * placement-signal threshold (scored & passed demonstrations in 3+ distinct
 * `category_key` values), this service surfaces the learner to the placement
 * team and, when the policy authorises it, prepares an outbound briefing
 * (email to registered industry partners + dashboard surface).
 *
 * Policy substrate
 * ----------------
 *   `pde.governance.placement_signal_response` (Cluster E) — typed string
 *   enum: `'active_briefing' | 'wait_2_cycles' | 'scope_reduction'`.
 *   Read via `getPlacementSignalResponse(institutionId)` from
 *   `lib/services/pde-policy-reader.ts`.
 *
 *   When the policy value is `'active_briefing'` we proceed with both
 *   channels (dashboard + email). For `'wait_2_cycles'` we still surface the
 *   learner on the dashboard but suppress outbound email. For
 *   `'scope_reduction'` we suppress both — the placement team must triage
 *   manually and possibly reduce the learner's framework scope.
 *
 * Spec-vs-reality
 * ---------------
 *   The original T3.6 spec called for a policy shape with `trigger_threshold`,
 *   `briefing_channels`, `auto_send`, `opt_in_required` fields. Reality:
 *   the seeded policy is a single enum value (see
 *   `pde-policy-reader-types.ts` line 167). So the threshold (3 categories)
 *   is hardcoded here as `TRIGGER_THRESHOLD`, matching the language in
 *   `specs/pde-roadmap-tier-1-6-2026-05-19.md`. If product later wants this
 *   to vary by institution, switch to a `JSONB` policy and lift the constant
 *   out — the rest of the surface keeps working.
 *
 * Employer registry
 * -----------------
 *   We read from `public.industry_partners` (owned by the CDC module). We
 *   do NOT write to it and do NOT create a parallel table. Required columns
 *   we actually consume: `id`, `institution_id`, `company_name`,
 *   `contact_email`, `contact_person`, `is_active`. Filter: `is_active=true`
 *   AND `contact_email IS NOT NULL`.
 *
 * Email
 * -----
 *   Uses the shared Resend client at `lib/resend.ts`. When the env var
 *   `PDE_BRIEFING_DRY_RUN === '1'` we log payloads instead of sending —
 *   used in tests + during pilot rollout before opt-in tooling exists.
 *
 * Pattern alignment: thin class with static methods, mirrors
 * `PDEPaceCapService`.
 *
 * Phase: PDE Tier 3 (2026-05-19).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPlacementSignalResponse } from '@/lib/services/pde-policy-reader';
import { resend } from '@/lib/resend';
import type { PlacementSignalResponse } from '@/lib/services/pde-policy-reader-types';

/** Minimum distinct PDE categories with a scored & passed demonstration. */
export const TRIGGER_THRESHOLD = 3;

/** From email used for briefings. Override via env in deployment. */
const FROM_EMAIL = process.env.PDE_BRIEFING_FROM_EMAIL || 'no-reply@jkkn.ai';

/** Set PDE_BRIEFING_DRY_RUN=1 in any env where you don't want real emails. */
const isDryRun = (): boolean => process.env.PDE_BRIEFING_DRY_RUN === '1';

export interface LearnerSignalEval {
  learner_id: string;
  institution_id: string | null;
  category_count: number;
  categories: string[];
  crosses_threshold: boolean;
  threshold: number;
}

export interface BriefingHighlight {
  category_key: string;
  skill_name: string | null;
  weighted_score: number | null;
  scored_at: string | null;
}

export interface BriefingResult {
  learner_id: string;
  policy_decision: PlacementSignalResponse;
  dashboard_surfaced: boolean;
  email_sent: boolean;
  email_recipient_count: number;
  highlights: BriefingHighlight[];
  reason?: string;
}

export interface ActiveBriefingRow {
  learner_id: string;
  institution_id: string | null;
  category_count: number;
  categories: string[];
  last_scored_at: string | null;
  full_name?: string | null;
  email?: string | null;
}

interface DemonstrationRow {
  learner_id: string;
  institution_id: string | null;
  category_key: string;
  skill_name: string | null;
  weighted_score: number | null;
  scored_at: string | null;
}

export class PDEEmployerBriefingService {
  /**
   * Evaluates whether a learner crosses the placement-signal threshold.
   * Counts distinct `category_key` values across scored & passed demonstrations.
   */
  static async evaluateLearnerSignals(learnerId: string): Promise<LearnerSignalEval> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pde_demonstrations')
      .select('institution_id, category_key')
      .eq('learner_id', learnerId)
      .eq('passed', true)
      .not('scored_at', 'is', null);

    if (error) {
      throw new Error(`evaluateLearnerSignals failed: ${error.message}`);
    }

    const rows = (data ?? []) as Array<Pick<DemonstrationRow, 'institution_id' | 'category_key'>>;
    const categorySet = new Set<string>();
    let institutionId: string | null = null;
    for (const r of rows) {
      if (r.category_key) categorySet.add(r.category_key);
      if (r.institution_id && !institutionId) institutionId = r.institution_id;
    }

    const categories = Array.from(categorySet).sort();
    return {
      learner_id: learnerId,
      institution_id: institutionId,
      category_count: categories.length,
      categories,
      crosses_threshold: categories.length >= TRIGGER_THRESHOLD,
      threshold: TRIGGER_THRESHOLD,
    };
  }

  /**
   * Triggers a briefing for a learner. Reads policy, gathers highlights,
   * sends email when authorised, returns a structured result.
   */
  static async triggerBriefing(learnerId: string): Promise<BriefingResult> {
    const supabase = await createServerSupabaseClient();
    const evalResult = await this.evaluateLearnerSignals(learnerId);

    if (!evalResult.crosses_threshold) {
      return {
        learner_id: learnerId,
        policy_decision: 'wait_2_cycles',
        dashboard_surfaced: false,
        email_sent: false,
        email_recipient_count: 0,
        highlights: [],
        reason: `Learner has ${evalResult.category_count}/${TRIGGER_THRESHOLD} categories scored.`,
      };
    }

    const policyDecision = await getPlacementSignalResponse(evalResult.institution_id);

    // Gather highlights regardless of decision — dashboard uses them too.
    const { data: highlightRows, error: hlErr } = await supabase
      .from('pde_demonstrations')
      .select('category_key, skill_name, weighted_score, scored_at')
      .eq('learner_id', learnerId)
      .eq('passed', true)
      .not('scored_at', 'is', null)
      .order('weighted_score', { ascending: false, nullsFirst: false })
      .limit(7);

    if (hlErr) {
      throw new Error(`triggerBriefing highlights query failed: ${hlErr.message}`);
    }

    const highlights = (highlightRows ?? []) as BriefingHighlight[];

    // Policy gating: only `active_briefing` sends email; `wait_2_cycles`
    // still surfaces on the dashboard but suppresses outbound; `scope_reduction`
    // suppresses both — placement team handles manually.
    const dashboardSurfaced = policyDecision !== 'scope_reduction';
    const shouldEmail = policyDecision === 'active_briefing';

    let emailSent = false;
    let recipientCount = 0;
    let reason: string | undefined;

    if (shouldEmail && evalResult.institution_id) {
      const { data: partners, error: partnersErr } = await supabase
        .from('industry_partners')
        .select('id, company_name, contact_email, contact_person')
        .eq('institution_id', evalResult.institution_id)
        .eq('is_active', true)
        .not('contact_email', 'is', null);

      if (partnersErr) {
        reason = `Partner lookup failed: ${partnersErr.message}`;
      } else {
        const recipients = (partners ?? []).filter(
          (p) => typeof p.contact_email === 'string' && p.contact_email.length > 0,
        );
        recipientCount = recipients.length;

        if (recipientCount === 0) {
          reason = 'No active industry_partners with contact_email for this institution.';
        } else if (isDryRun()) {
          reason = `DRY RUN — would have emailed ${recipientCount} partner(s).`;
        } else {
          const subject = `JKKN PDE — learner ready for briefing (${evalResult.category_count} categories)`;
          const text = buildBriefingEmailText(learnerId, evalResult, highlights);
          for (const r of recipients) {
            try {
              await resend.emails.send({
                from: FROM_EMAIL,
                to: r.contact_email as string,
                subject,
                text,
              });
              emailSent = true;
            } catch (sendErr: unknown) {
              const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
              reason = `Partial send failure (${r.company_name}): ${msg}`;
              // Continue trying other recipients — one bad address shouldn't block all.
            }
          }
        }
      }
    } else if (!shouldEmail) {
      reason = `Policy = ${policyDecision} — email suppressed.`;
    } else {
      reason = 'No institution_id resolved for learner — cannot scope partners.';
    }

    return {
      learner_id: learnerId,
      policy_decision: policyDecision,
      dashboard_surfaced: dashboardSurfaced,
      email_sent: emailSent,
      email_recipient_count: recipientCount,
      highlights,
      reason,
    };
  }

  /**
   * Lists learners currently crossing the placement-signal threshold for
   * the dashboard. Joined with `profiles` for display name & email when
   * available.
   */
  static async listActiveBriefings(institutionId?: string | null): Promise<ActiveBriefingRow[]> {
    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from('pde_demonstrations')
      .select('learner_id, institution_id, category_key, scored_at')
      .eq('passed', true)
      .not('scored_at', 'is', null);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`listActiveBriefings query failed: ${error.message}`);
    }

    type Row = Pick<DemonstrationRow, 'learner_id' | 'institution_id' | 'category_key' | 'scored_at'>;
    const rows = (data ?? []) as Row[];

    const byLearner = new Map<
      string,
      { institution_id: string | null; categories: Set<string>; last_scored_at: string | null }
    >();
    for (const r of rows) {
      const cur = byLearner.get(r.learner_id) ?? {
        institution_id: r.institution_id,
        categories: new Set<string>(),
        last_scored_at: null,
      };
      if (r.category_key) cur.categories.add(r.category_key);
      if (r.scored_at && (!cur.last_scored_at || r.scored_at > cur.last_scored_at)) {
        cur.last_scored_at = r.scored_at;
      }
      byLearner.set(r.learner_id, cur);
    }

    const eligible: ActiveBriefingRow[] = [];
    for (const [learnerId, agg] of byLearner.entries()) {
      if (agg.categories.size >= TRIGGER_THRESHOLD) {
        eligible.push({
          learner_id: learnerId,
          institution_id: agg.institution_id,
          category_count: agg.categories.size,
          categories: Array.from(agg.categories).sort(),
          last_scored_at: agg.last_scored_at,
        });
      }
    }

    // Hydrate display fields for active rows only.
    if (eligible.length > 0) {
      const ids = eligible.map((e) => e.learner_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      const profileMap = new Map<string, { full_name?: string | null; email?: string | null }>();
      for (const p of (profiles ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>) {
        profileMap.set(p.id, { full_name: p.full_name, email: p.email });
      }
      for (const row of eligible) {
        const prof = profileMap.get(row.learner_id);
        if (prof) {
          row.full_name = prof.full_name;
          row.email = prof.email;
        }
      }
    }

    eligible.sort((a, b) => {
      if (b.category_count !== a.category_count) return b.category_count - a.category_count;
      return (b.last_scored_at ?? '').localeCompare(a.last_scored_at ?? '');
    });

    return eligible;
  }
}

function buildBriefingEmailText(
  learnerId: string,
  evalResult: LearnerSignalEval,
  highlights: BriefingHighlight[],
): string {
  const lines: string[] = [];
  lines.push('A JKKN PDE learner has reached placement-signal threshold.');
  lines.push('');
  lines.push(`Learner ID: ${learnerId}`);
  lines.push(`Categories demonstrated: ${evalResult.category_count}/${TRIGGER_THRESHOLD}+`);
  lines.push(`Category keys: ${evalResult.categories.join(', ')}`);
  lines.push('');
  if (highlights.length > 0) {
    lines.push('Top demonstrations:');
    for (const h of highlights) {
      const score = h.weighted_score != null ? ` (${h.weighted_score})` : '';
      lines.push(`  - ${h.category_key}: ${h.skill_name ?? '—'}${score}`);
    }
    lines.push('');
  }
  lines.push('Reply to this email or contact the JKKN placement team to schedule a briefing.');
  return lines.join('\n');
}
