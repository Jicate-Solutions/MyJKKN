import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import ProfileForm from './_components/profile-form';

export const metadata = {
  title: 'My Profile | MyJKKN',
  description: 'Manage your profile and account settings',
};

export default async function MyProfilePage() {
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

  // Step 4: Fetch learner profile data
  const { data: learnerProfile } = await supabase
    .from('learners_profiles')
    .select(`
      *,
      sections:section_id (
        name,
        programs:program_id (
          name,
          degrees:degree_id (
            name,
            institutions:institution_id (
              name
            )
          )
        )
      )
    `)
    .eq('id', profile.learner_id)
    .single();

  if (!learnerProfile) {
    return <div>Profile not found</div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">My Profile</h1>
          <p className="text-muted-foreground">
            View and update your personal information
          </p>
        </div>

        <ProfileForm learnerProfile={learnerProfile} userId={user.id} />
      </div>
    </div>
  );
}
