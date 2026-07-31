/**
 * Manage boards — server entry.
 * Board managers (improvement.board.manage) add / rename / re-order / switch
 * off the areas that improvement ideas are filed against. Auth is checked here;
 * the manager permission gate + no-access panel live in the client so a denied
 * user still gets an explicit reason (never a silent redirect — CLAUDE.md #27).
 */

import { createClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { ManageBoardsClient } from './_components/manage-boards-client';

export const dynamic = 'force-dynamic';

export default async function ManageImprovementBoardsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to manage improvement boards.
        </p>
      </div>
    );
  }

  return (
    <ContentLayout title="Manage boards">
      <ManageBoardsClient />
    </ContentLayout>
  );
}
