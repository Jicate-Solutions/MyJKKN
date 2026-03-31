import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { WP_CATEGORIES } from '@/types/work-pulse';

const VALID_API_KEY = process.env.WORK_PULSE_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

/** Weekly AI analysis — discover patterns from pulse entries + behavioral signals */
export async function POST(request: NextRequest) {
  await connection();

  // Auth: x-api-key header or super_admin session
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== VALID_API_KEY) {
    // Fallback: check super_admin session
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (!ANTHROPIC_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 503 }
    );
  }

  try {
    const supabase = createServiceRoleClient();

    // Calculate date range (past 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString();

    // Fetch all data in parallel
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

    // Build Claude prompt
    const prompt = buildAnalysisPrompt(entries, activities, existingPatterns, interviewResponses);

    // Call Claude with 60s timeout
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let analysisResult;
    try {
      const message = await anthropic.messages.create(
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      const content = message.content[0];
      const text = content.type === 'text' ? content.text : '';

      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: 'Failed to parse AI response', raw: text.slice(0, 500) },
          { status: 500 }
        );
      }
      analysisResult = JSON.parse(jsonMatch[0]);
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === 'AbortError') {
        return NextResponse.json({ error: 'Analysis timed out (60s)' }, { status: 504 });
      }
      throw err;
    }

    // Upsert patterns
    let patternsUpdated = 0;
    const notifications: Array<{ type: string; user_ids: string[]; message: string }> = [];

    for (const pattern of analysisResult) {
      // Validate category
      if (!WP_CATEGORIES.includes(pattern.category)) {
        pattern.category = 'General Administration';
      }

      // Calculate tier from impact score
      const score = pattern.impact_score || 0;
      const tier = score >= 100 ? 'S' : score >= 50 ? 'A' : score >= 20 ? 'B' : 'C';

      // Check if pattern already exists (match by name)
      const existing = existingPatterns.find(
        (p) => p.name.toLowerCase() === pattern.name.toLowerCase()
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
          user_ids: pattern.affected_user_ids || [],
          message: `Training opportunity identified: "${pattern.name}" — ${pattern.description}`,
        });
      }
    }

    // Write notifications
    for (const notif of notifications) {
      if (notif.user_ids.length === 0) continue;

      const { data: notification } = await supabase
        .from('notifications')
        .insert({
          type: 'work_pulse',
          title: 'Training Opportunity',
          message: notif.message,
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

function buildAnalysisPrompt(
  entries: unknown[],
  activities: unknown[],
  existingPatterns: unknown[],
  interviews: unknown[]
): string {
  return `You are an organizational efficiency analyst for JKKN educational institutions.

Analyze the following data and identify automation/improvement patterns.

## This Week's Pulse Entries (${(entries as Array<Record<string, unknown>>).length} responses)
${JSON.stringify(entries, null, 2)}

## Behavioral Activity Signals (${(activities as Array<Record<string, unknown>>).length} events)
${JSON.stringify((activities as Array<Record<string, unknown>>).slice(0, 100), null, 2)}

## Existing Patterns (for trend comparison)
${JSON.stringify(existingPatterns, null, 2)}

## Micro-Interview Responses
${JSON.stringify(interviews, null, 2)}

## Valid Categories
${WP_CATEGORIES.join(', ')}

## Instructions
1. Cluster similar complaints into patterns
2. For each pattern, calculate:
   - people_affected: unique reporter count
   - hours_wasted_weekly: estimated institution-wide hours
   - feasibility_score: 1-10 (how easy to automate)
   - impact_score: people × hours × feasibility / build_effort_estimate
3. Classify solution_type: new_module, standalone_agent, process_change, or training
4. Flag week-over-week trends (growing/shrinking problems)
5. Identify entries that are actually platform bugs (not workflow issues)

## Output Format
Return a JSON array of pattern objects:
[
  {
    "name": "Pattern Name",
    "description": "What the repetitive work is",
    "category": "One of the valid categories",
    "people_affected": 5,
    "roles_affected": ["faculty", "hod"],
    "hours_wasted_weekly": 12.5,
    "feasibility_score": 7,
    "impact_score": 43.75,
    "solution_type": "standalone_agent",
    "metadata": { "trend": "growing", "confidence": 0.85 },
    "affected_user_ids": []
  }
]

Return ONLY the JSON array, no other text.`;
}
