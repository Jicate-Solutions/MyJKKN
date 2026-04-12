'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Trophy,
  Flame,
  TrendingUp,
  Sprout,
  Search,
  Wrench,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Users,
} from 'lucide-react';
import { useSF100PublicLeaderboard } from '@/hooks/startup-studio';
import { cn } from '@/lib/utils';

interface SF100PublicLeaderboardProps {
  programId: string;
}

interface TeamEntry {
  enrollment_id?: string;
  enrollmentId?: string;
  team_name?: string;
  teamName?: string;
  app_name?: string;
  appName?: string;
  college?: string;
  institution?: string;
  paid_user_count?: number;
  paidUserCount?: number;
  rank?: number;
}

interface PhaseGroup {
  phase: string;
  teams: TeamEntry[];
}

const PHASE_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    iconClass: string;
    badgeClass: string;
    defaultOpen: boolean;
    order: number;
  }
> = {
  graduated: {
    label: 'Graduated',
    icon: Trophy,
    iconClass: 'text-amber-600',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    defaultOpen: true,
    order: 0,
  },
  hundred_users: {
    label: '100 Users Phase',
    icon: Flame,
    iconClass: 'text-orange-500',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
    defaultOpen: true,
    order: 1,
  },
  growth: {
    label: 'Growth (25+ users)',
    icon: TrendingUp,
    iconClass: 'text-blue-600',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    defaultOpen: false,
    order: 2,
  },
  first_users: {
    label: 'First Users (5+)',
    icon: Sprout,
    iconClass: 'text-green-600',
    badgeClass: 'bg-green-100 text-green-800 border-green-200',
    defaultOpen: false,
    order: 3,
  },
  problem_solution_fit: {
    label: 'Problem-Solution Fit',
    icon: Search,
    iconClass: 'text-purple-600',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    defaultOpen: false,
    order: 4,
  },
  setup: {
    label: 'Setup',
    icon: Wrench,
    iconClass: 'text-gray-500',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    defaultOpen: false,
    order: 5,
  },
};

function TeamRow({
  team,
  rank,
}: {
  team: TeamEntry;
  rank: number;
}) {
  const enrollmentId = team.enrollment_id ?? team.enrollmentId;
  const teamName = team.team_name ?? team.teamName ?? 'Unnamed Team';
  const appName = team.app_name ?? team.appName;
  const colleges: string[] = (team as any).colleges || [];
  const singleCollege = team.college ?? team.institution ?? (team as any).institution_name ?? '';
  const paidUsers = team.paid_user_count ?? team.paidUserCount ?? (team as any).cumulative_paid_users ?? 0;

  const rankDisplay = rank <= 3 ? (
    <span
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold',
        rank === 1 && 'bg-amber-100 text-amber-700',
        rank === 2 && 'bg-gray-100 text-gray-600',
        rank === 3 && 'bg-orange-100 text-orange-600',
      )}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  ) : (
    <span className="flex h-7 w-7 items-center justify-center text-sm text-muted-foreground font-medium">
      {rank}
    </span>
  );

  const row = (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-[#fbfbee] transition-colors group">
      {rankDisplay}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-snug truncate">
          {appName ? appName : teamName}
        </p>
        {appName && (
          <p className="text-xs text-muted-foreground truncate">{teamName}</p>
        )}
        {(colleges.length > 0 || singleCollege) && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {(colleges.length > 0 ? colleges : [singleCollege]).filter(Boolean).map((c, idx) => (
              <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-shrink-0">
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-semibold tabular-nums text-foreground">{paidUsers}</span>
        <span className="text-xs hidden sm:inline">paid users</span>
      </div>
    </div>
  );

  if (enrollmentId) {
    return (
      <Link
        href={`/startup-studio/solve-for-100/team/${enrollmentId}`}
        className="block"
        aria-label={`View ${teamName} team detail`}
      >
        {row}
      </Link>
    );
  }

  return row;
}

function PhaseSection({
  phaseKey,
  teams,
  defaultOpen,
}: {
  phaseKey: string;
  teams: TeamEntry[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const config = PHASE_CONFIG[phaseKey] ?? {
    label: phaseKey,
    icon: Wrench,
    iconClass: 'text-gray-500',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    defaultOpen: false,
    order: 99,
  };
  const Icon = config.icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex w-full items-center gap-3 px-4 py-3 rounded-xl bg-white border hover:bg-gray-50/80 transition-colors"
        aria-expanded={open}
        aria-label={`${config.label} — ${teams.length} team${teams.length !== 1 ? 's' : ''}`}
      >
        <Icon className={cn('h-5 w-5 flex-shrink-0', config.iconClass)} aria-hidden="true" />
        <span className="font-semibold text-sm flex-1 text-left">{config.label}</span>
        <Badge variant="outline" className={cn('text-xs font-medium', config.badgeClass)}>
          {teams.length} team{teams.length !== 1 ? 's' : ''}
        </Badge>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 rounded-xl border bg-white overflow-hidden divide-y">
          {teams.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground text-center">
              No teams in this phase yet.
            </p>
          ) : (
            teams.map((team, idx) => (
              <TeamRow
                key={team.enrollment_id ?? team.enrollmentId ?? idx}
                team={team}
                rank={idx + 1}
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 w-32" />
            <div className="ml-auto">
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
          {i < 2 && (
            <div className="space-y-2 pt-1">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 px-2">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <div className="ml-auto">
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function SF100PublicLeaderboard({ programId }: SF100PublicLeaderboardProps) {
  const { data: raw, isLoading, error } = useSF100PublicLeaderboard(programId);

  if (isLoading) return <LeaderboardSkeleton />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>
          Failed to load leaderboard. Please refresh the page.
        </AlertDescription>
      </Alert>
    );
  }

  // Normalise API response — handles multiple shapes:
  //   1. { phases: [{ phase, teams }], total_teams, ... }  (SF100Service.getPublicLeaderboard)
  //   2. [{ phase, teams }]  (array of phase groups)
  //   3. [{ team_name, phase, ... }]  (flat array of teams)
  const payload = (raw as any)?.data ?? raw;

  let phaseGroups: PhaseGroup[] = [];

  if (payload?.phases && Array.isArray(payload.phases)) {
    // Shape 1: service returns { phases: [...], total_teams, ... }
    phaseGroups = payload.phases as PhaseGroup[];
  } else if (Array.isArray(payload)) {
    // If each item has a `phase` field: group them
    if (payload.length > 0 && (payload[0]?.phase || payload[0]?.teams)) {
      // Shape 2: already grouped: [{ phase: 'graduated', teams: [...] }]
      phaseGroups = payload as PhaseGroup[];
    } else {
      // Shape 3: flat array — group by phase field on each team
      const map: Record<string, TeamEntry[]> = {};
      for (const team of payload as TeamEntry[]) {
        const p = (team as any).phase ?? 'setup';
        if (!map[p]) map[p] = [];
        map[p].push(team);
      }
      phaseGroups = Object.entries(map).map(([phase, teams]) => ({ phase, teams }));
    }
  }

  // Sort phase groups by defined order
  phaseGroups.sort(
    (a, b) =>
      (PHASE_CONFIG[a.phase]?.order ?? 99) - (PHASE_CONFIG[b.phase]?.order ?? 99),
  );

  if (phaseGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Trophy className="h-12 w-12 text-muted-foreground/30 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          No teams enrolled yet. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" role="region" aria-label="Solve for 100 leaderboard">
      {phaseGroups.map(({ phase, teams }) => (
        <PhaseSection
          key={phase}
          phaseKey={phase}
          teams={teams}
          defaultOpen={
            PHASE_CONFIG[phase]?.defaultOpen ?? false
          }
        />
      ))}
    </div>
  );
}
