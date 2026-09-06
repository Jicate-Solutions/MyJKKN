/**
 * MBA Analyst Assignments — server entry.
 * Managers (improvement.board.manage) decide which MBA Associate covers which
 * department (improvement_area). Auth is checked here; the manager permission
 * gate + no-access panel live in the client so a denied user still gets an
 * explicit reason (never a silent redirect — CLAUDE.md #27).
 */

import { createClient } from '@/lib/supabase/server';
import { PostingsClient } from './_components/postings-client';

export const dynamic = 'force-dynamic';

export default async function MbaAnalystPostingsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to manage MBA Analyst assignments.
        </p>
      </div>
    );
  }

  return <PostingsClient />;
}
