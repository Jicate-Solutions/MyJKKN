import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import ProfilePageContent from './_components/profile-page-content';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';

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

  // Step 4: Fetch learner profile data with all relationships
  const { data: learnerProfile, error: profileError } = await supabase
    .from('learners_profiles')
    .select(`
      *,
      institution:institution_id (
        name,
        id
      ),
      degree:degree_id (
        degree_name,
        display_name,
        id
      ),
      department:department_id (
        department_name,
        id
      ),
      program:program_id (
        program_name,
        id
      ),
      semester:semester_id (
        semester_name,
        semester_code,
        id
      ),
      section:section_id (
        section_name,
        id
      ),
      academic_year:academic_year_id (
        academic_year_name,
        id
      ),
      regulation:regulation_id (
        regulation_name,
        regulation_code,
        id
      ),
      batch:batch_id (
        batch_name,
        batch_code,
        id
      )
    `)
    .eq('id', profile.learner_id)
    .single();

  if (profileError || !learnerProfile) {
    console.error('[my-profile] Error fetching learner profile:', {
      error: profileError,
      learnerId: profile.learner_id,
      userId: user.id,
    });

    return (
      <ContentLayout title="Profile Not Found">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'My Profile' },
          ]}
        />
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Profile Not Found</h2>
          <p className="text-muted-foreground">
            Your learner profile could not be found. Please contact support.
          </p>
          {process.env.NODE_ENV === 'development' && profileError && (
            <div className="mt-4 p-4 bg-destructive/10 rounded-lg text-left max-w-2xl">
              <p className="font-mono text-sm text-destructive">
                <strong>Debug Info:</strong><br />
                Error: {profileError.message}<br />
                Code: {profileError.code}<br />
                Learner ID: {profile.learner_id}
              </p>
            </div>
          )}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="My Profile">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners Management' },
          { label: 'My Profile' },
        ]}
      />

      <div className="space-y-6 mt-6">
        <ProfilePageContent learner={learnerProfile} userId={user.id} />
      </div>
    </ContentLayout>
  );
}
