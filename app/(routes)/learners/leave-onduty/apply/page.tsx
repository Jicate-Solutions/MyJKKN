'use client';

/**
 * Leave/OnDuty Application Page
 *
 * Allows learners to apply for leave or onduty with:
 * - Timetable-based period selection
 * - File attachment support
 * - Real-time validation
 *
 * @route /learners/leave-onduty/apply
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { ApplicationForm } from '@/components/academic/leave-onduty/application-form';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LeaveOndutyApplyPage() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const [learnerData, setLearnerData] = useState<{
    id: string;
    institutionId: string;
    sectionId: string;
    semesterId: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Permission check - redirect if unauthorized
  // CRITICAL: Wait for both auth AND permissions to finish loading before checking
  useEffect(() => {
    if (!authLoading && !permissionsLoading && !can('learners.leave_onduty.apply')) {
      router.replace('/');
    }
  }, [authLoading, permissionsLoading, can, router]);

  useEffect(() => {
    async function loadLearnerData() {
      try {
        // Permission already checked above, verify user profile exists
        if (!profile || !can('learners.leave_onduty.apply')) {
          return;
        }

        if (!profile?.learner_id) {
          setError('No learner profile found. Please contact administrator.');
          setIsLoading(false);
          return;
        }

        // Fetch learner details
        const { createClientSupabaseClient } = await import('@/lib/supabase/client');
        const supabase = createClientSupabaseClient();

        const { data: learner, error: learnerError } = await supabase
          .from('learners_profiles')
          .select('id, institution_id, section_id, semester_id')
          .eq('id', profile.learner_id)
          .single();

        console.log('[ApplyPage] Learner data fetched:', {
          learner,
          learnerError,
          profileLearnerId: profile.learner_id,
        });

        if (learnerError || !learner) {
          setError('Failed to load learner profile. Please try again.');
          setIsLoading(false);
          return;
        }

        if (!learner.section_id) {
          setError('You are not assigned to any section. Please contact administrator.');
          setIsLoading(false);
          return;
        }

        if (!learner.semester_id) {
          setError('You are not assigned to any semester. Please contact administrator.');
          setIsLoading(false);
          return;
        }

        console.log('[ApplyPage] Setting learner data:', {
          id: learner.id,
          institutionId: learner.institution_id,
          sectionId: learner.section_id,
          semesterId: learner.semester_id,
        });

        setLearnerData({
          id: learner.id,
          institutionId: learner.institution_id,
          sectionId: learner.section_id,
          semesterId: learner.semester_id,
        });
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading learner data:', err);
        setError('An unexpected error occurred. Please try again.');
        setIsLoading(false);
      }
    }

    loadLearnerData();
  }, [profile]);

  const handleSuccess = () => {
    router.push('/learners/leave-onduty/my-applications');
  };

  // Show loading while checking auth or if user is not a student (redirecting)
  if (authLoading || isLoading || (profile && profile.role !== 'student')) {
    return (
      <ContentLayout title="Apply for Leave/OnDuty">
        <div className="space-y-6 max-w-4xl">
          <Skeleton className="h-8 w-64 mb-6" />
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent className="space-y-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Apply for Leave/OnDuty">
        <div className="space-y-6 max-w-4xl">
          <Link href="/learners/leave-onduty/my-applications">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to My Applications
            </Button>
          </Link>

          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  if (!learnerData) {
    return null;
  }

  return (
    <ContentLayout title="Apply for Leave/OnDuty">
      <div className="space-y-4 sm:space-y-6 max-w-9xl">
        {/* Breadcrumb - Hidden on mobile */}
        <Breadcrumb className="hidden md:flex">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/learners">Learners</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/learners/leave-onduty/my-applications">Leave/OnDuty</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Apply</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Back button */}
        <Link href="/learners/leave-onduty/my-applications">
          <Button variant="ghost" size="sm" className="mb-1 -ml-2 sm:ml-0 lg:mt-6">
            <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="text-sm">Back</span>
          </Button>
        </Link>

        <Card className="border-0 sm:border shadow-none sm:shadow-sm">
          <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
            <CardTitle className="text-lg sm:text-xl">Apply for Leave/OnDuty</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Submit your application. All required fields must be filled.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-6">
            <ApplicationForm
              learnerId={learnerData.id}
              institutionId={learnerData.institutionId}
              sectionId={learnerData.sectionId}
              semesterId={learnerData.semesterId}
              onSuccess={handleSuccess}
              onCancel={() => router.push('/learners/leave-onduty/my-applications')}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
