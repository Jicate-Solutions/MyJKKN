/**
 * MBA Team Rotation — cycle setup (server entry).
 * Managers (improvement.board.manage) configure rotation cycles: period length,
 * start date, the department set, exam/holiday blackouts, and generate the rota.
 * Auth is checked here; the manager gate + no-access panel live in the client so
 * a denied user gets an explicit reason (never a silent redirect — CLAUDE.md #27).
 */

import { createClient } from '@/lib/supabase/server';
import { RotationConfigClient } from './_components/rotation-config-client';

export const dynamic = 'force-dynamic';

export default async function MbaRotationConfigPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Please sign in to set up rotation.</p>
      </div>
    );
  }

  return <RotationConfigClient />;
}
