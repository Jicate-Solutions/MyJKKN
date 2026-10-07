'use client';

/**
 * Improvement Board — client kanban.
 * Six columns (Logged → Under Review → Approved → Applied → Verified → Closed).
 * Cards badge urgent (⚡) and sensitive (🔒). Filter by area. Managers
 * (improvement.board.manage) get review actions inside the detail dialog;
 * creators (improvement.ideas.create) get "File an idea".
 *
 * From Approved onward a card says who it is with: the idea's assignee plus
 * the owners of its department. A department owner also gets their approved
 * ideas lifted into a panel above the board, so the work handed to them is the
 * first thing they see rather than one card among a hundred.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Lightbulb,
  Plus,
  Filter,
  Zap,
  Lock,
  Trophy,
  SlidersHorizontal,
  UserCheck,
  ClipboardCheck,
  ChevronRight
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ImprovementService,
  type ImprovementArea,
  type ImprovementIdeaEnriched,
  type ImprovementIdeaStatus
} from '@/lib/services/improvement/improvement-service';
import { BOARD_COLUMNS } from './board-constants';
import { CreateIdeaDialog } from './create-idea-dialog';
import { IdeaDetailDialog } from './idea-detail-dialog';

interface ImprovementBoardClientProps {
  userId: string;
  userName: string;
  institutionId: string;
  initialAreas: ImprovementArea[];
  /** Active departments of the viewer's institution, for the target picker. */
  initialDepartments: { id: string; name: string }[];
  initialIdeas: ImprovementIdeaEnriched[];
  /** Display names of each department's current owners, keyed by area id. */
  ownerNamesByArea?: Record<string, string[]>;
  /** Areas the viewer owns — their approved ideas are lifted above the board. */
  ownedAreaIds?: string[];
}

/**
 * Board ordering = "AI ranks, humans adjust" (spec decision 3):
 *   1. a human-set `score` wins (facilitators + CEO adjust priority) — higher first
 *   2. else the latest AI rank (1 = highest priority)
 *   3. else newest first.
 * Ideas a facilitator has scored float above unscored ones, so a human override
 * is always visible over the AI's suggestion.
 */
function byPriority(
  a: ImprovementIdeaEnriched,
  b: ImprovementIdeaEnriched
): number {
  const as = a.score;
  const bs = b.score;
  if (as != null || bs != null) {
    if (as == null) return 1;
    if (bs == null) return -1;
    if (bs !== as) return bs - as;
  }
  const ar = a.ai_rank;
  const br = b.ai_rank;
  if (ar != null || br != null) {
    if (ar == null) return 1;
    if (br == null) return -1;
    if (ar !== br) return ar - br;
  }
  return (b.created_at || '').localeCompare(a.created_at || '');
}

/** Per-column colour: the lane tint, its top bar, the count pill, a card's edge. */
const LANE_STYLE: Record<
  string,
  { lane: string; bar: string; pill: string; edge: string }
> = {
  logged: {
    lane: 'bg-slate-100/80 dark:bg-slate-900/50',
    bar: 'bg-slate-400',
    pill: 'bg-slate-600 text-white',
    edge: 'border-l-slate-400'
  },
  under_review: {
    lane: 'bg-blue-50 dark:bg-blue-950/30',
    bar: 'bg-blue-500',
    pill: 'bg-blue-600 text-white',
    edge: 'border-l-blue-500'
  },
  approved: {
    lane: 'bg-emerald-50 dark:bg-emerald-950/30',
    bar: 'bg-emerald-500',
    pill: 'bg-emerald-600 text-white',
    edge: 'border-l-emerald-500'
  },
  applied: {
    lane: 'bg-violet-50 dark:bg-violet-950/30',
    bar: 'bg-violet-500',
    pill: 'bg-violet-600 text-white',
    edge: 'border-l-violet-500'
  },
  verified: {
    lane: 'bg-teal-50 dark:bg-teal-950/30',
    bar: 'bg-teal-500',
    pill: 'bg-teal-600 text-white',
    edge: 'border-l-teal-500'
  },
  closed: {
    lane: 'bg-zinc-100/80 dark:bg-zinc-900/50',
    bar: 'bg-zinc-400',
    pill: 'bg-zinc-600 text-white',
    edge: 'border-l-zinc-400'
  }
};

/** Area chips get a stable colour each, so a department is recognisable at a glance. */
const AREA_CHIP = [
  'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200',
  'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200',
  'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200',
  'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200',
  'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
  'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200',
  'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
];

function areaChipClass(areaId: string | null): string {
  if (!areaId) return AREA_CHIP[0];
  let hash = 0;
  for (let i = 0; i < areaId.length; i++) {
    hash = (hash * 31 + areaId.charCodeAt(i)) >>> 0;
  }
  return AREA_CHIP[hash % AREA_CHIP.length];
}

function initials(name: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** From this stage on, an idea is with its department's owners. */
const OWNER_STAGES: ImprovementIdeaStatus[] = [
  'approved',
  'applied',
  'verified',
  'closed'
];

/**
 * Who an idea is with: its assignee, and — once approved — the owners of its
 * department. The same person reached both ways is listed once.
 */
function assignedTo(
  idea: ImprovementIdeaEnriched,
  ownerNamesByArea: Record<string, string[]>
): string[] {
  const names: string[] = [];
  if (idea.assignee_name) names.push(idea.assignee_name);
  if (OWNER_STAGES.includes(idea.status) && idea.area_id) {
    names.push(...(ownerNamesByArea[idea.area_id] ?? []));
  }
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const EMPTY_OWNER_NAMES: Record<string, string[]> = {};
const EMPTY_OWNED_AREAS: string[] = [];

export function ImprovementBoardClient({
  userId,
  initialAreas,
  initialDepartments,
  initialIdeas,
  ownerNamesByArea = EMPTY_OWNER_NAMES,
  ownedAreaIds = EMPTY_OWNED_AREAS
}: ImprovementBoardClientProps) {
  const { can } = usePermissions();
  const canCreate = can('improvement.ideas.create');
  const canManage = can('improvement.board.manage');

  const [ideas, setIdeas] = useState<ImprovementIdeaEnriched[]>(initialIdeas);
  const [areas] = useState<ImprovementArea[]>(initialAreas);
  const [departments] = useState<{ id: string; name: string }[]>(
    initialDepartments
  );
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailIdea, setDetailIdea] = useState<ImprovementIdeaEnriched | null>(null);

  const refresh = useCallback(async () => {
    const next = await ImprovementService.listIdeas(
      areaFilter !== 'all' ? { areaId: areaFilter } : {}
    );
    setIdeas(next);
  }, [areaFilter]);

  const handleAreaFilter = useCallback(async (value: string) => {
    setAreaFilter(value);
    const next = await ImprovementService.listIdeas(
      value !== 'all' ? { areaId: value } : {}
    );
    setIdeas(next);
  }, []);

  const visibleIdeas = useMemo(
    () =>
      areaFilter === 'all'
        ? ideas
        : ideas.filter((i) => i.area_id === areaFilter),
    [ideas, areaFilter]
  );

  const columns = useMemo(
    () =>
      BOARD_COLUMNS.map((col) => ({
        ...col,
        items: visibleIdeas
          .filter((i) => i.status === col.status)
          .slice()
          .sort(byPriority)
      })),
    [visibleIdeas]
  );

  /** The viewer's own work: approved ideas on departments they own. */
  const myApproved = useMemo(
    () =>
      ownedAreaIds.length === 0
        ? []
        : ideas
            .filter(
              (i) =>
                i.status === 'approved' &&
                !!i.area_id &&
                ownedAreaIds.includes(i.area_id)
            )
            .sort(byPriority),
    [ideas, ownedAreaIds]
  );

  const totalOnBoard = columns.reduce((sum, c) => sum + c.items.length, 0);
  const countOf = (status: ImprovementIdeaStatus) =>
    columns.find((c) => c.status === status)?.items.length ?? 0;

  const areaLabelForSelect = (id: string) =>
    areas.find((a) => a.id === id)?.label || 'Unknown area';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-600 p-4 text-white shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Lightbulb className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold sm:text-2xl">Improvement Board</h1>
              <p className="mt-0.5 text-sm text-white/85">
                Turn everyday problems into business cases the institution can
                act on.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              variant="secondary"
              asChild
              className="flex-1 border-0 bg-white/15 text-white hover:bg-white/25 sm:flex-none"
            >
              <Link href="/improvement-board/leaderboard">
                <Trophy className="mr-2 h-4 w-4" />
                Impact Leaderboard
              </Link>
            </Button>
            {canManage && (
              <Button
                variant="secondary"
                asChild
                className="flex-1 border-0 bg-white/15 text-white hover:bg-white/25 sm:flex-none"
              >
                <Link href="/improvement-board/manage-boards">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Manage boards
                </Link>
              </Button>
            )}
            {canCreate && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="w-full bg-white font-semibold text-emerald-700 shadow-sm hover:bg-white/90 sm:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                File an idea
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'On the board', value: totalOnBoard },
            { label: 'Waiting to be looked at', value: countOf('logged') },
            { label: 'Under review', value: countOf('under_review') },
            { label: 'Approved', value: countOf('approved') }
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-white/15 px-3 py-2 ring-1 ring-white/20"
            >
              <p className="text-xl leading-tight font-bold">{stat.value}</p>
              <p className="text-xs text-white/85">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* The viewer's own approved work, ahead of everything else. */}
      {myApproved.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 dark:border-emerald-900 dark:from-emerald-950/40 dark:to-teal-950/40">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Approved for your department
              </p>
              <p className="text-muted-foreground text-xs">
                {myApproved.length}{' '}
                {myApproved.length === 1 ? 'idea is' : 'ideas are'} approved and
                with you to carry out.
              </p>
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {myApproved.map((idea) => (
              <li key={idea.id}>
                <button
                  type="button"
                  onClick={() => setDetailIdea(idea)}
                  className="bg-card flex w-full items-center gap-3 rounded-xl border border-l-4 border-l-emerald-500 p-3 text-left shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium">
                      {idea.title}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                      {idea.area_label ?? 'Your department'}
                      {idea.author_name ? ` · filed by ${idea.author_name}` : ''}
                    </span>
                  </span>
                  {idea.is_urgent && (
                    <Zap className="h-4 w-4 shrink-0 text-amber-500" aria-label="Urgent" />
                  )}
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="text-muted-foreground h-4 w-4 shrink-0" />
        <Select value={areaFilter} onValueChange={handleAreaFilter}>
          <SelectTrigger className="h-10 min-w-0 flex-1 rounded-xl sm:w-64 sm:flex-none">
            <SelectValue placeholder="Filter by area…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {areaFilter !== 'all' && (
          <Badge variant="secondary" className="shrink-0">{areaLabelForSelect(areaFilter)}</Badge>
        )}
      </div>

      {/* Board / empty state */}
      {totalOnBoard === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950">
              <Lightbulb className="h-7 w-7" />
            </span>
            <div>
              <p className="font-medium">No ideas on the board yet</p>
              <p className="text-muted-foreground text-sm">
                {areaFilter !== 'all'
                  ? 'No ideas in this area. Try another area or file the first one.'
                  : 'Be the first to turn a problem into an improvement idea.'}
              </p>
            </div>
            {canCreate && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                File an idea
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Phones swipe sideways through the lanes, one snapping into view at
           a time; from xl the six lanes sit side by side. Each lane scrolls
           its own cards, so a long Logged list never pushes the others away. */
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 xl:grid xl:snap-none xl:grid-cols-6 xl:overflow-visible">
          {columns.map((col) => {
            const Icon = col.icon;
            const style = LANE_STYLE[col.status] ?? LANE_STYLE.logged;
            return (
              <div
                key={col.status}
                className={`flex w-[82vw] shrink-0 snap-center flex-col overflow-hidden rounded-2xl sm:w-72 xl:w-auto xl:shrink ${style.lane}`}
              >
                <div className={`h-1 w-full ${style.bar}`} />
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className={`h-4 w-4 shrink-0 ${col.color}`} />
                    <span className="truncate text-sm font-semibold">{col.title}</span>
                  </div>
                  <span
                    className={`min-w-6 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${style.pill}`}
                  >
                    {col.items.length}
                  </span>
                </div>

                <div className="max-h-[68dvh] min-h-[88px] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {col.items.length === 0 ? (
                    <div className="text-muted-foreground rounded-xl border-2 border-dashed py-7 text-center text-xs">
                      Nothing here
                    </div>
                  ) : (
                    col.items.map((idea) => {
                      const withWhom = assignedTo(idea, ownerNamesByArea);
                      return (
                        <Card
                          key={idea.id}
                          role="button"
                          tabIndex={0}
                          className={`cursor-pointer rounded-xl border-l-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none ${style.edge}`}
                          onClick={() => setDetailIdea(idea)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setDetailIdea(idea);
                            }
                          }}
                        >
                          <CardContent className="space-y-2.5 p-3">
                            <div className="flex items-start justify-between gap-1.5">
                              <p className="line-clamp-3 text-sm leading-snug font-medium">
                                {idea.title}
                              </p>
                              <div className="flex shrink-0 items-center gap-1">
                                {idea.is_urgent && (
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
                                    <Zap
                                      className="h-3 w-3 text-amber-600"
                                      aria-label="Urgent"
                                    />
                                  </span>
                                )}
                                {idea.visibility === 'sensitive' && (
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-950">
                                    <Lock
                                      className="h-3 w-3 text-purple-600"
                                      aria-label="Sensitive"
                                    />
                                  </span>
                                )}
                              </div>
                            </div>

                            {idea.area_label && (
                              <Badge
                                variant="outline"
                                className={`text-xs font-medium ${areaChipClass(idea.area_id)}`}
                              >
                                {idea.area_label}
                              </Badge>
                            )}

                            {idea.ai_rank != null && (
                              <div className="space-y-1">
                                <Badge
                                  variant="outline"
                                  className="border-primary/25 bg-primary/10 text-primary text-xs"
                                >
                                  AI priority #{idea.ai_rank}
                                </Badge>
                                {idea.ai_rank_reason && (
                                  <p className="text-muted-foreground line-clamp-2 text-xs italic">
                                    {idea.ai_rank_reason}
                                  </p>
                                )}
                              </div>
                            )}

                            {withWhom.length > 0 && (
                              <div className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs dark:bg-emerald-950/50">
                                <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                <span className="min-w-0">
                                  <span className="text-muted-foreground">
                                    Assigned to{' '}
                                  </span>
                                  <span className="font-medium">
                                    {withWhom.join(', ')}
                                  </span>
                                </span>
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-2 border-t pt-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-sky-500 text-[9px] font-bold text-white">
                                  {initials(idea.author_name)}
                                </span>
                                <span className="text-muted-foreground truncate text-xs">
                                  {idea.author_name || 'Unknown'}
                                </span>
                              </span>
                              {idea.score != null && (
                                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                  {idea.score} pts
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateIdeaDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        areas={areas}
        departments={departments}
        onCreated={refresh}
      />

      <IdeaDetailDialog
        idea={detailIdea}
        open={!!detailIdea}
        onOpenChange={(o) => {
          if (!o) setDetailIdea(null);
        }}
        canManage={canManage}
        currentUserId={userId}
        onChanged={refresh}
        assignedTo={detailIdea ? assignedTo(detailIdea, ownerNamesByArea) : []}
      />
    </div>
  );
}
