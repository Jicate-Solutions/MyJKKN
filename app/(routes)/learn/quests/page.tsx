'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuests, useEnrollInQuest, useLearnerQuestEnrollments } from '@/hooks/pde/use-pde';
import type { PDEQuestEnrollment } from '@/types/pde';
import { useAuth } from '@/hooks/use-auth';
import {
  Search,
  Target,
  Users,
  Clock,
  Trophy,
  Lock,
  Unlock,
  Star,
  Flame,
  Sparkles,
  Building2,
  Lightbulb,
  GraduationCap,
  Filter,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import type {
  PDEQuest,
  QuestType,
  QuestDifficulty,
  QuestSourceType,
  QuestStatus,
} from '@/types/pde';

// ============================================
// Constants
// ============================================

const QUEST_TYPE_CONFIG: Record<QuestType, { label: string; color: string; icon: typeof Users }> = {
  solo: { label: 'Solo', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300', icon: Target },
  team: { label: 'Team', color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300', icon: Users },
  cross_dept: { label: 'Cross-Dept', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300', icon: Building2 },
  community: { label: 'Community', color: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300', icon: Lightbulb },
  industry: { label: 'Industry', color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300', icon: Building2 },
};

const DIFFICULTY_CONFIG: Record<QuestDifficulty, { label: string; color: string }> = {
  beginner: { label: 'Beginner', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  intermediate: { label: 'Intermediate', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  advanced: { label: 'Advanced', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  expert: { label: 'Expert', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
};

const SOURCE_TYPE_LABELS: Record<QuestSourceType, string> = {
  solutions_dept: 'Solutions Dept',
  jicate_client: 'JICATE Client',
  nif: 'NIF',
  industry: 'Industry',
  community: 'Community',
  faculty: 'Senior Learner',
  learner: 'Learner-Proposed',
};

// ============================================
// Quest Card Component
// ============================================

function QuestCard({
  quest,
  enrolledQuestIds,
  onEnroll,
  isEnrolling,
}: {
  quest: PDEQuest;
  enrolledQuestIds: Set<string>;
  onEnroll: (questId: string) => void;
  isEnrolling: boolean;
}) {
  const isEnrolled = enrolledQuestIds.has(quest.id);
  const typeConfig = QUEST_TYPE_CONFIG[quest.quest_type] || QUEST_TYPE_CONFIG.solo;
  const diffConfig = quest.difficulty ? DIFFICULTY_CONFIG[quest.difficulty] : null;
  const TypeIcon = typeConfig.icon;
  const requiredCaps = (quest.required_capabilities || []) as Array<{ capability_id: string; min_level: number; name?: string }>;
  const enrolledCount = (quest as PDEQuest & { enrolled_count?: number }).enrolled_count || 0;

  return (
    <Card className="group hover:shadow-md transition-shadow border-border/60 bg-[#fbfbee]/30 dark:bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {quest.status === 'open' && (
                <span className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                  <Flame className="h-3 w-3" />
                  NEW
                </span>
              )}
              <Badge variant="outline" className={cn('text-xs', typeConfig.color)}>
                <TypeIcon className="h-3 w-3 mr-1" />
                {typeConfig.label}
              </Badge>
              {diffConfig && (
                <Badge variant="outline" className={cn('text-xs', diffConfig.color)}>
                  {diffConfig.label}
                </Badge>
              )}
            </div>
            <Link href={`/learn/quests/${quest.id}`}>
              <CardTitle className="text-base font-semibold leading-tight hover:text-[#0b6d41] transition-colors cursor-pointer line-clamp-2">
                {quest.title}
              </CardTitle>
            </Link>
          </div>
          <div className="flex items-center gap-1 text-sm font-medium text-[#0b6d41] dark:text-emerald-400 shrink-0">
            <Trophy className="h-4 w-4" />
            {quest.reputation_points}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Problem statement preview */}
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {quest.problem_statement}
        </p>

        {/* Source + meta info */}
        {quest.source_type && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{SOURCE_TYPE_LABELS[quest.source_type] || quest.source_type}</span>
            {quest.source_department && (
              <>
                <span className="text-border">|</span>
                <span>{quest.source_department}</span>
              </>
            )}
          </div>
        )}

        {/* Required capabilities */}
        {requiredCaps.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {requiredCaps.slice(0, 4).map((cap, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className="text-xs font-normal gap-1"
              >
                <Unlock className="h-3 w-3 text-green-600" />
                {cap.name || `L${cap.min_level}`}
              </Badge>
            ))}
            {requiredCaps.length > 4 && (
              <Badge variant="secondary" className="text-xs font-normal">
                +{requiredCaps.length - 4} more
              </Badge>
            )}
          </div>
        )}

        {/* Eligibility badges */}
        <div className="flex flex-wrap gap-1.5">
          {quest.solutions_hub_eligible && (
            <Badge className="bg-[#0b6d41]/10 text-[#0b6d41] border-[#0b6d41]/20 hover:bg-[#0b6d41]/20 text-xs">
              <Star className="h-3 w-3 mr-1" />
              Solutions Hub
            </Badge>
          )}
          {quest.nif_eligible && (
            <Badge className="bg-[#ffde59]/20 text-amber-800 dark:text-amber-300 border-amber-300/30 hover:bg-[#ffde59]/30 text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              NIF Eligible
            </Badge>
          )}
        </div>

        <Separator />

        {/* Footer: enrolled count + action */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {enrolledCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {enrolledCount} {quest.quest_type === 'team' ? 'teams' : 'Learners'} working
              </span>
            )}
            {quest.estimated_hours && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                ~{quest.estimated_hours}h
              </span>
            )}
          </div>

          {isEnrolled ? (
            <Link href={`/learn/quests/${quest.id}`}>
              <Button size="sm" variant="outline" className="text-xs h-8">
                In Progress
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              className="text-xs h-8 bg-[#0b6d41] hover:bg-[#0b6d41]/90"
              onClick={() => onEnroll(quest.id)}
              disabled={isEnrolling}
            >
              Start Quest
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Sidebar Filters
// ============================================

function FilterSidebar({
  filters,
  onFilterChange,
}: {
  filters: QuestFilters;
  onFilterChange: (key: keyof QuestFilters, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Quest Type</h3>
        <div className="space-y-1">
          {Object.entries(QUEST_TYPE_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => onFilterChange('quest_type', filters.quest_type === key ? '' : key)}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm transition-colors',
                filters.quest_type === key
                  ? 'bg-[#0b6d41]/10 text-[#0b6d41] font-medium'
                  : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              <config.icon className="h-3.5 w-3.5" />
              {config.label}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-medium mb-2">Difficulty</h3>
        <div className="space-y-1">
          {Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => onFilterChange('difficulty', filters.difficulty === key ? '' : key)}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm transition-colors',
                filters.difficulty === key
                  ? 'bg-[#0b6d41]/10 text-[#0b6d41] font-medium'
                  : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              {config.label}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-medium mb-2">Source</h3>
        <div className="space-y-1">
          {Object.entries(SOURCE_TYPE_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => onFilterChange('source_type', filters.source_type === key ? '' : key)}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm transition-colors',
                filters.source_type === key
                  ? 'bg-[#0b6d41]/10 text-[#0b6d41] font-medium'
                  : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-medium mb-2">Eligibility</h3>
        <div className="space-y-1">
          <button
            onClick={() => onFilterChange('solutions_hub', filters.solutions_hub ? '' : 'true')}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm transition-colors',
              filters.solutions_hub
                ? 'bg-[#0b6d41]/10 text-[#0b6d41] font-medium'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <Star className="h-3.5 w-3.5" />
            Solutions Hub
          </button>
          <button
            onClick={() => onFilterChange('nif_eligible', filters.nif_eligible ? '' : 'true')}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm transition-colors',
              filters.nif_eligible
                ? 'bg-[#ffde59]/30 text-amber-800 font-medium'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            NIF Eligible
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Types
// ============================================

interface QuestFilters {
  search: string;
  quest_type: string;
  difficulty: string;
  source_type: string;
  status: string;
  solutions_hub: string;
  nif_eligible: string;
}

const DEFAULT_FILTERS: QuestFilters = {
  search: '',
  quest_type: '',
  difficulty: '',
  source_type: '',
  status: 'open',
  solutions_hub: '',
  nif_eligible: '',
};

// ============================================
// Main Page
// ============================================

export default function QuestBoardPage() {
  const { profile: user } = useAuth();
  const [filters, setFilters] = useState<QuestFilters>(DEFAULT_FILTERS);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Fetch quests with current filters
  const { data: questsData, isLoading } = useQuests({
    quest_type: (filters.quest_type || undefined) as QuestType | undefined,
    difficulty: (filters.difficulty || undefined) as QuestDifficulty | undefined,
    source_type: (filters.source_type || undefined) as QuestSourceType | undefined,
    status: (filters.status || undefined) as QuestStatus | undefined,
  });

  const enrollInQuest = useEnrollInQuest();

  // Client-side filtering for search, eligibility
  const filteredQuests = useMemo(() => {
    let quests = questsData || [];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      quests = quests.filter(
        (quest) =>
          quest.title.toLowerCase().includes(q) ||
          quest.problem_statement.toLowerCase().includes(q) ||
          quest.description?.toLowerCase().includes(q)
      );
    }

    if (filters.solutions_hub) {
      quests = quests.filter((quest) => quest.solutions_hub_eligible);
    }

    if (filters.nif_eligible) {
      quests = quests.filter((quest) => quest.nif_eligible);
    }

    return quests;
  }, [questsData, filters.search, filters.solutions_hub, filters.nif_eligible]);

  // Build set of enrolled quest IDs from real data
  const { data: myEnrollments } = useLearnerQuestEnrollments(user?.id);
  const enrolledQuestIds = useMemo(() => {
    if (!myEnrollments) return new Set<string>();
    return new Set(myEnrollments.map((e: PDEQuestEnrollment) => e.quest_id));
  }, [myEnrollments]);

  const handleFilterChange = (key: keyof QuestFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleEnroll = async (questId: string) => {
    if (!user?.id) {
      toast.error('Please log in to start a quest');
      return;
    }
    try {
      await enrollInQuest.mutateAsync({ questId, learnerId: user.id });
      toast.success('Enrolled! Head to Build Arena to start working.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to enroll');
    }
  };

  const activeFilterCount = [
    filters.quest_type,
    filters.difficulty,
    filters.source_type,
    filters.solutions_hub,
    filters.nif_eligible,
  ].filter(Boolean).length;

  return (
    <ContentLayout title="Quest Board">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Quest Board' },
        ]}
      />

      <div className="mt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Quest Board</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real problems. Real solutions. Choose your quest and build something that matters.
            </p>
          </div>

          {/* Status filter - quick toggle */}
          <Select
            value={filters.status || 'all'}
            onValueChange={(val) => handleFilterChange('status', val === 'all' ? '' : val)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search bar + mobile filter toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search quests by title, problem, or keyword..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            className="md:hidden"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
          >
            <Filter className="h-4 w-4 mr-1" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Mobile filters (collapsible) */}
        {showMobileFilters && (
          <Card className="md:hidden p-4">
            <FilterSidebar filters={filters} onFilterChange={handleFilterChange} />
          </Card>
        )}

        {/* Main content: sidebar + grid */}
        <div className="flex gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden md:block w-56 shrink-0">
            <div className="sticky top-20">
              <Card className="p-4">
                <FilterSidebar filters={filters} onFilterChange={handleFilterChange} />
              </Card>
            </div>
          </aside>

          {/* Quest grid */}
          <div className="flex-1">
            {isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="p-6">
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-20" />
                      </div>
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                      <div className="flex gap-2">
                        <Skeleton className="h-5 w-14" />
                        <Skeleton className="h-5 w-14" />
                      </div>
                      <Separator />
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : filteredQuests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Target className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">No quests match your filters</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Try adjusting your filters or search terms. New quests are added regularly from
                  Solutions Departments, JICATE clients, and community needs.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                >
                  Clear All Filters
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  {filteredQuests.length} quest{filteredQuests.length !== 1 ? 's' : ''} available
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredQuests.map((quest) => (
                    <QuestCard
                      key={quest.id}
                      quest={quest}
                      enrolledQuestIds={enrolledQuestIds}
                      onEnroll={handleEnroll}
                      isEnrolling={enrollInQuest.isPending}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
