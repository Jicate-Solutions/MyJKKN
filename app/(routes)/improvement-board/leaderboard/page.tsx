/**
 * Impact Leaderboard — server entry.
 * Top contributors by summed combined score, plus the viewer's own rank.
 * Safeguard: only a top list + "your rank" is ever shown — never a bottom /
 * "worst" ranking.
 */

import { createClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { ImpactLeaderboard } from './_components/impact-leaderboard';

export const dynamic = 'force-dynamic';

export default async function ImpactLeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to view the Impact Leaderboard.
        </p>
      </div>
    );
  }

  return (
    <ContentLayout title="Impact Leaderboard">
      <ImpactLeaderboard currentUserId={user.id} />
    </ContentLayout>
  );
}
