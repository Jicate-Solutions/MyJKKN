export const dynamic = 'force-dynamic';
// Long-poll the ai_jobs Max lane (the generic seat/Windows drain claims ~every
// minute). Kept at 300 so the poll window below can finish before a hard-kill.
export const maxDuration = 300;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { WP_CATEGORIES } from '@/types/work-pulse';

// ─────────────────────────────────────────────────────────────────────────────
// MAX-LANE CONVERSION (2026-07-13): work_pulse.analyze moved onto the #1998
// generic AI-jobs registry — the SAME pattern as the proven reference
// app/api/work-pulse/translate/route.ts. Instead of calling anthropic.messages
// .create directly, this route assembles the exact same four data sets it always
// gathered, hands them to the AI as the payload variables the seeded prompt
// expects ({{entries}} {{activities}} {{existing_patterns}} {{interviews}}),
// enqueues an `work_pulse.analyze` job (fn_ai_enqueue) whose prompt_template +
// tool_set live in ai_job_types, then long-polls fn_ai_job_status for the
// drain's result. The seat drain runs on the Claude Max subscription (₹0 API);
// no Anthropic key, no model resolution, no usage recording on this side.
//
// PRESERVED: the dual auth gate (x-api-key OR super_admin session), the exact
// data assembly, the pattern upsert + training-win notifications, and the
// response shape the caller already consumes.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_API_KEY = process.env.WORK_PULSE_API_KEY;

// Poll cadence — mirrors app/api/work-pulse/translate/route.ts (the proven
// ai_jobs consumer). Analysis is heavier (expected ~45s) so we keep the full
// long-poll window; the drain claims roughly once a minute.
const POLL_MS = 2_500;
const UNCLAIMED_DEADLINE_MS = 120_000; // give up if never claimed (drain offline)
const TOTAL_DEADLINE_MS = 285_000; // kept < maxDuration (300s) so we respond first

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Pull the JSON pattern array out of the drain's result jsonb. The generic
 *  runner returns { answer } (same contract translate/ai-query read); we tolerate
 *  a few plausible shapes and always extract the `[ ... ]` array so a completed
 *  result never falls silently to null. */
function extractPatternArray(result: unknown): Array<Record<string, unknown>> | null {
  const parseArray = (s: string): Array<Record<string, unknown>> | null => {
    const match = s.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : null;
    } catch {
      return null;
    }
  };

  if (typeof result === 'string') return parseArray(result);
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    for (const key of ['answer', 'patterns', 'result', 'text']) {
      const v = o[key];
      if (Array.isArray(v)) return v as Array<Record<string, unknown>>;
      if (typeof v === 'string') {
        const parsed = parseArray(v);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

/** Weekly AI analysis — discover patterns from pulse entries + behavioral signals */
export async function POST(request: NextRequest) {
  await connection();

  // Auth (unchanged contract): x-api-key header OR super_admin session.
  // The session client is also what enqueues — fn_ai_enqueue / fn_ai_job_status
  // are auth.uid()-gated to the SAME user, so we keep it in hand throughout.
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  const apiKey = request.headers.get('x-api-key');
  const viaApiKey = !!VALID_API_KEY && apiKey === VALID_API_KEY;

  if (!viaApiKey) {
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await session
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // The Max lane is enqueued as the requesting user (auth.uid()). A pure
  // x-api-key call carries no session, so it cannot run on the subscription
  // lane. Surface this explicitly (rule: no silent failures) — the interactive
  // super-admin "Run analysis" button always has a session and works.
  if (!user) {
    return NextResponse.json(
      {
        error:
          'Weekly analysis now runs on the Claude Max lane, which requires an interactive super-admin session. Trigger it from the Agent Board.',
      },
      { status: 503 }
    );
  }

  try {
    const supabase = createServiceRoleClient();

    // Calculate date range (past 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString();

    // Fetch all data in parallel (unchanged — this is the assembly the seeded
    // prompt's four placeholders are fed from).
    const [entriesResult, activityResult, patternsResult, interviewsResult] =
      await Promise.all([
        // 1. Pulse entries from past week
        supabase
          .from('wp_pulse_entries')
          .select('*, profiles(full_name, role, department_id)')
          .gte('created_at', weekAgoStr)
          .order('created_at', { ascending: false }),

        // 2. User activity logs (behavioral signals)
        supabase
          .from('user_activity_logs')
          .select('user_id, action, target_type, metadata')
          .gte('created_at', weekAgoStr)
          .limit(500),

        // 3. Existing patterns (for trend comparison)
        supabase
          .from('wp_patterns')
          .select('*')
          .order('impact_score', { ascending: false })
          .limit(50),

        // 4. Recent micro-interview responses
        supabase
          .from('wp_micro_interviews')
          .select('*, pattern:wp_patterns(name, category)')
          .not('responded_at', 'is', null)
          .gte('responded_at', weekAgoStr),
      ]);

    const entries = entriesResult.data || [];
    const activities = activityResult.data || [];
    const existingPatterns = patternsResult.data || [];
    const interviewResponses = interviewsResult.data || [];

    if (entries.length === 0) {
      return NextResponse.json({
        message: 'No entries to analyze this week',
        patterns_updated: 0,
      });
    }

    // Build the payload variables the seeded prompt expects. Keys MUST match the
    // {{placeholders}} in ai_job_types.prompt_template for 'work_pulse.analyze'
    // EXACTLY: entries, activities, existing_patterns, interviews. We pre-stringify
    // (same JSON.stringify the previous inline prompt used) so the drain drops the
    // exact text into each placeholder. Categories are enforced below on upsert.
    const payload = {
      entries: JSON.stringify(entries, null, 2),
      activities: JSON.stringify(activities.slice(0, 100), null, 2),
      existing_patterns: JSON.stringify(existingPatterns, null, 2),
      interviews: JSON.stringify(interviewResponses, null, 2),
    };

    // Enqueue on the registry Max lane. fn_ai_enqueue resolves the job spec
    // (prompt_template + tool_set) from ai_job_types and gates on allow_rule;
    // the generic seat/Windows drain executes it at ₹0 API cost.
    const { data: enq, error: enqError } = await session.rpc('fn_ai_enqueue', {
      p_job_type: 'work_pulse.analyze',
      p_payload: payload,
    });
    if (enqError || !enq?.ok || typeof enq?.job_id !== 'string') {
      const errText = typeof enq?.error === 'string' ? enq.error : '';
      if (errText === 'unknown or disabled job_type') {
        return NextResponse.json(
          { error: 'Analysis is not available right now. Please try again later.' },
          { status: 503 }
        );
      }
      if (errText === 'too many in-flight jobs of this type') {
        return NextResponse.json(
          { error: 'An analysis is already in progress. Please wait for it to finish.' },
          { status: 429 }
        );
      }
      if (errText === 'not allowed for this job_type' || errText === 'UNAUTHORIZED') {
        return NextResponse.json(
          { error: 'You do not have access to run the weekly analysis.' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: 'Could not start analysis. Please try again.' },
        { status: 500 }
      );
    }

    // Long-poll the job status (as the same user who enqueued).
    const jobId = enq.job_id;
    const startedAt = Date.now();
    let analysisResult: Array<Record<string, unknown>> | null = null;
    let jobFailed = false;
    while (Date.now() - startedAt < TOTAL_DEADLINE_MS) {
      await sleep(POLL_MS);
      const { data: st, error: stError } = await session.rpc('fn_ai_job_status', {
        p_job_id: jobId,
      });
      if (stError || !st || typeof st.status !== 'string') continue;
      if (st.status === 'done') {
        analysisResult = extractPatternArray((st as { result?: unknown }).result);
        break;
      }
      if (st.status === 'error' || st.status === 'canceled' || st.status === 'not_found') {
        jobFailed = true;
        break;
      }
      // Never claimed within the unclaimed window → the drain is offline.
      if (st.status === 'pending' && Date.now() - startedAt > UNCLAIMED_DEADLINE_MS) {
        break;
      }
    }

    if (jobFailed) {
      return NextResponse.json(
        { error: 'Analysis failed on the Max lane. Please try again.' },
        { status: 502 }
      );
    }
    if (analysisResult === null) {
      // The job may still complete on the drain and can be re-run; the board is
      // the durable sink for its output. Tell the caller it's still running.
      return NextResponse.json(
        {
          error:
            'Analysis did not finish in time. It may still be running — refresh the board in a minute.',
        },
        { status: 503 }
      );
    }

    // Upsert patterns (unchanged)
    let patternsUpdated = 0;
    const notifications: Array<{ type: string; user_ids: string[]; message: string }> = [];

    for (const pattern of analysisResult) {
      // Validate category
      if (!WP_CATEGORIES.includes(pattern.category as (typeof WP_CATEGORIES)[number])) {
        pattern.category = 'General Administration';
      }

      // Calculate tier from impact score
      const score = (pattern.impact_score as number) || 0;
      const tier = score >= 100 ? 'S' : score >= 50 ? 'A' : score >= 20 ? 'B' : 'C';

      // Check if pattern already exists (match by name)
      const existing = existingPatterns.find(
        (p) => p.name.toLowerCase() === String(pattern.name).toLowerCase()
      );

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('wp_patterns')
          .update({
            description: pattern.description,
            people_affected: pattern.people_affected || existing.people_affected,
            roles_affected: pattern.roles_affected || existing.roles_affected,
            hours_wasted_weekly: pattern.hours_wasted_weekly || existing.hours_wasted_weekly,
            feasibility_score: pattern.feasibility_score || existing.feasibility_score,
            solution_type: pattern.solution_type || existing.solution_type,
            impact_score: score,
            tier,
            last_analysis_at: new Date().toISOString(),
            analysis_metadata: pattern.metadata || {},
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (!error) patternsUpdated++;
      } else {
        // Insert new
        const { error } = await supabase.from('wp_patterns').insert({
          name: pattern.name,
          description: pattern.description,
          category: pattern.category,
          source: 'pulse',
          people_affected: pattern.people_affected || 0,
          roles_affected: pattern.roles_affected || [],
          hours_wasted_weekly: pattern.hours_wasted_weekly || 0,
          feasibility_score: pattern.feasibility_score || null,
          solution_type: pattern.solution_type || null,
          impact_score: score,
          tier,
          status: 'discovered',
          last_analysis_at: new Date().toISOString(),
          analysis_metadata: pattern.metadata || {},
        });

        if (!error) patternsUpdated++;
      }

      // Generate training win notifications
      if (pattern.solution_type === 'training') {
        notifications.push({
          type: 'training_win',
          user_ids: (pattern.affected_user_ids as string[]) || [],
          message: `Training opportunity identified: "${pattern.name}" — ${pattern.description}`,
        });
      }
    }

    // Write notifications
    for (const notif of notifications) {
      if (notif.user_ids.length === 0) continue;

      // notifications real columns: body/created_by/targeting/kind are NOT NULL
      // and there is NO type/message column. The prior insert used {type,
      // message} so it threw at runtime and no training-win notification was
      // delivered. Mirror the already-fixed sibling app/api/work-pulse/notify:
      // body carries the message, created_by anchors to the first recipient,
      // targeting + the fan-out below deliver it to every affected user.
      const { data: notification } = await supabase
        .from('notifications')
        .insert({
          title: 'Training Opportunity',
          body: notif.message,
          created_by: notif.user_ids[0],
          targeting: { type: 'user', user_ids: notif.user_ids },
          category: 'work_pulse',
          kind: 'work_item',
          metadata: { source: 'work_pulse_analysis' },
        })
        .select('id')
        .single();

      if (notification) {
        const links = notif.user_ids.map((uid: string) => ({
          notification_id: notification.id,
          user_id: uid,
        }));
        await supabase.from('user_notifications').insert(links);
      }
    }

    return NextResponse.json({
      message: 'Analysis complete',
      entries_analyzed: entries.length,
      patterns_updated: patternsUpdated,
      notifications_sent: notifications.length,
    });
  } catch (error) {
    console.error('[work-pulse/analyze]', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}
