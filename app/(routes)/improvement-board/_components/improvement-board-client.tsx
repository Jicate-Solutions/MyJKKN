'use client';

/**
 * Improvement Board — client kanban.
 * Six columns (Logged → Under Review → Approved → Applied → Verified → Closed).
 * Cards badge urgent (⚡) and sensitive (🔒). Filter by area. Managers
 * (improvement.board.manage) get review actions inside the detail dialog;
 * creators (improvement.ideas.create) get "File an idea".
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
  SlidersHorizontal
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ImprovementService,
  type ImprovementArea,
  type ImprovementIdeaEnriched
} from '@/lib/services/improvement/improvement-service';
import { BOARD_COLUMNS } from './board-constants';
import { CreateIdeaDialog } from './create-idea-dialog';
import { IdeaDetailDialog } from './idea-detail-dialog';

interface ImprovementBoardClientProps {
  userId: string;
  userName: string;
  institutionId: string;
  initialAreas: ImprovementArea[];
  initialIdeas: ImprovementIdeaEnriched[];
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

export function ImprovementBoardClient({
  userId,
  initialAreas,
  initialIdeas
}: ImprovementBoardClientProps) {
  const { can } = usePermissions();
  const canCreate = can('improvement.ideas.create');
  const canManage = can('improvement.board.manage');

  const [ideas, setIdeas] = useState<ImprovementIdeaEnriched[]>(initialIdeas);
  const [areas] = useState<ImprovementArea[]>(initialAreas);
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

  const totalOnBoard = columns.reduce((sum, c) => sum + c.items.length, 0);

  const areaLabelForSelect = (id: string) =>
    areas.find((a) => a.id === id)?.label || 'Unknown area';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Lightbulb className="text-primary h-6 w-6" />
            Improvement Board
          </h1>
          <p className="text-muted-foreground mt-1">
            Turn everyday problems into business cases the institution can act on.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/improvement-board/leaderboard">
              <Trophy className="mr-2 h-4 w-4" />
              Impact Leaderboard
            </Link>
          </Button>
          {canManage && (
            <Button variant="outline" asChild>
              <Link href="/improvement-board/manage-boards">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Manage boards
              </Link>
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              File an idea
            </Button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="text-muted-foreground h-4 w-4 shrink-0" />
        <Select value={areaFilter} onValueChange={handleAreaFilter}>
          <SelectTrigger className="min-w-0 flex-1 sm:w-64 sm:flex-none">
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Lightbulb className="text-muted-foreground/50 h-10 w-10" />
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {columns.map((col) => {
            const Icon = col.icon;
            return (
              <div key={col.status} className="space-y-3">
                <div
                  className={`flex items-center justify-between rounded-lg p-3 ${col.bgColor}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${col.color}`} />
                    <span className="text-sm font-medium">{col.title}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {col.items.length}
                  </Badge>
                </div>

                <div className="min-h-[80px] space-y-2">
                  {col.items.length === 0 ? (
                    <div className="text-muted-foreground rounded-lg border-2 border-dashed py-6 text-center text-xs">
                      None
                    </div>
                  ) : (
                    col.items.map((idea) => (
                      <Card
                        key={idea.id}
                        className="cursor-pointer transition-shadow hover:shadow-sm"
                        onClick={() => setDetailIdea(idea)}
                      >
                        <CardContent className="space-y-2 p-3">
                          <div className="flex items-start justify-between gap-1.5">
                            <p className="line-clamp-2 text-sm font-medium leading-tight">
                              {idea.title}
                            </p>
                            <div className="flex shrink-0 items-center gap-1">
                              {idea.is_urgent && (
                                <Zap
                                  className="h-3.5 w-3.5 text-amber-500"
                                  aria-label="Urgent"
                                />
                              )}
                              {idea.visibility === 'sensitive' && (
                                <Lock
                                  className="h-3.5 w-3.5 text-purple-500"
                                  aria-label="Sensitive"
                                />
                              )}
                            </div>
                          </div>

                          {idea.area_label && (
                            <Badge variant="outline" className="text-xs">
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

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-muted-foreground max-w-[110px] truncate text-xs">
                              {idea.author_name || 'Unknown'}
                            </span>
                            {idea.score != null && (
                              <span className="text-xs font-semibold text-emerald-700">
                                {idea.score} pts
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
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
      />
    </div>
  );
}
