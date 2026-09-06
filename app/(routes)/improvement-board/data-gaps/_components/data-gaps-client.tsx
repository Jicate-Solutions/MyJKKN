'use client';

/**
 * MBA Data Gaps — manager triage client.
 * Manager-only (improvement.board.manage). Lists the data gaps Associates filed
 * from empty analytics pages and lets a manager Accept / mark Not feasible /
 * mark Duplicate. Accepting a gap materialises a linked improvement idea (done
 * server-side by fn_mba_triage_data_gap) — the link then shows on the row.
 *
 * Gating branches on the loading state FIRST so a manager never sees a
 * denied-looking flash while permissions resolve, and a denied user gets an
 * explicit reason instead of a silent redirect (CLAUDE.md #27).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  FileWarning,
  ShieldAlert,
  ArrowLeft,
  Building2,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  ArrowUpRight,
  Clock,
  Undo2,
  AlertTriangle,
  Check,
  Zap,
  UserRound,
  Search
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { MemberPicker } from '@/components/cohort-core/member-picker';
import {
  MbaDataGapService,
  type MbaDataGap,
  type DataGapStatus,
  type DataGapType,
  type DataGapClass,
  type DuplicateSuggestion
} from '@/lib/services/mba-data-gap/mba-data-gap-service';
import { ContributorScoreboard } from './contributor-scoreboard';

/* -------------------------------------------------------------------------- */
/* Display metadata                                                           */
/* -------------------------------------------------------------------------- */

const GAP_TYPE_LABEL: Record<DataGapType, string> = {
  not_captured: 'Not captured',
  not_surfaced: 'Captured, no view',
  unsure: 'Not sure'
};

const STATUS_META: Record<
  DataGapStatus,
  { label: string; className: string }
> = {
  filed: { label: 'Filed', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  triaged: { label: 'Triaged', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  accepted: {
    label: 'Accepted',
    className: 'border-green-200 bg-green-50 text-green-700'
  },
  not_feasible: {
    label: 'Not feasible',
    className: 'border-muted bg-muted text-muted-foreground'
  },
  captured_elsewhere: {
    label: 'Captured elsewhere',
    className: 'border-muted bg-muted text-muted-foreground'
  },
  duplicate: {
    label: 'Duplicate',
    className: 'border-muted bg-muted text-muted-foreground'
  },
  parked: {
    label: 'Parked',
    className: 'border-violet-200 bg-violet-50 text-violet-700'
  }
};

/** AI classification badge (Phase 2). NULL class renders nothing. */
const GAP_CLASS_META: Record<
  DataGapClass,
  { label: string; className: string }
> = {
  type_a_surface: {
    label: 'Data exists — surface it',
    className: 'border-green-200 bg-green-50 text-green-700'
  },
  type_b_capture: {
    label: 'Not captured — build it',
    className: 'border-amber-200 bg-amber-50 text-amber-700'
  },
  uncertain: {
    label: 'Needs a closer look',
    className: 'border-muted bg-muted text-muted-foreground'
  }
};

/** Statuses a manager can still act on. */
const OPEN_STATUSES: DataGapStatus[] = ['filed', 'triaged'];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'filed', label: 'Filed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'stalled', label: 'Stalled' },
  { value: 'parked', label: 'Parked (someday)' },
  { value: 'not_feasible', label: 'Not feasible' },
  { value: 'duplicate', label: 'Duplicate' }
];

/* -------------------------------------------------------------------------- */
/* Shells                                                                     */
/* -------------------------------------------------------------------------- */

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96" />
      <div className="grid gap-3 pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}

function NoAccessPanel() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <ShieldAlert className="text-muted-foreground/50 h-10 w-10" />
        <div>
          <p className="font-medium">You don&apos;t have access to this page</p>
          <p className="text-muted-foreground text-sm">
            Triaging data gaps needs the &ldquo;Manage Improvement Board&rdquo;
            permission. Ask an Improvement Board manager if you need access.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/improvement-board">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to the Improvement Board
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Entry                                                                      */
/* -------------------------------------------------------------------------- */

export function DataGapsClient() {
  const { can, isLoading: permsLoading } = usePermissions();

  // Branch on loading FIRST — otherwise `can()` reads false while perms load
  // and a manager sees the no-access panel flash.
  if (permsLoading) return <LoadingState />;
  if (!can('improvement.board.manage')) return <NoAccessPanel />;

  return <DataGapsBoard />;
}

function DataGapsBoard() {
  const [loading, setLoading] = useState(true);
  const [gaps, setGaps] = useState<MbaDataGap[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [ownerEditing, setOwnerEditing] = useState<Set<string>>(new Set());
  const [dupsByGap, setDupsByGap] = useState<
    Map<string, DuplicateSuggestion[] | 'loading'>
  >(new Map());

  const load = useCallback(async () => {
    const rows = await MbaDataGapService.listDataGaps();
    setGaps(rows);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (err) {
        if (alive)
          toast.error(
            err instanceof Error ? err.message : 'Could not load data gaps.'
          );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const setBusyFor = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleTriage = useCallback(
    async (gap: MbaDataGap, status: DataGapStatus) => {
      setBusyFor(gap.id, true);
      try {
        await MbaDataGapService.triageDataGap(gap.id, status);
        // Reload so the row reflects the new status + any freshly linked idea.
        const rows = await MbaDataGapService.listDataGaps();
        setGaps(rows);
        const TRIAGE_TOAST: Partial<Record<DataGapStatus, string>> = {
          accepted: 'Accepted — an improvement idea was created on the board.',
          parked: 'Set aside for later — it stays on the someday wishlist.',
          triaged: 'Moved back to the queue.'
        };
        toast.success(
          TRIAGE_TOAST[status] ??
            `Marked ${STATUS_META[status].label.toLowerCase()}.`
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Could not update the data gap.'
        );
      } finally {
        setBusyFor(gap.id, false);
      }
    },
    []
  );

  const toggleOwnerEditing = (id: string) =>
    setOwnerEditing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleAssignOwner = useCallback(
    async (gap: MbaDataGap, ownerId: string | null) => {
      setBusyFor(gap.id, true);
      try {
        await MbaDataGapService.assignOwner(gap.id, ownerId);
        await load();
        setOwnerEditing((prev) => {
          const n = new Set(prev);
          n.delete(gap.id);
          return n;
        });
        toast.success(
          ownerId ? 'Owner assigned.' : 'Owner cleared — back to the shared board.'
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Could not assign the owner.'
        );
      } finally {
        setBusyFor(gap.id, false);
      }
    },
    [load]
  );

  const handleConfirmClass = useCallback(
    async (gap: MbaDataGap, gapClass: DataGapClass) => {
      setBusyFor(gap.id, true);
      try {
        await MbaDataGapService.confirmClass(gap.id, gapClass);
        await load();
        toast.success(
          gapClass === 'type_a_surface'
            ? 'Confirmed as a quick win — moved to the top.'
            : 'Type confirmed.'
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Could not confirm the type.'
        );
      } finally {
        setBusyFor(gap.id, false);
      }
    },
    [load]
  );

  const handleFindDuplicates = useCallback(async (gap: MbaDataGap) => {
    setDupsByGap((prev) => new Map(prev).set(gap.id, 'loading'));
    try {
      const dups = await MbaDataGapService.suggestDuplicates(gap.id);
      setDupsByGap((prev) => new Map(prev).set(gap.id, dups));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not check for duplicates.'
      );
      setDupsByGap((prev) => {
        const n = new Map(prev);
        n.delete(gap.id);
        return n;
      });
    }
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return gaps;
    // "Stalled" is a measured OUTCOME (accepted but its idea never shipped), not
    // a status — filter on gap_outcome for that view.
    if (statusFilter === 'stalled')
      return gaps.filter((g) => g.gap_outcome === 'accepted_stalled');
    return gaps.filter((g) => g.status === statusFilter);
  }, [gaps, statusFilter]);

  const stalledCount = useMemo(
    () => gaps.filter((g) => g.gap_outcome === 'accepted_stalled').length,
    [gaps]
  );

  const openCount = useMemo(
    () => gaps.filter((g) => OPEN_STATUSES.includes(g.status)).length,
    [gaps]
  );

  // Confirmed quick wins (a manager-confirmed type_a_surface) float to the top —
  // the fast-track. Stable sort keeps the AI priority order within each group.
  const sortedFiltered = useMemo(() => {
    const rank = (g: MbaDataGap) =>
      g.class_confirmed && g.gap_class === 'type_a_surface' ? 0 : 1;
    return [...filtered].sort((a, b) => rank(a) - rank(b));
  }, [filtered]);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/improvement-board">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Improvement Board
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FileWarning className="text-primary h-6 w-6" />
          Data Gaps
        </h1>
        <p className="text-muted-foreground mt-1">
          Gaps Associates reported from empty analytics pages. Accept one to turn
          it into an improvement idea on the board, or set it aside as not
          feasible or a duplicate.
        </p>
      </div>

      {/* Managers-only contributor scoreboard (ranked by real improvements) */}
      <ContributorScoreboard />

      {/* Summary + filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-muted-foreground text-sm">
          <span className="text-foreground font-semibold">{openCount}</span> open
          {' · '}
          {stalledCount > 0 && (
            <>
              <span className="font-semibold text-red-600">{stalledCount}</span>{' '}
              stalled{' · '}
            </>
          )}
          <span className="text-foreground font-semibold">{gaps.length}</span>{' '}
          total
        </div>
        <div className="w-44">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {gaps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FileWarning className="text-muted-foreground/50 h-10 w-10" />
            <div>
              <p className="font-medium">No data gaps yet</p>
              <p className="text-muted-foreground text-sm">
                When an Associate reports a gap from an empty analytics page, it
                will show up here to triage.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No data gaps match this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sortedFiltered.map((gap) => {
            const isBusy = busy.has(gap.id);
            const meta = STATUS_META[gap.status];
            const classMeta = gap.gap_class
              ? GAP_CLASS_META[gap.gap_class]
              : null;
            const canAct = OPEN_STATUSES.includes(gap.status);
            const isParked = gap.status === 'parked';
            const isQuickWin =
              gap.class_confirmed && gap.gap_class === 'type_a_surface';
            const dups = dupsByGap.get(gap.id);

            return (
              <Card
                key={gap.id}
                className={
                  isQuickWin ? 'border-emerald-300 bg-emerald-50/30' : undefined
                }
              >
                <CardContent className="space-y-3 p-4">
                  {/* Title row */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        {gap.priority_rank != null && (
                          <span
                            className="border-primary/30 bg-primary/10 text-primary mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums"
                            title="AI priority — lower is higher value to triage first"
                          >
                            #{gap.priority_rank}
                          </span>
                        )}
                        <p className="font-medium">{gap.title}</p>
                      </div>
                      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {gap.area_label ?? 'Department'}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{GAP_TYPE_LABEL[gap.gap_type]}</span>
                        <span aria-hidden>·</span>
                        <span>Filed by {gap.filer_name ?? 'an Associate'}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge variant="outline" className={`text-xs ${meta.className}`}>
                        {meta.label}
                      </Badge>
                      {classMeta && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${classMeta.className}`}
                        >
                          {classMeta.label}
                        </Badge>
                      )}
                      {gap.gap_outcome === 'accepted_stalled' && (
                        <Badge
                          variant="outline"
                          className="border-red-200 bg-red-50 text-xs text-red-700"
                          title="Accepted but its improvement idea hasn't shipped in over 30 days — worth chasing"
                        >
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Stalled
                        </Badge>
                      )}
                      {isQuickWin && (
                        <Badge
                          variant="outline"
                          className="border-emerald-300 bg-emerald-50 text-xs text-emerald-700"
                          title="A manager confirmed this is a quick win (data already exists) — fast-tracked to the top"
                        >
                          <Zap className="mr-1 h-3 w-3" />
                          Quick win
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* AI priority reason (why it ranks where it does) */}
                  {gap.priority_reason && (
                    <p className="text-muted-foreground text-xs italic">
                      {gap.priority_reason}
                    </p>
                  )}

                  {/* Detail */}
                  <div className="space-y-1.5 text-sm">
                    <p>
                      <span className="text-muted-foreground">Missing: </span>
                      {gap.what_missing}
                    </p>
                    {gap.what_analysis && (
                      <p>
                        <span className="text-muted-foreground">Analysis: </span>
                        {gap.what_analysis}
                      </p>
                    )}
                    {gap.what_decision && (
                      <p>
                        <span className="text-muted-foreground">Decision: </span>
                        {gap.what_decision}
                      </p>
                    )}
                    {gap.candidate_source && (
                      <p>
                        <span className="text-muted-foreground">
                          Might live in:{' '}
                        </span>
                        {gap.candidate_source}
                      </p>
                    )}
                  </div>

                  {/* Manager tools: confirm type · owner · duplicates */}
                  {(canAct || gap.status === 'accepted') && (
                    <div className="space-y-2 border-t pt-2">
                      {/* Confirm / change the AI Type A/B (only while actionable) */}
                      {gap.gap_class && !gap.class_confirmed && canAct && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground">
                            AI type — confirm or change:
                          </span>
                          <div className="w-56">
                            <Select
                              value={gap.gap_class}
                              onValueChange={(v) =>
                                handleConfirmClass(gap, v as DataGapClass)
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="type_a_surface">
                                  Data exists — surface it (quick win)
                                </SelectItem>
                                <SelectItem value="type_b_capture">
                                  Not captured — build it
                                </SelectItem>
                                <SelectItem value="uncertain">
                                  Needs a closer look
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={isBusy}
                            onClick={() => handleConfirmClass(gap, gap.gap_class!)}
                          >
                            Confirm
                          </Button>
                        </div>
                      )}
                      {gap.class_confirmed && (
                        <p className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <Check className="h-3.5 w-3.5" />
                          Type confirmed
                          {isQuickWin ? ' — fast-tracked as a quick win' : ''}
                        </p>
                      )}

                      {/* Owner */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground inline-flex items-center gap-1">
                          <UserRound className="h-3.5 w-3.5" />
                          Owner:
                        </span>
                        {gap.owner_name ? (
                          <span className="font-medium">{gap.owner_name}</span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            unassigned (shared board)
                          </span>
                        )}
                        {!ownerEditing.has(gap.id) ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              disabled={isBusy}
                              onClick={() => toggleOwnerEditing(gap.id)}
                            >
                              {gap.owner_id ? 'Change' : 'Assign'}
                            </Button>
                            {gap.owner_id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground h-6 px-2"
                                disabled={isBusy}
                                onClick={() => handleAssignOwner(gap, null)}
                              >
                                Clear
                              </Button>
                            )}
                          </>
                        ) : (
                          <div className="flex w-full items-center gap-2 pt-1">
                            <div className="w-72">
                              <MemberPicker
                                onSelect={(m) => handleAssignOwner(gap, m.id)}
                                placeholder="Search team members by name or email…"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              onClick={() => toggleOwnerEditing(gap.id)}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Duplicate suggestions (very-similar look-alikes) */}
                      {canAct && (
                        <div className="text-xs">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            disabled={dups === 'loading'}
                            onClick={() => handleFindDuplicates(gap)}
                          >
                            <Search className="mr-1 h-3.5 w-3.5" />
                            Check for duplicates
                          </Button>
                          {dups === 'loading' && (
                            <span className="text-muted-foreground ml-2">Checking…</span>
                          )}
                          {Array.isArray(dups) &&
                            (dups.length === 0 ? (
                              <span className="text-muted-foreground ml-2">
                                No likely duplicates.
                              </span>
                            ) : (
                              <div className="bg-muted/30 mt-1 space-y-1 rounded-md border p-2">
                                <p className="text-muted-foreground">
                                  Very similar gaps in this department:
                                </p>
                                {dups.map((d) => (
                                  <div key={d.id} className="truncate">
                                    {d.title}{' '}
                                    <span className="text-muted-foreground">
                                      · {Math.round(d.similarity * 100)}% match ·{' '}
                                      {d.status}
                                    </span>
                                  </div>
                                ))}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-1 h-7"
                                  disabled={isBusy}
                                  onClick={() => handleTriage(gap, 'duplicate')}
                                >
                                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                                  Mark THIS gap as a duplicate
                                </Button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions / resolution */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {isBusy && (
                      <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                    )}
                    {canAct ? (
                      <>
                        <Button
                          size="sm"
                          disabled={isBusy}
                          onClick={() => handleTriage(gap, 'accepted')}
                        >
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleTriage(gap, 'parked')}
                          title="Set aside for later — keep it on the someday wishlist without accepting or rejecting it"
                        >
                          <Clock className="mr-1.5 h-4 w-4" />
                          Later
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleTriage(gap, 'not_feasible')}
                        >
                          <XCircle className="mr-1.5 h-4 w-4" />
                          Not feasible
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleTriage(gap, 'duplicate')}
                        >
                          <Copy className="mr-1.5 h-4 w-4" />
                          Duplicate
                        </Button>
                      </>
                    ) : isParked ? (
                      <>
                        <span className="text-muted-foreground text-xs">
                          On the someday wishlist
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleTriage(gap, 'triaged')}
                          title="Bring this back into the live triage queue"
                        >
                          <Undo2 className="mr-1.5 h-4 w-4" />
                          Reconsider
                        </Button>
                      </>
                    ) : (
                      gap.linked_idea_id && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/improvement-board">
                            <ArrowUpRight className="mr-1.5 h-4 w-4" />
                            View linked idea on the board
                          </Link>
                        </Button>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
