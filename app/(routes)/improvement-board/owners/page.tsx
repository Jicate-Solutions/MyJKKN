/**
 * Department owners — server entry.
 *
 * A plain list of the active improvement boards with a name box beside each, so
 * naming an accountable person for a department no longer requires opening that
 * department's AI-drafted organogram playbook, filling every placeholder and
 * approving it.
 *
 * Auth is checked here and nothing else. The two permission tiers (who may SEE
 * the list vs who may CHANGE an owner) and the no-access panel live in the
 * client, so a denied user gets an explicit reason naming who to contact —
 * never a silent redirect (CLAUDE.md #27).
 */

import { createClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { DepartmentOwnersClient } from './_components/owners-client';

export const dynamic = 'force-dynamic';

export default async function DepartmentOwnersPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          Please sign in to see who owns each department.
        </p>
      </div>
    );
  }

  return (
    <ContentLayout title="Department owners">
      <DepartmentOwnersClient />
    </ContentLayout>
  );
}
