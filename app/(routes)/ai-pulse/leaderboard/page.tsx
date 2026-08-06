// app/(routes)/ai-pulse/leaderboard/page.tsx
// ============================================================================
// AI Pulse Leaderboard  (F3 / F4 / B5)
// ============================================================================
// Public-to-every-authenticated-learner leaderboard for the AI Pulse prompt-
// engineering loop. Rewards participation + quality equally across four axes
// (build a prompt · take the quiz · use a starter · publish on Instagram) and
// ranks departments by average points per ACTIVE student to drive broad
// adoption. Design LOCKED via a 20-decision Director interview.
//
// Data: leaderboard RPCs from migration 20260724120000_ai_pulse_leaderboard.sql.
//
// Dark-launch: hidden behind the `leaderboard_enabled` config flag (default
// false). Super admins can always preview it so the Director can review before
// flipping it live for everyone.
// ============================================================================

export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Trophy } from 'lucide-react';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';

import { LeaderboardTabs } from './_components/leaderboard-tabs';

export const metadata: Metadata = {
  title: 'AI Pulse Leaderboard',
  description: 'Where you stand on AI Pulse — build, quiz, publish, and climb.',
};

export default async function AiPulseLeaderboardPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/ai-pulse/leaderboard');

  // Is this a super admin? (they can preview the board even while it is dark)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin, institution_id')
    .eq('id', user.id)
    .single();
  const isSuperAdmin =
    profile?.is_super_admin === true || profile?.role === 'super_admin';
  const viewerInstitutionId: string | null = profile?.institution_id ?? null;

  // Dark-launch flags — defensive: if the config rows / substrate aren't
  // present, treat as disabled rather than throwing. The learner board and the
  // Senior Learner (staff/faculty) board have INDEPENDENT switches so each can
  // go live on its own schedule.
  let enabled = false;
  let seniorEnabled = false;
  try {
    const { data: cfg } = await supabase
      .from('ai_pulse_policies')
      .select('config_key, value_jsonb')
      .in('config_key', ['leaderboard_enabled', 'leaderboard_staff_board_enabled'])
      .eq('is_active', true);
    for (const row of cfg ?? []) {
      if (row.config_key === 'leaderboard_enabled') enabled = row.value_jsonb === true;
      if (row.config_key === 'leaderboard_staff_board_enabled')
        seniorEnabled = row.value_jsonb === true;
    }
  } catch {
    enabled = false;
    seniorEnabled = false;
  }

  const showBoard = enabled || isSuperAdmin;
  // The Senior Learner tab appears only when its own flag is on, or for a super
  // admin previewing. A normal Senior Learner sees nothing while it is dark.
  const showSeniorBoard = seniorEnabled || isSuperAdmin;

  return (
    <ContentLayout title="AI Pulse Leaderboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Leaderboard' },
        ]}
      />
      <div className="mt-4 space-y-6">
        <div>
          <h1 className="flex items-center gap-2 py-1 text-2xl font-bold">
            <Trophy className="h-6 w-6 text-amber-500" />
            AI Pulse Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Earn points for taking part — build a prompt, take the quiz, use a
            weekly starter, publish your work. Do it well for bonus points.
            Everyone can see where everyone stands.
          </p>
        </div>

        {showBoard ? (
          <>
            {!enabled && isSuperAdmin && (
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="py-3 text-sm text-amber-800">
                  Preview only — the leaderboard is not yet visible to learners.
                  Flip <code className="font-mono">leaderboard_enabled</code> in
                  AI Pulse policies to go live.
                </CardContent>
              </Card>
            )}
            <LeaderboardTabs
              viewerInstitutionId={viewerInstitutionId}
              showSeniorBoard={showSeniorBoard}
              seniorBoardEnabled={seniorEnabled}
            />
          </>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              The AI Pulse leaderboard is launching soon. Keep building prompts,
              taking quizzes, and publishing your work — your points are already
              being counted.
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
