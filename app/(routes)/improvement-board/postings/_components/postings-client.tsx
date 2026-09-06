'use client';

/**
 * MBA Analyst Assignments — client.
 * Manager-only (improvement.board.manage) surface to decide which MBA
 * Associate covers which department (improvement_area). Multi-assign: an
 * associate can hold several departments. Writes go through
 * MbaAnalystService.assignPosting / removePosting (never raw table calls).
 *
 * Gating branches on the loading state FIRST so a manager never sees a
 * denied-looking flash while permissions resolve, and a denied user gets an
 * explicit reason instead of a silent redirect (CLAUDE.md #27).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Users,
  ShieldAlert,
  Plus,
  X,
  Search,
  Building2,
  ArrowLeft,
  Loader2,
  IndianRupee
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ImprovementService,
  type ImprovementArea
} from '@/lib/services/improvement/improvement-service';
import {
  MbaAnalystService,
  type MbaAssociatePostingView,
  type MbaAssociateLite
} from '@/lib/services/mba-analyst/mba-analyst-service';

/** Loading skeleton reused by both the permission-resolving and data-loading
 *  states so the page never flashes empty. */
function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96" />
      <div className="grid gap-3 pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Explicit no-access panel — never a silent bounce to the dashboard. */
function NoAccessPanel() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <ShieldAlert className="text-muted-foreground/50 h-10 w-10" />
        <div>
          <p className="font-medium">You don&apos;t have access to this page</p>
          <p className="text-muted-foreground text-sm">
            Managing MBA Analyst assignments needs the &ldquo;Manage Improvement
            Board&rdquo; permission. Ask an Improvement Board manager if you need
            access.
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

export function PostingsClient() {
  const { can, isLoading: permsLoading } = usePermissions();

  // Branch on loading FIRST — otherwise `can()` reads false while perms load
  // and a manager sees the no-access panel flash.
  if (permsLoading) return <LoadingState />;
  if (!can('improvement.board.manage')) return <NoAccessPanel />;

  return <PostingsBoard />;
}

function PostingsBoard() {
  const [loading, setLoading] = useState(true);
  const [associates, setAssociates] = useState<MbaAssociateLite[]>([]);
  const [areas, setAreas] = useState<ImprovementArea[]>([]);
  const [postings, setPostings] = useState<MbaAssociatePostingView[]>([]);
  const [search, setSearch] = useState('');
  // Keyed by `${associateUserId}` while a mutation for that associate is in
  // flight, so its controls disable without freezing the whole page.
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    // listAssociates() goes through the manager-gated SECDEF RPC
    // (fn_mba_list_associates) — never a direct user_roles read, which RLS
    // self-scopes and would silently truncate the picker for a non-admin
    // board manager.
    const [nextAssociates, nextAreas, nextPostings] = await Promise.all([
      MbaAnalystService.listAssociates(),
      ImprovementService.listAreas(),
      MbaAnalystService.listPostings()
    ]);
    setAssociates(nextAssociates);
    setAreas(nextAreas);
    setPostings(nextPostings);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (err) {
        // The RPC-backed reads throw on failure; degrade to the empty state
        // with a toast rather than an unhandled rejection.
        if (alive)
          toast.error(
            err instanceof Error ? err.message : 'Could not load assignments.'
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

  const refreshPostings = useCallback(async () => {
    const next = await MbaAnalystService.listPostings();
    setPostings(next);
  }, []);

  const handleAssign = useCallback(
    async (associateUserId: string, areaId: string, areaLabel: string) => {
      setBusyFor(associateUserId, true);
      try {
        await MbaAnalystService.assignPosting(associateUserId, areaId);
        await refreshPostings();
        toast.success(`Assigned to ${areaLabel}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Could not assign the department.'
        );
      } finally {
        setBusyFor(associateUserId, false);
      }
    },
    [refreshPostings]
  );

  const handleRemove = useCallback(
    async (posting: MbaAssociatePostingView) => {
      setBusyFor(posting.associate_user_id, true);
      try {
        await MbaAnalystService.removePosting(posting.id);
        await refreshPostings();
        toast.success(`Removed ${posting.area_label ?? 'department'}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Could not remove the assignment.'
        );
      } finally {
        setBusyFor(posting.associate_user_id, false);
      }
    },
    [refreshPostings]
  );

  const handleToggleFinancial = useCallback(
    async (posting: MbaAssociatePostingView, next: boolean) => {
      setBusyFor(posting.associate_user_id, true);
      try {
        await MbaAnalystService.setPostingFinancial(posting.id, next);
        await refreshPostings();
        const label = posting.area_label ?? 'department';
        toast.success(
          next
            ? `Financial views on for ${label}`
            : `Financial views off for ${label}`
        );
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Could not update financial access.'
        );
      } finally {
        setBusyFor(posting.associate_user_id, false);
      }
    },
    [refreshPostings]
  );

  // area_id -> label for chip rendering when a posting hasn't been enriched.
  const areaLabelById = useMemo(
    () => new Map(areas.map((a) => [a.id, a.label])),
    [areas]
  );

  const postingsByAssociate = useMemo(() => {
    const map = new Map<string, MbaAssociatePostingView[]>();
    for (const p of postings) {
      const list = map.get(p.associate_user_id) ?? [];
      list.push(p);
      map.set(p.associate_user_id, list);
    }
    return map;
  }, [postings]);

  const filteredAssociates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return associates;
    return associates.filter(
      (a) =>
        (a.name ?? '').toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q)
    );
  }, [associates, search]);

  const assignedCount = useMemo(
    () => new Set(postings.map((p) => p.associate_user_id)).size,
    [postings]
  );

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
          <Users className="text-primary h-6 w-6" />
          MBA Analyst Assignments
        </h1>
        <p className="text-muted-foreground mt-1">
          Decide which MBA Associate covers which department. An associate can
          cover more than one department.
        </p>
      </div>

      {/* Summary */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-foreground font-semibold">{associates.length}</span>{' '}
          MBA Associates
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="text-foreground font-semibold">{areas.length}</span>{' '}
          departments
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="text-foreground font-semibold">{assignedCount}</span> of{' '}
          {associates.length} assigned
        </span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search an associate by name or email…"
          className="pl-9"
        />
      </div>

      {/* Associates */}
      {associates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Users className="text-muted-foreground/50 h-10 w-10" />
            <div>
              <p className="font-medium">No MBA Associates yet</p>
              <p className="text-muted-foreground text-sm">
                The MBA Associate list is kept in sync automatically each day.
                Once associates are on the roster, they&apos;ll appear here to
                assign.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : filteredAssociates.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No associate matches &ldquo;{search}&rdquo;.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredAssociates.map((assoc) => {
            const held = postingsByAssociate.get(assoc.user_id) ?? [];
            const heldAreaIds = new Set(held.map((p) => p.area_id));
            const available = areas.filter((a) => !heldAreaIds.has(a.id));
            const isBusy = busy.has(assoc.user_id);

            return (
              <Card key={assoc.user_id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  {/* Identity + current departments */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {assoc.name || 'Unnamed associate'}
                      </p>
                      {assoc.email && (
                        <p className="text-muted-foreground truncate text-xs">
                          {assoc.email}
                        </p>
                      )}
                    </div>

                    {held.length === 0 ? (
                      <p className="text-muted-foreground text-xs italic">
                        No department assigned yet
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {held.map((p) => {
                          const label =
                            p.area_label ??
                            areaLabelById.get(p.area_id) ??
                            'Department';
                          return (
                            <div
                              key={p.id}
                              className="bg-muted/40 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md px-2.5 py-1.5"
                            >
                              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                <Building2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                                <span className="truncate text-sm font-medium">
                                  {label}
                                </span>
                              </span>
                              {/* Per-assignment money gate. Default off — the
                                  associate only sees this department's financial
                                  views while this is on. */}
                              <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
                                <IndianRupee
                                  className={`h-3.5 w-3.5 ${
                                    p.include_financial ? 'text-primary' : ''
                                  }`}
                                />
                                Show financial views
                                <Switch
                                  checked={p.include_financial}
                                  disabled={isBusy}
                                  onCheckedChange={(next) =>
                                    handleToggleFinancial(p, next)
                                  }
                                  aria-label={`Show financial views for ${label}`}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => handleRemove(p)}
                                disabled={isBusy}
                                aria-label={`Remove ${label}`}
                                className="hover:bg-muted-foreground/20 shrink-0 rounded-full p-1 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Add-department control */}
                  <div className="flex shrink-0 items-center gap-2">
                    {isBusy && (
                      <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                    )}
                    {available.length === 0 ? (
                      <span className="text-muted-foreground text-xs">
                        All departments assigned
                      </span>
                    ) : (
                      <Select
                        value=""
                        disabled={isBusy}
                        onValueChange={(areaId) => {
                          const area = areas.find((a) => a.id === areaId);
                          if (area)
                            handleAssign(assoc.user_id, area.id, area.label);
                        }}
                      >
                        <SelectTrigger className="w-52">
                          <span className="flex items-center gap-1.5">
                            <Plus className="h-4 w-4" />
                            <SelectValue placeholder="Add department" />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {available.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
