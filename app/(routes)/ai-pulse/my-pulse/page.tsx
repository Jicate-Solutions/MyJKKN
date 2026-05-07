// app/(routes)/ai-pulse/my-pulse/page.tsx
// Created: 2026-05-06 — Wave B.1 Learner My Pulse
// Relocated: 2026-05-07 (PR #729 Wave 2C nav-fix) — moved from /ai-pulse
// to /ai-pulse/my-pulse so the AI Pulse landing page (PR #749) remains
// authoritative and this learner-only view becomes a sub-route.
//
// DRAFT — gated on PR #644 (substrate: ai_pulse event_type + config.kind discriminator
// + engagement_signals JSONB) and PR #716 (aiPulse:* permission keys).
//
// Surface: /ai-pulse/my-pulse — learner sees their current cycle, team, attendance, streak,
// and quick actions for Domain-Sync / Quiz / Publication submissions.
//
// Permission gate: aiPulse:view.self (server-side via user_has_permission RPC).
// Falls through to /unauthorized when key not granted.

import { redirect } from 'next/navigation';
import {
  createClient,
  createServerSupabaseClient,
  getEnhancedUserProfile,
} from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { AiPulseLearnerService } from '@/lib/services/ai-pulse/learner-service';
import { CurrentCycleCard } from '../_components/current-cycle-card';
import { MyTeamCard } from '../_components/my-team-card';
import { MyAttendanceCard } from '../_components/my-attendance-card';
import { QuickActionsCard } from '../_components/quick-actions-card';

export const dynamic = 'force-dynamic';

async function checkPermission(key: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('user_has_permission', {
      permission_name: key,
    });
    if (error) {
      console.error(`[ai-pulse/page] user_has_permission(${key}) failed:`, error);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error(`[ai-pulse/page] permission check threw for ${key}:`, e);
    return false;
  }
}

export default async function AiPulseLearnerPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/auth/login?next=/ai-pulse');
  }

  // Permission gate — super_admin always passes; others require key.
  if (profile.is_super_admin !== true) {
    const canView = await checkPermission('aiPulse:view.self');
    if (!canView) {
      redirect('/unauthorized?module=ai-pulse');
    }
  }

  // Resolve action permissions in parallel (super_admin shortcut).
  const [canDomainSync, canQuiz, canPublication] = profile.is_super_admin
    ? [true, true, true]
    : await Promise.all([
        checkPermission('aiPulse:submit.domain_sync'),
        checkPermission('aiPulse:submit.quiz'),
        checkPermission('aiPulse:submit.publication'),
      ]);

  // Fetch cycle first; downstream queries need its id.
  const cycle = await AiPulseLearnerService.getCurrentCycleServer();

  let team = null;
  let attendance = {
    state: 'pending' as const,
    day_type: null,
    marked_at: null,
    signals: null,
  };
  let streak = 0;

  if (cycle) {
    const supabase = await createServerSupabaseClient();
    team = await AiPulseLearnerService.getMyTeam(cycle.id, profile.id, supabase);
    if (team) {
      attendance = await AiPulseLearnerService.getMyAttendance(
        cycle.id,
        team.registration_id,
        supabase
      );
    }
    streak = await AiPulseLearnerService.getMyStreak(profile.id, supabase);
  }

  return (
    <ContentLayout title="My Pulse">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'My Pulse' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">My Pulse</h1>
          <p className="text-sm text-muted-foreground">
            Your weekly AI Pulse cycle, team, attendance, and submissions.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <CurrentCycleCard cycle={cycle} />
          <MyTeamCard team={team} />
          <MyAttendanceCard attendance={attendance} streak={streak} />
          <QuickActionsCard
            cycleId={cycle?.id ?? null}
            hasTeam={!!team}
            canSubmitDomainSync={canDomainSync}
            canSubmitQuiz={canQuiz}
            canSubmitPublication={canPublication}
          />
        </div>
      </div>
    </ContentLayout>
  );
}
