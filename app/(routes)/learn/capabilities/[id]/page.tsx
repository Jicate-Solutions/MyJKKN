'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  useCapabilityDetail,
  useLearnerCapabilityStatus,
  useCapabilityLessons,
  useStartCapability,
} from '@/hooks/pde/use-pde';
import { useAuth } from '@/hooks/use-auth';
import {
  ArrowLeft,
  Lock,
  Circle,
  Clock,
  CheckCircle2,
  Star,
  BookOpen,
  Play,
  FileCheck,
  ChevronRight,
  TreePine,
  GraduationCap,
  Loader2,
  ExternalLink,
  Award,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  PDECapability,
  PDELearnerCapability,
  CapabilityStatus,
  FinksDimension,
} from '@/types/pde';

// ============================================
// Constants
// ============================================

const STATUS_CONFIG: Record<CapabilityStatus, { label: string; icon: typeof Lock; color: string; bgColor: string; description: string }> = {
  locked: {
    label: 'Locked',
    icon: Lock,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    description: 'Complete prerequisites to unlock this capability.',
  },
  available: {
    label: 'Available',
    icon: Circle,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    description: 'Prerequisites met. Start learning anytime.',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    color: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    description: 'You are currently developing this capability.',
  },
  demonstrated: {
    label: 'Demonstrated',
    icon: CheckCircle2,
    color: 'text-[#0b6d41]',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/20',
    description: 'You have demonstrated this capability through evidence.',
  },
  mastered: {
    label: 'Mastered',
    icon: Star,
    color: 'text-[#ffde59]',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    description: 'Demonstrated and applied successfully in a quest.',
  },
};

const FINKS_LABELS: Record<string, string> = {
  foundational_knowledge: 'Foundational Knowledge',
  application: 'Application',
  integration: 'Integration',
  human_dimension: 'Human Dimension',
  caring: 'Caring',
  learning_how_to_learn: 'Learning How to Learn',
};

const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: 'Foundation -- Awareness and basic understanding',
  2: 'Developing -- Can apply with guidance',
  3: 'Proficient -- Independent application',
  4: 'Advanced -- Can teach and adapt to new contexts',
  5: 'Expert -- Creates novel applications and mentors others',
};

// ============================================
// Types
// ============================================

interface PrerequisiteCapability {
  id: string;
  name: string;
  level: number;
  status?: CapabilityStatus;
}

interface LinkedLesson {
  id: string;
  title: string;
  course_id?: string;
  duration_minutes?: number;
  order_index?: number;
}

interface EvidenceItem {
  type: string;
  url: string;
  description: string;
  submitted_at: string;
}

interface RubricCriterion {
  criterion: string;
  description: string;
  weight?: number;
}

// ============================================
// Lesson List Component
// ============================================

function LessonList({
  lessons,
  isLoading,
}: {
  lessons: LinkedLesson[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24 mt-1" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-3">
        No linked lessons yet. This capability may require self-directed learning.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {lessons.map((lesson, idx) => (
        <Link
          key={lesson.id}
          href={lesson.course_id ? `/vac/${lesson.course_id}/${lesson.id}` : '#'}
          className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-[#0b6d41]/10 flex items-center justify-center shrink-0">
            <BookOpen className="h-4 w-4 text-[#0b6d41]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate group-hover:text-[#0b6d41] transition-colors">
              {lesson.title}
            </p>
            {lesson.duration_minutes && (
              <p className="text-xs text-muted-foreground">
                ~{lesson.duration_minutes} min
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-[#0b6d41] transition-colors shrink-0" />
        </Link>
      ))}
    </div>
  );
}

// ============================================
// Main Page
// ============================================

export default function CapabilityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: capabilityId } = use(params);
  const router = useRouter();
  const { profile: user } = useAuth();

  const { data: capability, isLoading: capLoading } = useCapabilityDetail(capabilityId);
  const { data: learnerCap, isLoading: statusLoading } = useLearnerCapabilityStatus(user?.id, capabilityId);
  const { data: lessons, isLoading: lessonsLoading } = useCapabilityLessons(capabilityId);
  const startCapability = useStartCapability();

  const isLoading = capLoading;
  const currentStatus: CapabilityStatus = learnerCap?.status || 'locked';
  const statusConfig = STATUS_CONFIG[currentStatus];
  const StatusIcon = statusConfig.icon;

  const prerequisites = (capability?.prerequisite_ids || []) as string[];
  const evidenceTypes = (capability?.evidence_types || []) as string[];
  const rubric = (capability?.demonstration_rubric || []) as RubricCriterion[];
  const demonstrationEvidence = (learnerCap?.demonstration_evidence || []) as EvidenceItem[];

  const handleStartLearning = async () => {
    if (!user?.id || !capabilityId) return;
    await startCapability.mutateAsync({
      learnerId: user.id,
      capabilityId,
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title="Capability">
        <div className="max-w-3xl mx-auto space-y-6 mt-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
        </div>
      </ContentLayout>
    );
  }

  // Not found
  if (!capability) {
    return (
      <ContentLayout title="Capability Not Found">
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <TreePine className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium mb-2">Capability not found</h2>
          <p className="text-sm text-muted-foreground mb-4">
            This capability may not exist or is not available.
          </p>
          <Button variant="outline" onClick={() => router.push('/learn/capabilities')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Capability Tree
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={capability.name}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Capability Tree', href: '/learn/capabilities' },
          { label: capability.name },
        ]}
      />

      <div className="max-w-3xl mx-auto mt-6 space-y-6">
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2"
          onClick={() => router.push('/learn/capabilities')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Capability Tree
        </Button>

        {/* Header with status */}
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="outline" className="text-xs capitalize">
              {capability.category.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Level {capability.level} -- {LEVEL_DESCRIPTIONS[capability.level]?.split(' -- ')[0] || ''}
            </Badge>
            {capability.finks_dimension && (
              <Badge variant="secondary" className="text-xs">
                {FINKS_LABELS[capability.finks_dimension] || capability.finks_dimension}
              </Badge>
            )}
            {capability.is_core && (
              <Badge className="bg-[#0b6d41]/10 text-[#0b6d41] border-[#0b6d41]/20 text-xs">
                Core
              </Badge>
            )}
          </div>

          <h1 className="text-2xl font-bold tracking-tight">{capability.name}</h1>

          {capability.estimated_hours && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              ~{capability.estimated_hours} hours to develop
            </p>
          )}
        </div>

        {/* Status card */}
        <Card className={cn('border-l-4', {
          'border-l-muted-foreground': currentStatus === 'locked',
          'border-l-blue-500': currentStatus === 'available',
          'border-l-amber-500': currentStatus === 'in_progress',
          'border-l-[#0b6d41]': currentStatus === 'demonstrated',
          'border-l-[#ffde59]': currentStatus === 'mastered',
        })}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusIcon className={cn('h-5 w-5', statusConfig.color)} />
                <div>
                  <p className="text-sm font-medium">{statusConfig.label}</p>
                  <p className="text-xs text-muted-foreground">{statusConfig.description}</p>
                </div>
              </div>

              {/* Action button based on status */}
              {currentStatus === 'available' && (
                <Button
                  className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
                  size="sm"
                  onClick={handleStartLearning}
                  disabled={startCapability.isPending}
                >
                  {startCapability.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Start Learning
                </Button>
              )}
              {currentStatus === 'in_progress' && (
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600"
                  onClick={() => {
                    alert('Demonstration feature coming soon. For now, contact your Senior Learner to verify your capability.');
                  }}
                >
                  <FileCheck className="h-4 w-4 mr-2" />
                  Demonstrate
                </Button>
              )}
              {(currentStatus === 'demonstrated' || currentStatus === 'mastered') && (
                <div className="flex items-center gap-1 text-sm font-medium text-[#0b6d41]">
                  <Award className="h-4 w-4" />
                  {learnerCap?.demonstration_score && `${learnerCap.demonstration_score}%`}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About This Capability</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {capability.description}
            </p>

            {/* Level description */}
            {LEVEL_DESCRIPTIONS[capability.level] && (
              <>
                <Separator className="my-4" />
                <div>
                  <h4 className="text-sm font-medium mb-1">
                    Level {capability.level} Expectation
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {LEVEL_DESCRIPTIONS[capability.level]}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Prerequisites */}
        {prerequisites.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prerequisites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {prerequisites.map((prereqId) => (
                  <Link
                    key={prereqId}
                    href={`/learn/capabilities/${prereqId}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
                  >
                    <CheckCircle2 className="h-4 w-4 text-[#0b6d41] shrink-0" />
                    <span className="text-sm group-hover:text-[#0b6d41] transition-colors flex-1">
                      Prerequisite capability
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Linked Lessons (micro-content) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Learning Resources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LessonList
              lessons={lessons || []}
              isLoading={lessonsLoading}
            />
          </CardContent>
        </Card>

        {/* Demonstration rubric */}
        {rubric.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                Demonstration Rubric
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                To demonstrate this capability, provide evidence evaluated against these criteria:
              </p>
              <div className="space-y-3">
                {rubric.map((item, idx) => (
                  <div key={idx} className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{item.criterion}</span>
                      {item.weight && (
                        <Badge variant="secondary" className="text-xs">
                          {item.weight}%
                        </Badge>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                ))}
              </div>

              {evidenceTypes.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <h4 className="text-sm font-medium mb-2">Accepted Evidence Types</h4>
                    <div className="flex flex-wrap gap-2">
                      {evidenceTypes.map((type) => (
                        <Badge key={type} variant="outline" className="text-xs capitalize">
                          {type.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Evidence (if demonstrated) */}
        {demonstrationEvidence.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-[#0b6d41]" />
                My Evidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {demonstrationEvidence.map((evidence, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-emerald-50/50 dark:bg-emerald-950/10 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-[#0b6d41] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">{evidence.type}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{evidence.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Submitted {new Date(evidence.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                    {evidence.url && (
                      <a
                        href={evidence.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#0b6d41] hover:underline flex items-center gap-1 shrink-0"
                      >
                        View
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bottom action bar */}
        {(currentStatus === 'available' || currentStatus === 'in_progress') && (
          <div className="sticky bottom-4 z-10">
            <Card className="p-4 shadow-lg border-border/80 bg-background/95 backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  {currentStatus === 'available'
                    ? 'Ready to start developing this capability'
                    : 'Continue working on this capability'}
                </div>

                {currentStatus === 'available' ? (
                  <Button
                    className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
                    onClick={handleStartLearning}
                    disabled={startCapability.isPending}
                  >
                    {startCapability.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Start Learning
                  </Button>
                ) : (
                  <Button className="bg-amber-500 hover:bg-amber-600">
                    <FileCheck className="h-4 w-4 mr-2" />
                    Demonstrate This Capability
                  </Button>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
