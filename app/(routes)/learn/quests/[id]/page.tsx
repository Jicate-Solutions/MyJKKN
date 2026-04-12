'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  useQuestDetail,
  useQuestEnrollments,
  useLearnerQuestSubmissions,
  useEnrollInQuest,
} from '@/hooks/pde/use-pde';
import { useAuth } from '@/hooks/use-auth';
import {
  ArrowLeft,
  Trophy,
  Clock,
  Users,
  Target,
  Star,
  Sparkles,
  Lock,
  Unlock,
  CheckCircle2,
  Send,
  Play,
  FileText,
  CalendarDays,
  Building2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PDEQuest, QuestType, QuestDifficulty } from '@/types/pde';

// ============================================
// Constants
// ============================================

const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  solo: 'Solo Quest',
  team: 'Team Quest',
  cross_dept: 'Cross-Department Quest',
  community: 'Community Quest',
  industry: 'Industry Quest',
};

const DIFFICULTY_COLORS: Record<QuestDifficulty, string> = {
  beginner: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  advanced: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  expert: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
};

// ============================================
// Types
// ============================================

interface RubricItem {
  criterion: string;
  weight: number;
  description?: string;
}

interface RequiredCapability {
  capability_id: string;
  min_level: number;
  name?: string;
}

interface QuestBadge {
  name: string;
  icon?: string;
}

interface QuestSubmission {
  id: string;
  submission_type: 'milestone' | 'final';
  title: string;
  description?: string;
  final_score?: number;
  passed?: boolean;
  created_at: string;
  learner_name?: string;
}

interface QuestEnrollment {
  id: string;
  learner_id: string;
  learner_name?: string;
  role?: string;
  status: string;
  started_at: string;
}

// ============================================
// Main Page
// ============================================

export default function QuestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: questId } = use(params);
  const router = useRouter();
  const { profile: user } = useAuth();

  const { data: quest, isLoading } = useQuestDetail(questId);
  const { data: enrollments } = useQuestEnrollments(questId);
  const { data: submissions } = useLearnerQuestSubmissions(user?.id, questId);
  const enrollInQuest = useEnrollInQuest();

  const [isEnrolling, setIsEnrolling] = useState(false);

  const requiredCaps = (quest?.required_capabilities || []) as RequiredCapability[];
  const rubric = (quest?.deliverable_rubric || []) as RubricItem[];
  const rawBadges = quest?.badges || [];
  const badges: QuestBadge[] = rawBadges.map((b) =>
    typeof b === 'string' ? { name: b } : (b as unknown as QuestBadge)
  );

  const myEnrollment = enrollments?.find(
    (e: QuestEnrollment) => e.learner_id === user?.id
  );
  const isEnrolled = !!myEnrollment;
  const teamMembers = enrollments?.filter(
    (e: QuestEnrollment) => e.status === 'active'
  ) || [];

  const handleEnroll = async () => {
    if (!user?.id || !questId) return;
    setIsEnrolling(true);
    try {
      await enrollInQuest.mutateAsync({ questId, learnerId: user.id });
    } finally {
      setIsEnrolling(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title="Quest">
        <div className="max-w-4xl mx-auto space-y-6 mt-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-40" />
        </div>
      </ContentLayout>
    );
  }

  // Not found
  if (!quest) {
    return (
      <ContentLayout title="Quest Not Found">
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Target className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium mb-2">Quest not found</h2>
          <p className="text-sm text-muted-foreground mb-4">
            This quest may have been archived or does not exist.
          </p>
          <Button variant="outline" onClick={() => router.push('/learn/quests')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Quest Board
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const diffColor = quest.difficulty ? DIFFICULTY_COLORS[quest.difficulty] : '';

  return (
    <ContentLayout title={quest.title}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Quest Board', href: '/learn/quests' },
          { label: quest.title },
        ]}
      />

      <div className="max-w-4xl mx-auto mt-6 space-y-6">
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2"
          onClick={() => router.push('/learn/quests')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Quest Board
        </Button>

        {/* Quest Header */}
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {QUEST_TYPE_LABELS[quest.quest_type] || quest.quest_type}
            </Badge>
            {quest.difficulty && (
              <Badge variant="outline" className={cn('text-xs', diffColor)}>
                {quest.difficulty.charAt(0).toUpperCase() + quest.difficulty.slice(1)}
              </Badge>
            )}
            {quest.solutions_hub_eligible && (
              <Badge className="bg-[#0b6d41]/10 text-[#0b6d41] border-[#0b6d41]/20 text-xs">
                <Star className="h-3 w-3 mr-1" />
                Solutions Hub
              </Badge>
            )}
            {quest.nif_eligible && (
              <Badge className="bg-[#ffde59]/20 text-amber-800 dark:text-amber-300 border-amber-300/30 text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                NIF Eligible
              </Badge>
            )}
          </div>

          <h1 className="text-2xl font-bold tracking-tight">{quest.title}</h1>

          {quest.source_type && (
            <p className="text-sm text-muted-foreground mt-1">
              Source: {quest.source_type.replace(/_/g, ' ')}{' '}
              {quest.source_department && `(${quest.source_department})`}
            </p>
          )}
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4 text-[#0b6d41]" />
              <div>
                <p className="text-muted-foreground text-xs">Reputation</p>
                <p className="font-semibold">{quest.reputation_points} pts</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-muted-foreground text-xs">Estimated</p>
                <p className="font-semibold">{quest.estimated_hours ? `${quest.estimated_hours}h` : 'Varies'}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-muted-foreground text-xs">
                  {quest.quest_type === 'team' ? 'Team Size' : 'Enrolled'}
                </p>
                <p className="font-semibold">
                  {quest.quest_type === 'team'
                    ? `Up to ${quest.max_team_size}`
                    : `${teamMembers.length}`
                  }
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-muted-foreground text-xs">Status</p>
                <p className="font-semibold capitalize">{quest.status}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabbed content */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="team">
              Team ({teamMembers.length})
            </TabsTrigger>
            <TabsTrigger value="submissions">
              Submissions ({submissions?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Problem Statement</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {quest.problem_statement}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Expected Deliverable</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {quest.deliverable_description}
                </p>

                {rubric.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-3">Evaluation Rubric</h4>
                      <div className="space-y-2">
                        {rubric.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-3 text-sm">
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <span className="font-medium">{item.criterion}</span>
                              <Badge variant="secondary" className="text-xs">
                                {item.weight}%
                              </Badge>
                            </div>
                            {item.description && (
                              <p className="text-muted-foreground">{item.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {badges.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Badges Earned on Completion</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {badges.map((badge, idx) => (
                      <Badge
                        key={idx}
                        className="bg-[#ffde59]/20 text-amber-800 dark:text-amber-300 border-amber-300/30"
                      >
                        {badge.icon && <span className="mr-1">{badge.icon}</span>}
                        {badge.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Requirements */}
          <TabsContent value="requirements" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Required Capabilities</CardTitle>
              </CardHeader>
              <CardContent>
                {requiredCaps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No specific capability prerequisites. This quest is open to all Learners.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {requiredCaps.map((cap, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#0b6d41]/10 flex items-center justify-center">
                            <Unlock className="h-4 w-4 text-[#0b6d41]" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {cap.name || `Capability ${idx + 1}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Minimum Level {cap.min_level}
                            </p>
                          </div>
                        </div>
                        <Link
                          href={`/learn/capabilities/${cap.capability_id}`}
                          className="text-xs text-[#0b6d41] hover:underline"
                        >
                          View in Tree
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {quest.description && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Additional Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {quest.description}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Team */}
          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {quest.quest_type === 'team' ? 'Team Members' : 'Enrolled Learners'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No one has started this quest yet. Be the first!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {teamMembers.map((member: QuestEnrollment) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                            {(member.learner_name || 'L').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {member.learner_name || 'Learner'}
                            </p>
                            {member.role && (
                              <p className="text-xs text-muted-foreground capitalize">
                                {member.role}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs capitalize">
                          {member.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Submissions */}
          <TabsContent value="submissions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">My Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                {!submissions || submissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {isEnrolled
                      ? 'No submissions yet. Start building and submit your work!'
                      : 'Enroll in this quest to start submitting work.'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {submissions.map((sub: QuestSubmission) => (
                      <div
                        key={sub.id}
                        className="flex items-start justify-between p-3 bg-muted/30 rounded-lg"
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center mt-0.5',
                            sub.submission_type === 'final'
                              ? 'bg-[#0b6d41]/10'
                              : 'bg-blue-100 dark:bg-blue-950/30'
                          )}>
                            {sub.submission_type === 'final' ? (
                              <Send className="h-4 w-4 text-[#0b6d41]" />
                            ) : (
                              <FileText className="h-4 w-4 text-blue-600" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{sub.title}</p>
                            {sub.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {sub.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {new Date(sub.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              sub.passed === true && 'bg-green-100 text-green-700 border-green-200',
                              sub.passed === false && 'bg-red-100 text-red-700 border-red-200'
                            )}
                          >
                            {sub.submission_type === 'milestone' ? 'Milestone' : 'Final'}
                          </Badge>
                          {sub.final_score !== undefined && sub.final_score !== null && (
                            <p className="text-xs font-medium mt-1">{sub.final_score}%</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Action bar (sticky bottom on mobile) */}
        <div className="sticky bottom-4 z-10">
          <Card className="p-4 shadow-lg border-border/80 bg-background/95 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm">
                <span className="font-medium flex items-center gap-1">
                  <Trophy className="h-4 w-4 text-[#0b6d41]" />
                  {quest.reputation_points} reputation points
                </span>
                {quest.estimated_hours && (
                  <span className="text-muted-foreground ml-4">
                    ~{quest.estimated_hours}h estimated
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                {isEnrolled ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/learn/build/${questId}`)}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Submit Work
                    </Button>
                    <Button
                      className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
                      onClick={() => router.push(`/learn/build/${questId}`)}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Build Arena
                    </Button>
                  </>
                ) : (
                  <Button
                    className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
                    onClick={handleEnroll}
                    disabled={isEnrolling || quest.status !== 'open'}
                  >
                    {isEnrolling ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Start Quest
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
