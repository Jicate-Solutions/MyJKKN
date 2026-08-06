/**
 * MBA Analyst Dashboard — server entry.
 * A read-only analytics surface for an MBA Associate: the de-identified,
 * k≥5-suppressed analyst views for the department(s) they are posted to.
 * Auth is checked here; the view permission gate + no-access / empty panels
 * live in the client so a denied user gets an explicit reason, never a silent
 * redirect (CLAUDE.md #27).
 *
 * Distinct from /improvement-board/dashboard (a different PR) — this is the
 * assignment-scoped analyst read, gated by improvement.ideas.view.
 */

import { createClient } from '@/lib/supabase/server';
import { AnalyticsClient } from './_components/analytics-client';

export const dynamic = 'force-dynamic';

export default async function MbaAnalystDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to view your department analytics.
        </p>
      </div>
    );
  }

  return <AnalyticsClient userId={user.id} />;
}
