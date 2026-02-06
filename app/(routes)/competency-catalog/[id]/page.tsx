'use client';

// ============================================================================
// Competency Catalog - Detail View
// Shows full competency details with mappings and learner stats
// ============================================================================

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Pencil,
  Archive,
  RotateCcw,
  BookOpen,
  GraduationCap,
  Award,
  Clock,
  Calendar,
  Tag,
  Target,
  Users,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';

// UI Components
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { PermissionGuard } from '@/components/auth/permission-guard';

// Components
import { FinksRadarChart } from '../_components/finks-radar-chart';

// Hooks
import { useCompetency, useArchiveCompetency, useRestoreCompetency } from '@/hooks/competency';
import { toast } from 'sonner';

// Types
import type { CompetencyType, ProficiencyLevel } from '@/types/competency';

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_BADGES: Record<CompetencyType, { label: string; color: string }> = {
  technical: { label: 'Technical', color: 'bg-blue-100 text-blue-800' },
  behavioral: { label: 'Behavioral', color: 'bg-purple-100 text-purple-800' },
  domain: { label: 'Domain', color: 'bg-amber-100 text-amber-800' },
  soft_skill: { label: 'Soft Skill', color: 'bg-emerald-100 text-emerald-800' },
  metacognitive: { label: 'Metacognitive', color: 'bg-pink-100 text-pink-800' }
};

const LEVEL_COLORS: Record<ProficiencyLevel, string> = {
  novice: 'bg-slate-100 text-slate-700',
  beginner: 'bg-blue-100 text-blue-700',
  intermediate: 'bg-amber-100 text-amber-700',
  advanced: 'bg-emerald-100 text-emerald-700',
  expert: 'bg-purple-100 text-purple-700'
};

const CONTRIBUTION_COLORS: Record<string, string> = {
  minor: 'bg-slate-100 text-slate-700',
  moderate: 'bg-blue-100 text-blue-700',
  major: 'bg-amber-100 text-amber-700',
  primary: 'bg-emerald-100 text-emerald-700'
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function CompetencyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: competency, isLoading, error } = useCompetency(id);
  const archiveMutation = useArchiveCompetency();
  const restoreMutation = useRestoreCompetency();

  const handleArchive = async () => {
    try {
      await archiveMutation.mutateAsync(id);
      toast.success('Competency archived');
    } catch (err) {
      toast.error('Failed to archive competency');
    }
  };

  const handleRestore = async () => {
    try {
      await restoreMutation.mutateAsync(id);
      toast.success('Competency restored');
    } catch (err) {
      toast.error('Failed to restore competency');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title="Competency Details">
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
  if (error || !competency) {
    return (
      <ContentLayout title="Competency Details">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Competency Not Found</h2>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'The competency you are looking for does not exist.'}
            </p>
            <Button onClick={() => router.push('/competency-catalog')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Catalog
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard module="competency.catalog" action="view">
      <ContentLayout title={competency.competency_name}>
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/academic">Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/competency-catalog">Competency Catalog</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{competency.competency_code}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <Button variant="ghost" size="icon" asChild>
                <Link href="/competency-catalog">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={TYPE_BADGES[competency.competency_type].color}>
                    {TYPE_BADGES[competency.competency_type].label}
                  </Badge>
                  {competency.is_active ? (
                    <Badge className="bg-emerald-100 text-emerald-800">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Archived</Badge>
                  )}
                  <Badge variant="outline" className="font-mono">
                    {competency.competency_code}
                  </Badge>
                </div>
                <h1 className="text-2xl font-bold">{competency.competency_name}</h1>
                {competency.description && (
                  <p className="text-muted-foreground mt-1 max-w-2xl">
                    {competency.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href={`/competency-catalog/${id}/edit`}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Link>
              </Button>
              {competency.is_active ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">
                      <Archive className="h-4 w-4 mr-2" />
                      Archive
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive Competency</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to archive this competency? It will be hidden
                        from selection lists but existing learner progress will be preserved.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button variant="outline" onClick={handleRestore}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore
                </Button>
              )}
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Proficiency Levels */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Proficiency Levels
                  </CardTitle>
                  <CardDescription>
                    Progression levels and mastery criteria
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {competency.proficiency_levels && competency.proficiency_levels.length > 0 ? (
                    <div className="space-y-4">
                      {competency.proficiency_levels.map((levelDef, index) => (
                        <div
                          key={levelDef.level}
                          className="p-4 border rounded-lg space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <Badge className={LEVEL_COLORS[levelDef.level]}>
                              {levelDef.level.charAt(0).toUpperCase() + levelDef.level.slice(1)}
                            </Badge>
                            {levelDef.typical_duration_hours && (
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                ~{levelDef.typical_duration_hours} hours
                              </span>
                            )}
                          </div>
                          <p className="text-sm">{levelDef.description}</p>
                          {levelDef.criteria && levelDef.criteria.length > 0 && (
                            <div className="pl-4 border-l-2 border-muted">
                              <p className="text-xs text-muted-foreground mb-1">Success Criteria:</p>
                              <ul className="text-sm space-y-1">
                                {levelDef.criteria.map((criterion, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-primary mt-1">•</span>
                                    {criterion}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      No proficiency levels defined
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Program Mappings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Program Mappings
                  </CardTitle>
                  <CardDescription>
                    Programs that require this competency
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {competency.program_mappings && competency.program_mappings.length > 0 ? (
                    <div className="space-y-3">
                      {competency.program_mappings.map((mapping) => (
                        <div
                          key={mapping.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <p className="font-medium">
                              {mapping.program?.name || 'Unknown Program'}
                            </p>
                            {mapping.semester_expected && (
                              <p className="text-sm text-muted-foreground">
                                Expected by semester
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={LEVEL_COLORS[mapping.required_level]}>
                              {mapping.required_level}
                            </Badge>
                            {mapping.is_mandatory && (
                              <Badge variant="outline">Required</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      Not mapped to any programs yet
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Course Mappings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Course Mappings
                  </CardTitle>
                  <CardDescription>
                    Courses that contribute to this competency
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {competency.course_mappings && competency.course_mappings.length > 0 ? (
                    <div className="space-y-3">
                      {competency.course_mappings.map((mapping) => (
                        <div
                          key={mapping.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <p className="font-medium">
                              {mapping.course?.name || 'Unknown Course'}
                            </p>
                            <p className="text-sm text-muted-foreground font-mono">
                              {mapping.course?.code}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {mapping.contribution_level && (
                              <Badge className={LEVEL_COLORS[mapping.contribution_level]}>
                                {mapping.contribution_level}
                              </Badge>
                            )}
                            {mapping.learning_hours && (
                              <span className="text-sm text-muted-foreground">
                                {mapping.learning_hours}h
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      Not mapped to any courses yet
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Fink's Taxonomy Radar Chart */}
              {competency.finks_dimensions && (
                <FinksRadarChart
                  currentDimensions={competency.finks_dimensions}
                  title="AI-Era Competency Profile"
                  description="Measuring human differentiation across Fink's 6 dimensions"
                  showLegend={false}
                  highlightAiProof={true}
                  size="md"
                />
              )}

              {/* Details Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Industry Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {competency.industry_tags && competency.industry_tags.length > 0 ? (
                        competency.industry_tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" />
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">No tags</span>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="text-sm space-y-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Created: {format(new Date(competency.created_at), 'PPP')}
                    </div>
                    {competency.updated_at !== competency.created_at && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        Updated: {format(new Date(competency.updated_at), 'PPP')}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Learner Stats Placeholder */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Learner Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Learner statistics will be available once learners are assessed on this competency.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
