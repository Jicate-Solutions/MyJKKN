/**
 * MBA Team Rotation — rota chart (server entry).
 * The rotary chart (teams × departments × periods) is viewable by any MBA
 * Associate (improvement.ideas.view); managers get extra manage affordances.
 * Auth is checked here; the permission gate + no-access panel live in the client
 * so a denied user gets an explicit reason (never a silent redirect — CLAUDE.md #27).
 */

import { createClient } from '@/lib/supabase/server';
import { RotationChartClient } from './_components/rotation-chart-client';

export const dynamic = 'force-dynamic';

export default async function MbaRotationChartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to view the team rotation.
        </p>
      </div>
    );
  }

  return <RotationChartClient />;
}
