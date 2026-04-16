export const dynamic = 'force-dynamic';

/**
 * POST /api/learn/notify?type=<LearnEventType>
 *
 * Server-side notification dispatch for the PDE Learn module.
 * Auth: x-api-key header (LEARN_NOTIFY_API_KEY env var).
 * Writes to the same `notifications` + `user_notifications` tables used by
 * work-pulse/notify — pattern copied verbatim from that route.
 *
 * Supported event types:
 *   quest_unlocked          — new quest available → notify learner
 *   capability_level_up     — learner advances tier → notify learner + optional mentor
 *   achievement_badge_earned — badge awarded → notify learner
 *   cohort_milestone        — shared milestone → notify all cohort members
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type {
  LearnEventType,
  QuestUnlockedPayload,
  CapabilityLevelUpPayload,
  AchievementBadgeEarnedPayload,
  CohortMilestonePayload,
} from '@/types/learn';

const VALID_API_KEY = process.env.LEARN_NOTIFY_API_KEY;

export async function POST(request: NextRequest) {
  await connection();

  // Auth: x-api-key only (called by server-side actions / cron)
  const apiKey = request.headers.get('x-api-key');
  if (!VALID_API_KEY || apiKey !== VALID_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') as LearnEventType | null;

  if (!type) {
    return NextResponse.json({ error: 'Missing ?type= parameter' }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // body is optional for some event types; silently ignore parse failure
  }

  try {
    const supabase = createServiceRoleClient();

    switch (type) {
      case 'quest_unlocked':
        return await handleQuestUnlocked(supabase, body as unknown as QuestUnlockedPayload);

      case 'capability_level_up':
        return await handleCapabilityLevelUp(supabase, body as unknown as CapabilityLevelUpPayload);

      case 'achievement_badge_earned':
        return await handleAchievementBadgeEarned(supabase, body as unknown as AchievementBadgeEarnedPayload);

      case 'cohort_milestone':
        return await handleCohortMilestone(supabase, body as unknown as CohortMilestonePayload);

      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    console.error(`[learn/notify/${type}]`, error);
    return NextResponse.json(
      { error: 'Notification failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── Dispatch helper (verbatim from work-pulse/notify pattern) ───────────────

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
      type: 'learn_pde',
      title,
      message,
      metadata: { source: 'learn_pde_notify', ...metadata },
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

// ─── Event Handlers ──────────────────────────────────────────────────────────

/**
 * quest_unlocked — A new quest became available for the learner.
 * Body: { quest_id, quest_title, learner_id, action_url? }
 */
async function handleQuestUnlocked(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: QuestUnlockedPayload
) {
  const { quest_id, quest_title, learner_id, action_url } = body;

  if (!quest_id || !quest_title || !learner_id) {
    return NextResponse.json(
      { error: 'quest_unlocked requires quest_id, quest_title, learner_id' },
      { status: 400 }
    );
  }

  const count = await createNotification(
    supabase,
    'New Quest Unlocked!',
    `A new quest is waiting for you: "${quest_title}". Start building and earn reputation points.`,
    [learner_id],
    { quest_id, action_url: action_url ?? `/learn/quests/${quest_id}` }
  );

  return NextResponse.json({ type: 'quest_unlocked', notified: count });
}

/**
 * capability_level_up — Learner advances a capability tier.
 * Body: { capability_id, capability_name, learner_id, new_status, mentor_id?, action_url? }
 * Notifies learner always; notifies mentor too when mentor_id is present.
 */
async function handleCapabilityLevelUp(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: CapabilityLevelUpPayload
) {
  const { capability_id, capability_name, learner_id, new_status, mentor_id, action_url } = body;

  if (!capability_id || !capability_name || !learner_id || !new_status) {
    return NextResponse.json(
      { error: 'capability_level_up requires capability_id, capability_name, learner_id, new_status' },
      { status: 400 }
    );
  }

  const statusLabel = new_status === 'mastered' ? 'mastered' : 'demonstrated';

  // Notify the learner
  const learnerCount = await createNotification(
    supabase,
    `Capability ${new_status === 'mastered' ? 'Mastered' : 'Demonstrated'}!`,
    `You have ${statusLabel} "${capability_name}". Keep building to unlock the next tier.`,
    [learner_id],
    {
      capability_id,
      new_status,
      action_url: action_url ?? `/learn/capabilities/${capability_id}`,
    }
  );

  // Notify mentor (if in cohort)
  let mentorCount = 0;
  if (mentor_id) {
    // Fetch learner's display name for the mentor message
    const { data: learnerProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', learner_id)
      .maybeSingle();

    const learnerName = learnerProfile?.full_name ?? 'Your learner';

    mentorCount = await createNotification(
      supabase,
      'Cohort Learner Level Up',
      `${learnerName} has ${statusLabel} "${capability_name}". Consider acknowledging their progress.`,
      [mentor_id],
      {
        capability_id,
        new_status,
        learner_id,
        action_url: action_url ?? `/learn/capabilities/${capability_id}`,
      }
    );
  }

  return NextResponse.json({
    type: 'capability_level_up',
    notified_learner: learnerCount,
    notified_mentor: mentorCount,
  });
}

/**
 * achievement_badge_earned — A badge was awarded.
 * Body: { badge_id, badge_name, learner_id, action_url? }
 */
async function handleAchievementBadgeEarned(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: AchievementBadgeEarnedPayload
) {
  const { badge_id, badge_name, learner_id, action_url } = body;

  if (!badge_id || !badge_name || !learner_id) {
    return NextResponse.json(
      { error: 'achievement_badge_earned requires badge_id, badge_name, learner_id' },
      { status: 400 }
    );
  }

  const count = await createNotification(
    supabase,
    'Badge Earned!',
    `Congratulations! You earned the "${badge_name}" badge. Check your profile to see your collection.`,
    [learner_id],
    { badge_id, action_url: action_url ?? `/learn/profile` }
  );

  return NextResponse.json({ type: 'achievement_badge_earned', notified: count });
}

/**
 * cohort_milestone — A cohort reaches a shared milestone.
 * Body: { cohort_id, cohort_name, milestone_description, member_ids, action_url? }
 * Notifies ALL cohort members.
 *
 * NOTE: learn_cohorts + pde_cohort_members tables are assumed to exist.
 * If member_ids is supplied in the body we use it directly (event-driven).
 * Validator should confirm table existence before live deploy.
 */
async function handleCohortMilestone(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: CohortMilestonePayload
) {
  const { cohort_id, cohort_name, milestone_description, member_ids, action_url } = body;

  if (!cohort_id || !cohort_name || !milestone_description) {
    return NextResponse.json(
      { error: 'cohort_milestone requires cohort_id, cohort_name, milestone_description' },
      { status: 400 }
    );
  }

  // Use provided member_ids or fall back to DB lookup
  let targetIds: string[] = Array.isArray(member_ids) ? member_ids : [];

  if (targetIds.length === 0) {
    // Assumption: pde_cohort_members(cohort_id, learner_id) table exists
    const { data: members } = await supabase
      .from('pde_cohort_members')
      .select('learner_id')
      .eq('cohort_id', cohort_id)
      .eq('is_active', true);

    targetIds = (members ?? []).map((m: { learner_id: string }) => m.learner_id);
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ type: 'cohort_milestone', notified: 0, reason: 'no_members' });
  }

  const count = await createNotification(
    supabase,
    `${cohort_name} — Milestone Reached!`,
    milestone_description,
    targetIds,
    { cohort_id, action_url: action_url ?? `/learn/quests` }
  );

  return NextResponse.json({ type: 'cohort_milestone', notified: count });
}
