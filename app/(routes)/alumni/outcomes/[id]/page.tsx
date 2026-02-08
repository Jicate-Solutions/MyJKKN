'use client';

// ============================================================================
// Alumni Outcome Detail
// View full details of an individual alumni outcome
// Phase P4.1 - Accountability
// ============================================================================

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Briefcase,
  GraduationCap,
  Lightbulb,
  MapPin,
  Calendar,
  ExternalLink,
  AlertCircle,
  Shield
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAlumniOutcome, useDeleteAlumniOutcome, useVerifyAlumniOutcome } from '@/hooks/alumni';
import { useAuth } from '@/hooks/use-auth';
import {
  OUTCOME_TYPE_LABELS,
  DATA_SOURCE_LABELS,
  SALARY_RANGE_LABELS,
  VERIFICATION_STATUS_LABELS
} from '@/types/alumni';
import type { OutcomeType, DataSource, SalaryRange, VerificationStatus } from '@/types/alumni';

const OUTCOME_BADGE_COLORS: Record<OutcomeType, string> = {
  employed: 'bg-green-100 text-green-800',
  self_employed: 'bg-amber-100 text-amber-800',
  higher_studies: 'bg-blue-100 text-blue-800',
  entrepreneur: 'bg-purple-100 text-purple-800',
  competitive_exams: 'bg-cyan-100 text-cyan-800',
  family_business: 'bg-orange-100 text-orange-800',
  gap_year: 'bg-slate-100 text-slate-800',
  seeking: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800'
};

export default function AlumniOutcomeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { profile } = useAuth();

  const { data: outcome, isLoading, error } = useAlumniOutcome(id);
  const deleteMutation = useDeleteAlumniOutcome();
  const verifyMutation = useVerifyAlumniOutcome();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Outcome deleted');
      router.push('/alumni/outcomes');
    } catch (err) {
      toast.error('Failed to delete outcome');
    }
  };

  const handleVerify = async () => {
    if (!profile?.id) return;
    try {
      await verifyMutation.mutateAsync({ id, verifiedBy: profile.id });
      toast.success('Outcome verified');
    } catch (err) {
      toast.error('Failed to verify outcome');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title="Outcome Details">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // Error state
  if (error || !outcome) {
    return (
      <ContentLayout title="Outcome Details">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Outcome Not Found</h2>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'The outcome record does not exist.'}
            </p>
            <Button onClick={() => router.push('/alumni/outcomes')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Outcomes
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const displayName = outcome.learner
    ? `${outcome.learner.first_name} ${outcome.learner.last_name}`
    : 'Unknown Alumni';
  const isVerified = outcome.verification_status !== 'pending'
    && outcome.verification_status !== 'rejected';
  const locationParts = [outcome.city, outcome.state, outcome.country].filter(Boolean);
  const locationStr = locationParts.join(', ');

  return (
    <ContentLayout title={displayName}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/alumni">Alumni</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/alumni/outcomes">Outcomes</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{displayName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/alumni/outcomes">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className={OUTCOME_BADGE_COLORS[outcome.outcome_type as OutcomeType] || 'bg-gray-100'}>
                  {OUTCOME_TYPE_LABELS[outcome.outcome_type as OutcomeType] || outcome.outcome_type}
                </Badge>
                {isVerified ? (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {VERIFICATION_STATUS_LABELS[outcome.verification_status as VerificationStatus] || 'Verified'}
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <XCircle className="h-3 w-3 mr-1" />
                    {VERIFICATION_STATUS_LABELS[outcome.verification_status as VerificationStatus] || 'Pending'}
                  </Badge>
                )}
                <Badge variant="outline">
                  Class of {outcome.graduation_year}
                </Badge>
              </div>
              <h1 className="text-2xl font-bold">{displayName}</h1>
              {outcome.program?.program_name && (
                <p className="text-muted-foreground mt-1">
                  {outcome.program.program_name}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {!isVerified && (
              <Button variant="outline" onClick={handleVerify} disabled={verifyMutation.isPending}>
                <Shield className="h-4 w-4 mr-2" />
                Verify
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Outcome</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this alumni outcome record? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Employment/Outcome Details */}
            {(outcome.outcome_type === 'employed' || outcome.outcome_type === 'self_employed') && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Employment Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {outcome.company_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">Company</p>
                        <p className="font-medium">{outcome.company_name}</p>
                      </div>
                    )}
                    {outcome.designation && (
                      <div>
                        <p className="text-sm text-muted-foreground">Designation</p>
                        <p className="font-medium">{outcome.designation}</p>
                      </div>
                    )}
                    {outcome.industry_sector && (
                      <div>
                        <p className="text-sm text-muted-foreground">Industry</p>
                        <p className="font-medium">{outcome.industry_sector}</p>
                      </div>
                    )}
                    {outcome.job_function && (
                      <div>
                        <p className="text-sm text-muted-foreground">Job Function</p>
                        <p className="font-medium">{outcome.job_function}</p>
                      </div>
                    )}
                    {locationStr && (
                      <div>
                        <p className="text-sm text-muted-foreground">Location</p>
                        <p className="font-medium flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {locationStr}
                        </p>
                      </div>
                    )}
                    {outcome.salary_range && (
                      <div>
                        <p className="text-sm text-muted-foreground">Salary Range</p>
                        <p className="font-medium">
                          {SALARY_RANGE_LABELS[outcome.salary_range as SalaryRange] || outcome.salary_range}
                        </p>
                      </div>
                    )}
                    {outcome.is_relevant_to_program !== null && (
                      <div>
                        <p className="text-sm text-muted-foreground">Relevant to Program</p>
                        <p className="font-medium">
                          {outcome.is_relevant_to_program ? 'Yes - Same field as degree' : 'No - Different field'}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Higher Studies Details */}
            {outcome.outcome_type === 'higher_studies' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Higher Studies Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {outcome.institution_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">Institution</p>
                        <p className="font-medium">{outcome.institution_name}</p>
                      </div>
                    )}
                    {outcome.course_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">Course</p>
                        <p className="font-medium">{outcome.course_name}</p>
                      </div>
                    )}
                    {outcome.specialization && (
                      <div>
                        <p className="text-sm text-muted-foreground">Specialization</p>
                        <p className="font-medium">{outcome.specialization}</p>
                      </div>
                    )}
                    {outcome.is_scholarship !== null && outcome.is_scholarship && (
                      <div>
                        <p className="text-sm text-muted-foreground">Scholarship</p>
                        <p className="font-medium">{outcome.scholarship_details || 'Yes'}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Entrepreneur Details */}
            {outcome.outcome_type === 'entrepreneur' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    Business Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {outcome.business_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">Business Name</p>
                        <p className="font-medium">{outcome.business_name}</p>
                      </div>
                    )}
                    {outcome.business_sector && (
                      <div>
                        <p className="text-sm text-muted-foreground">Sector</p>
                        <p className="font-medium">{outcome.business_sector}</p>
                      </div>
                    )}
                    {outcome.business_type && (
                      <div>
                        <p className="text-sm text-muted-foreground">Type</p>
                        <p className="font-medium">{outcome.business_type}</p>
                      </div>
                    )}
                    {outcome.employee_count !== null && (
                      <div>
                        <p className="text-sm text-muted-foreground">Employees</p>
                        <p className="font-medium">{outcome.employee_count}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Skills Used */}
            {outcome.skills_used && outcome.skills_used.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Skills Used</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {outcome.skills_used.map((skill) => (
                      <Badge key={skill} variant="secondary">{skill}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Feedback */}
            {outcome.feedback && (
              <Card>
                <CardHeader>
                  <CardTitle>Feedback</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{outcome.feedback}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Satisfaction */}
            {outcome.satisfaction_score !== null && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Satisfaction Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <span className="text-4xl font-bold">{outcome.satisfaction_score}</span>
                    <span className="text-xl text-muted-foreground">/10</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Meta Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {outcome.data_source && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Data Source</p>
                    <Badge variant="outline">
                      {DATA_SOURCE_LABELS[outcome.data_source as DataSource] || outcome.data_source}
                    </Badge>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Verification</p>
                  <Badge variant="outline">
                    {VERIFICATION_STATUS_LABELS[outcome.verification_status as VerificationStatus] || outcome.verification_status}
                  </Badge>
                </div>

                <Separator />

                <div className="text-sm space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Created: {format(new Date(outcome.created_at), 'PPP')}
                  </div>
                  {outcome.verified_at && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4" />
                      Verified: {format(new Date(outcome.verified_at), 'PPP')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
