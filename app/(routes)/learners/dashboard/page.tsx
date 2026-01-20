import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import DashboardOverview from './_components/dashboard-overview';
import QuickStats from './_components/quick-stats';
import UpcomingClasses from './_components/upcoming-classes';

export const metadata = {
  title: 'Dashboard | MyJKKN',
  description: 'Learner dashboard with overview, stats, and upcoming classes',
};

export default async function LearnerDashboardPage() {
  const supabase = await createClient();

  // Step 1: Authentication check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Step 2: Role validation
  const { data: profile } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/');
  }

  // Step 3: Lifecycle status validation
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardOverview learnerId={profile.learner_id} />
        </div>
        <div className="space-y-6">
          <QuickStats learnerId={profile.learner_id} />
          <UpcomingClasses learnerId={profile.learner_id} />
        </div>
      </div>
    </div>
  );
}
