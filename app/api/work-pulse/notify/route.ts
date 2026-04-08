

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { WP_CATEGORIES } from '@/types/work-pulse';

const VALID_API_KEY = process.env.WORK_PULSE_API_KEY;

type NotificationType =
  | 'pulse_reminder'
  | 'pulse_followup'
  | 'pattern_building'
  | 'agent_deployed'
  | 'training_win'
  | 'hod_compliance'
  | 'micro_interview';

/** 7 notification types for Work Pulse engagement loop */
export async function POST(request: NextRequest) {
  await connection();

  // Auth: x-api-key only (cron)
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== VALID_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') as NotificationType;

  if (!type) {
    return NextResponse.json({ error: 'Missing ?type= parameter' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();

    switch (type) {
      case 'pulse_reminder':
        return await handlePulseReminder(supabase);
      case 'pulse_followup':
        return await handlePulseFollowup(supabase);
      case 'hod_compliance':
        return await handleHodCompliance(supabase);
      case 'pattern_building':
        return await handlePatternBuilding(supabase, request);
      case 'agent_deployed':
        return await handleAgentDeployed(supabase, request);
      case 'training_win':
        return await handleTrainingWin(supabase, request);
      case 'micro_interview':
        return await handleMicroInterview(supabase);
      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    console.error(`[work-pulse/notify/${type}]`, error);
    return NextResponse.json(
      { error: 'Notification failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// Helper: create notification and link to users
async function createNotification(
  supabase: ReturnType<typeof createServiceRoleClient>,
  title: string,
  message: string,
  userIds: string[],
  metadata: Record<string, unknown> = {}
): Promise<number> {
  if (userIds.length === 0) return 0;

  const { data: notification } = await supabase
    .from('notifications')
    .insert({
      type: 'work_pulse',
      title,
      message,
      metadata: { source: 'work_pulse_notify', ...metadata },
    })
    .select('id')
    .single();

  if (!notification) return 0;

  const links = userIds.map((uid) => ({
    notification_id: notification.id,
    user_id: uid,
  }));

  await supabase.from('user_notifications').insert(links);
  return userIds.length;
}

// Get current week Monday
function getCurrentWeekMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// ─── Notification Handlers ──────────────────────────────────────

/** Friday 4 PM — remind non-submitters */
async function handlePulseReminder(
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  const weekOf = getCurrentWeekMonday();

  // Get users who haven't submitted
  const { data: allStaff } = await supabase
    .from('profiles')
    .select('id')
    .not('role', 'eq', 'student')
    .eq('is_active', true);

  const { data: submitted } = await supabase
    .from('wp_pulse_entries')
    .select('user_id')
    .eq('week_of', weekOf);

  const submittedIds = new Set((submitted || []).map((s) => s.user_id));
  const nonSubmitters = (allStaff || [])
    .filter((s) => !submittedIds.has(s.id))
    .map((s) => s.id);

  const count = await createNotification(
    supabase,
    'Weekly Pulse Reminder',
    'Share your weekly pulse — what\'s slowing you down? Takes just 2 minutes.',
    nonSubmitters
  );

  return NextResponse.json({ type: 'pulse_reminder', notified: count });
}

/** Saturday 10 AM — follow up on still-missing */
async function handlePulseFollowup(
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  const weekOf = getCurrentWeekMonday();

  const { data: allStaff } = await supabase
    .from('profiles')
    .select('id')
    .not('role', 'eq', 'student')
    .eq('is_active', true);

  const { data: submitted } = await supabase
    .from('wp_pulse_entries')
    .select('user_id')
    .eq('week_of', weekOf);

  const submittedIds = new Set((submitted || []).map((s) => s.user_id));
  const nonSubmitters = (allStaff || [])
    .filter((s) => !submittedIds.has(s.id))
    .map((s) => s.id);

  const count = await createNotification(
    supabase,
    'Pulse Still Pending',
    'Your weekly pulse is still pending. Help us discover what can be automated!',
    nonSubmitters
  );

  return NextResponse.json({ type: 'pulse_followup', notified: count });
}

/** Monday 9 AM — alert HODs with <50% department submission */
async function handleHodCompliance(
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  const weekOf = getCurrentWeekMonday();

  // Get HODs
  const { data: hods } = await supabase
    .from('profiles')
    .select('id, department_id, institution_id')
    .eq('role', 'hod')
    .eq('is_active', true)
    .not('department_id', 'is', null);

  if (!hods || hods.length === 0) {
    return NextResponse.json({ type: 'hod_compliance', notified: 0 });
  }

  const notifyIds: string[] = [];

  for (const hod of hods) {
    // Count staff in department
    const { count: totalStaff } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', hod.department_id)
      .not('role', 'eq', 'student')
      .eq('is_active', true);

    // Count submissions
    const { count: submittedCount } = await supabase
      .from('wp_pulse_entries')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', hod.department_id)
      .eq('week_of', weekOf);

    const rate = (totalStaff || 0) > 0
      ? ((submittedCount || 0) / (totalStaff || 1)) * 100
      : 0;

    if (rate < 50) {
      notifyIds.push(hod.id);
    }
  }

  const count = await createNotification(
    supabase,
    'Department Pulse Compliance',
    'Your department has less than 50% pulse submission rate this week. Encourage your team to participate!',
    notifyIds
  );

  return NextResponse.json({ type: 'hod_compliance', notified: count });
}

/** Event-driven: notify users when pattern matching their category is being built */
async function handlePatternBuilding(
  supabase: ReturnType<typeof createServiceRoleClient>,
  request: NextRequest
) {
  const body = await request.json().catch(() => ({}));
  const { pattern_id, category } = body;

  if (!pattern_id || !category) {
    return NextResponse.json({ error: 'Missing pattern_id or category' }, { status: 400 });
  }

  // Validate category against allowlist
  if (!WP_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  // Find users who reported this category
  const { data: reporters } = await supabase
    .from('wp_pulse_entries')
    .select('user_id')
    .or(`talent_waste_category.eq.${category},repetition_category.eq.${category}`);

  const userIds = [...new Set((reporters || []).map((r) => r.user_id))];

  const count = await createNotification(
    supabase,
    'Pattern Being Addressed',
    `Good news! The "${category}" issue you reported is now being worked on.`,
    userIds,
    { pattern_id }
  );

  return NextResponse.json({ type: 'pattern_building', notified: count });
}

/** Event-driven: notify affected users when agent is deployed */
async function handleAgentDeployed(
  supabase: ReturnType<typeof createServiceRoleClient>,
  request: NextRequest
) {
  const body = await request.json().catch(() => ({}));
  const { pattern_id, agent_name } = body;

  if (!pattern_id) {
    return NextResponse.json({ error: 'Missing pattern_id' }, { status: 400 });
  }

  const { data: pattern } = await supabase
    .from('wp_patterns')
    .select('category, roles_affected')
    .eq('id', pattern_id)
    .single();

  if (!pattern) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
  }

  const { data: reporters } = await supabase
    .from('wp_pulse_entries')
    .select('user_id')
    .or(
      `talent_waste_category.eq.${pattern.category},repetition_category.eq.${pattern.category}`
    );

  const userIds = [...new Set((reporters || []).map((r) => r.user_id))];

  const count = await createNotification(
    supabase,
    'New Agent Deployed!',
    `"${agent_name || 'New solution'}" has been deployed to address the ${pattern.category} issue you reported.`,
    userIds,
    { pattern_id }
  );

  return NextResponse.json({ type: 'agent_deployed', notified: count });
}

/** Event-driven: notify affected users about training win */
async function handleTrainingWin(
  supabase: ReturnType<typeof createServiceRoleClient>,
  request: NextRequest
) {
  const body = await request.json().catch(() => ({}));
  const { pattern_id, training_details } = body;

  if (!pattern_id) {
    return NextResponse.json({ error: 'Missing pattern_id' }, { status: 400 });
  }

  const { data: pattern } = await supabase
    .from('wp_patterns')
    .select('name, category')
    .eq('id', pattern_id)
    .single();

  if (!pattern) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
  }

  const { data: reporters } = await supabase
    .from('wp_pulse_entries')
    .select('user_id')
    .or(
      `talent_waste_category.eq.${pattern.category},repetition_category.eq.${pattern.category}`
    );

  const userIds = [...new Set((reporters || []).map((r) => r.user_id))];

  const count = await createNotification(
    supabase,
    'Training Available',
    `Training identified for "${pattern.name}": ${training_details || 'Check the Agent Board for details.'}`,
    userIds,
    { pattern_id }
  );

  return NextResponse.json({ type: 'training_win', notified: count });
}

/** Event-driven: send micro-interview to random sample of reporters */
async function handleMicroInterview(
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  // Get patterns that need more context (10+ reporters, discovered status)
  const { data: patterns } = await supabase
    .from('wp_patterns')
    .select('id, name, category')
    .gte('people_affected', 10)
    .eq('status', 'discovered')
    .limit(5);

  if (!patterns || patterns.length === 0) {
    return NextResponse.json({ type: 'micro_interview', sent: 0 });
  }

  let totalSent = 0;

  for (const pattern of patterns) {
    // Find reporters for this category
    const { data: reporters } = await supabase
      .from('wp_pulse_entries')
      .select('user_id')
      .or(
        `talent_waste_category.eq.${pattern.category},repetition_category.eq.${pattern.category}`
      );

    if (!reporters || reporters.length === 0) continue;

    // 30% random sample
    const uniqueIds = [...new Set(reporters.map((r) => r.user_id))];
    const sampleSize = Math.max(1, Math.ceil(uniqueIds.length * 0.3));
    const shuffled = uniqueIds.sort(() => Math.random() - 0.5);
    const sample = shuffled.slice(0, sampleSize);

    // Check monthly limit (belt and suspenders — trigger also checks)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    for (const userId of sample) {
      const { count: thisMonth } = await supabase
        .from('wp_micro_interviews')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString());

      if ((thisMonth || 0) >= 1) continue;

      const { error } = await supabase.from('wp_micro_interviews').insert({
        pattern_id: pattern.id,
        user_id: userId,
        question_text: `How often do you encounter "${pattern.name}" in your daily work?`,
        options: JSON.stringify([
          'Multiple times daily',
          'Once a day',
          'A few times a week',
          'Occasionally',
          'Rarely',
        ]),
      });

      if (!error) totalSent++;
    }
  }

  return NextResponse.json({ type: 'micro_interview', sent: totalSent });
}
