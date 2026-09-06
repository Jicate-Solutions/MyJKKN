/**
 * MBA Team Rotation — team builder (server entry).
 * Managers (improvement.board.manage) build teams of MBA Associates by hand.
 * Auth is checked here; the manager gate + no-access panel live in the client so
 * a denied user gets an explicit reason (never a silent redirect — CLAUDE.md #27).
 */

import { createClient } from '@/lib/supabase/server';
import { TeamBuilderClient } from './_components/team-builder-client';

export const dynamic = 'force-dynamic';

export default async function MbaRotationTeamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Please sign in to build teams.</p>
      </div>
    );
  }

  return <TeamBuilderClient />;
}
