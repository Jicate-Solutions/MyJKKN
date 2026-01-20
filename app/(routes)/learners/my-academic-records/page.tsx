import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import RecordsList from './_components/records-list';

export const metadata = {
  title: 'My Academic Records | MyJKKN',
  description: 'View and download transcripts, certificates, and achievements',
};

export default async function MyAcademicRecordsPage() {
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
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">My Academic Records</h1>
          <p className="text-muted-foreground">
            View and download your transcripts, certificates, and achievements
          </p>
        </div>

        <RecordsList learnerId={profile.learner_id} />
      </div>
    </div>
  );
}
