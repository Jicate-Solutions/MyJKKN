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
import { OUTCOME_TYPE_LABELS, DATA_SOURCE_LABELS } from '@/types/alumni';
import type { OutcomeType, DataSource } from '@/types/alumni';

const OUTCOME_BADGE_COLORS: Record<OutcomeType, string> = {
  employed: 'bg-green-100 text-green-800',
  higher_studies: 'bg-blue-100 text-blue-800',
  entrepreneur: 'bg-purple-100 text-purple-800',
  self_employed: 'bg-amber-100 text-amber-800',
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

  return (
    <ContentLayout title={outcome.name}>
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
              <BreadcrumbPage>{outcome.name}</BreadcrumbPage>
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
                {outcome.verified ? (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <XCircle className="h-3 w-3 mr-1" />
                    Unverified
                  </Badge>
                )}
                <Badge variant="outline">
                  Class of {outcome.graduation_year}
                </Badge>
              </div>
              <h1 className="text-2xl font-bold">{outcome.name}</h1>
              {outcome.program?.program_name && (
                <p className="text-muted-foreground mt-1">
                  {outcome.program.program_name}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {!outcome.verified && (
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
                    {outcome.job_title && (
                      <div>
                        <p className="text-sm text-muted-foreground">Job Title</p>
                        <p className="font-medium">{outcome.job_title}</p>
                      </div>
                    )}
                    {outcome.industry && (
                      <div>
                        <p className="text-sm text-muted-foreground">Industry</p>
                        <p className="font-medium">{outcome.industry}</p>
                      </div>
                    )}
                    {outcome.location && (
                      <div>
                        <p className="text-sm text-muted-foreground">Location</p>
                        <p className="font-medium flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {outcome.location}
                        </p>
                      </div>
                    )}
                    {outcome.salary_range && (
                      <div>
                        <p className="text-sm text-muted-foreground">Salary Range</p>
                        <p className="font-medium">{outcome.salary_range}</p>
                      </div>
                    )}
                    {outcome.is_core_domain !== null && (
                      <div>
                        <p className="text-sm text-muted-foreground">Core Domain</p>
                        <p className="font-medium">
                          {outcome.is_core_domain ? 'Yes - Same field as degree' : 'No - Different field'}
                        </p>
                      </div>
                    )}
                    {outcome.time_to_placement_days !== null && (
                      <div>
                        <p className="text-sm text-muted-foreground">Time to Placement</p>
                        <p className="font-medium">{outcome.time_to_placement_days} days</p>
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
                    {outcome.higher_study_institution && (
                      <div>
                        <p className="text-sm text-muted-foreground">Institution</p>
                        <p className="font-medium">{outcome.higher_study_institution}</p>
                      </div>
                    )}
                    {outcome.higher_study_program && (
                      <div>
                        <p className="text-sm text-muted-foreground">Program</p>
                        <p className="font-medium">{outcome.higher_study_program}</p>
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
                    Startup Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {outcome.startup_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">Startup Name</p>
                        <p className="font-medium">{outcome.startup_name}</p>
                      </div>
                    )}
                    {outcome.startup_industry && (
                      <div>
                        <p className="text-sm text-muted-foreground">Industry</p>
                        <p className="font-medium">{outcome.startup_industry}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Competencies */}
            {outcome.competencies_utilized && outcome.competencies_utilized.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Competencies Utilized</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {outcome.competencies_utilized.map((comp) => (
                      <Badge key={comp} variant="secondary">{comp}</Badge>
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
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Data Source</p>
                  <Badge variant="outline">
                    {DATA_SOURCE_LABELS[outcome.data_source as DataSource] || outcome.data_source}
                  </Badge>
                </div>

                {outcome.linkedin_url && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">LinkedIn</p>
                    <a
                      href={outcome.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 text-sm"
                    >
                      View Profile
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

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
