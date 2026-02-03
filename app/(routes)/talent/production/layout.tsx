import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProductionNav } from '@/components/solutions/portals/production-nav';

export default async function ProductionPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Check if user is a production learner
  const { data: learner } = await (supabase as any).from('sh_production_learners')
    .select('id, name, division, skill_level, is_active')
    .eq('user_id', user.id)
    .single();

  if (!learner) {
    redirect('/');
  }

  if (!learner.is_active) {
    redirect('/');
  }

  return (
    <div className="flex h-screen bg-background">
      <ProductionNav
        learnerName={learner.name}
        division={learner.division}
        skillLevel={learner.skill_level || 'beginner'}
      />
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
}
