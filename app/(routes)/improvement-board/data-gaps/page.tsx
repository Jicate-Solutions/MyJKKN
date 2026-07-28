/**
 * MBA Data Gaps — server entry.
 * Managers (improvement.board.manage) triage the data gaps Associates filed from
 * empty analytics pages. Auth is checked here; the manager permission gate +
 * no-access panel live in the client so a denied user still gets an explicit
 * reason (never a silent redirect — CLAUDE.md #27).
 */

import { createClient } from '@/lib/supabase/server';
import { DataGapsClient } from './_components/data-gaps-client';

export const dynamic = 'force-dynamic';

export default async function MbaDataGapsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to triage data gaps.
        </p>
      </div>
    );
  }

  return <DataGapsClient />;
}
