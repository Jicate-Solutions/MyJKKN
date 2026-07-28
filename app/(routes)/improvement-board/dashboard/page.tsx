/**
 * MBA Associate Dashboard — server entry.
 * Shows the signed-in Associate their OWN contribution to the Improvement
 * Board plus a non-sensitive, RLS-scoped pulse of program activity. Auth is
 * checked here; the permission gate (improvement.ideas.view) and every data
 * read live in the client component, mirroring the sibling leaderboard route.
 * No new institutional data is exposed — the client only ever reads what an
 * Associate can already see through board RLS (own ideas + open, non-sensitive
 * ideas across the program).
 */

import { createClient } from '@/lib/supabase/server';
import { AssociateDashboard } from './_components/associate-dashboard';

export const dynamic = 'force-dynamic';

export default async function AssociateDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to view your dashboard.
        </p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <AssociateDashboard
      currentUserId={user.id}
      currentUserName={profile?.full_name || 'You'}
    />
  );
}
