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

  // Step 4: Fetch learner profile data — flat select only.
  // PostgREST requires FK constraints in the schema cache to resolve embedded join syntax.
  // The 9 FKs from learners_profiles to org tables were dropped to allow JKKN sync
  // upserts (org tables are empty mirrors; referenced UUIDs don't exist locally).
  // Fix: select('*') for the base row, then batch-fetch each related record in parallel.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawProfile, error: profileError } = await (supabase as any)
    .from('learners_profiles')
    .select('*')
    .eq('id', profile.learner_id)
    .single();

  if (profileError || !rawProfile) {
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

  // Step 5: Batch-fetch related org records in parallel using raw FK ID columns.
  // Each lookup is skipped (null) when the FK ID is absent (pre-enrollment learners).
  const institutionId = rawProfile.institution_id as string | null;
  const degreeId = rawProfile.degree_id as string | null;
  const departmentId = rawProfile.department_id as string | null;
  const programId = rawProfile.program_id as string | null;
  const semesterId = rawProfile.semester_id as string | null;
  const sectionId = rawProfile.section_id as string | null;
  const academicYearId = rawProfile.academic_year_id as string | null;
  const regulationId = rawProfile.regulation_id as string | null;
  const batchId = rawProfile.batch_id as string | null;

  const [
    { data: instRow },
    { data: degreeRow },
    { data: deptRow },
    { data: progRow },
    { data: semRow },
    { data: sectRow },
    { data: ayRow },
    { data: regRow },
    { data: batchRow },
  ] = await Promise.all([
    institutionId
      ? supabase.from('institutions').select('id, name').eq('id', institutionId).single()
      : Promise.resolve({ data: null, error: null }),
    degreeId
      ? supabase.from('degrees').select('id, degree_name').eq('id', degreeId).single()
      : Promise.resolve({ data: null, error: null }),
    departmentId
      ? supabase.from('departments').select('id, department_name').eq('id', departmentId).single()
      : Promise.resolve({ data: null, error: null }),
    programId
      ? supabase.from('programs').select('id, program_name').eq('id', programId).single()
      : Promise.resolve({ data: null, error: null }),
    semesterId
      ? supabase.from('semesters').select('id, semester_name, semester_code').eq('id', semesterId).single()
      : Promise.resolve({ data: null, error: null }),
    sectionId
      ? supabase.from('sections').select('id, section_name').eq('id', sectionId).single()
      : Promise.resolve({ data: null, error: null }),
    academicYearId
      ? supabase.from('academic_years').select('id, academic_year_name').eq('id', academicYearId).single()
      : Promise.resolve({ data: null, error: null }),
    regulationId
      ? supabase.from('regulations').select('id, regulation_year, regulation_code').eq('id', regulationId).single()
      : Promise.resolve({ data: null, error: null }),
    batchId
      ? supabase.from('batches').select('id, batch_name, batch_code').eq('id', batchId).single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  // Compose final profile object matching the LearnerProfile shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const learnerProfile = {
    ...rawProfile,
    institution: instRow ?? undefined,
    degree: degreeRow ?? undefined,
    department: deptRow ?? undefined,
    program: progRow ?? undefined,
    semester: semRow ?? undefined,
    section: sectRow ?? undefined,
    academic_year: ayRow ?? undefined,
    regulation: regRow ?? undefined,
    batch: batchRow ?? undefined,
  };

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
