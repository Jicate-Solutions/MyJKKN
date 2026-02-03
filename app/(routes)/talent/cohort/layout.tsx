import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CohortNav } from '@/components/solutions/portals/cohort-nav';
import { CohortHeader } from '@/components/solutions/portals/cohort-header';

export default async function CohortPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Check if user is a cohort member
  const { data: cohortMember } = await supabase
    .from('sh_cohort_members')
    .select('id, name, level, is_active')
    .eq('user_id', user.id)
    .single();

  if (!cohortMember) {
    // User is not a cohort member, redirect to main dashboard
    redirect('/');
  }

  if (!cohortMember.is_active) {
    // Inactive cohort members cannot access the portal
    redirect('/');
  }

  return (
    <div className="flex h-screen bg-background">
      <CohortNav
        memberName={cohortMember.name}
        memberId={cohortMember.id}
        level={cohortMember.level || 0}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <CohortHeader
          memberName={cohortMember.name}
          level={cohortMember.level || 0}
        />
        <main className="flex-1 overflow-y-auto bg-muted/40 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
