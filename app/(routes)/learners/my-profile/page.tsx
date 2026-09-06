import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { accommodationLegacyFromCode } from '@/lib/utils/accommodation-type-resolver';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import ProfilePageContent from './_components/profile-page-content';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';

export const metadata = {
  title: 'My Profile',
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

  // Step 3: Lifecycle status validation. Pre-onboarding (induction-only) learners
  // are allowed here so they can complete their profile before onboarding; every
  // other restricted status is still bounced. Spec: specs/pre-onboarding-induction-access-2026-06-29.md
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed && validation.accessTier !== 'induction_only') {
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
        degree_id,
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
        regulation_year,
        regulation_code,
        id
      ),
      batch:batch_id (
        batch_name,
        batch_code,
        id
      ),
      accommodation_ref:accommodation_types!accommodation_type_id (
        code,
        name
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

  // accommodation_type TEXT column is retired — derive the legacy 'HOSTEL'/
  // 'DAY SCHOLAR' value from the FK so the Accommodation card, its conditional
  // sub-fields and calculateProfileCompletion() keep working off
  // learner.accommodation_type.
  const learnerRow = learnerProfile as Record<string, unknown>;
  learnerRow.accommodation_type = accommodationLegacyFromCode(
    (learnerRow.accommodation_ref as { code?: string } | null)?.code,
  );
  delete learnerRow.accommodation_ref;

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
