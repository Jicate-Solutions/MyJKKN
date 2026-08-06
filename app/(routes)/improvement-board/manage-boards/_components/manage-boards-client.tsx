'use client';

/**
 * Manage boards — the Improvement Board's own configuration screen.
 * Manager-only (improvement.board.manage). Add a board, rename it, re-describe
 * it, move it up or down the picker, switch it on or off, and — only where it
 * is safe — delete it.
 *
 * Two rules the screen exists to make legible:
 *
 *   1. The 14 built-in boards can be renamed, moved and switched off, but never
 *      deleted. The server refuses; this screen simply does not offer it.
 *   2. Deleting a board that has work attached would destroy that work, because
 *      seven of the eight foreign keys pointing at a board CASCADE. So the
 *      delete confirmation lists exactly what is attached, and when anything is
 *      attached the only action offered is "switch off" — which hides the board
 *      everywhere and can be undone.
 *   3. Switching a board off is safe but not invisible in its effects: the board
 *      disappears from every picker while everything filed against it stays,
 *      including the people recorded as CURRENT holders of a role on it. So a
 *      switch-off now reads what is attached (fresh, at that moment) and names
 *      it before proceeding. It is a WARNING, not a block — the manager can go
 *      ahead, nobody's role is ended, and switching back on restores the lot.
 *
 * Gating branches on the loading state FIRST so a manager never sees a
 * denied-looking flash while permissions resolve, and a denied user gets an
 * explicit reason instead of a silent redirect (CLAUDE.md #27).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel
} from '@/components/ui/alert-dialog';
import {
  LayoutGrid,
  ShieldAlert,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Lock,
  Loader2,
  AlertTriangle,
  EyeOff
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ImprovementAreaService,
  dependentBreakdown,
  describeDependants,
  joinWithAnd,
  type AreaDependants,
  type ManagedImprovementArea
} from '@/lib/services/improvement/improvement-area-service';
import { BoardFormDialog } from './board-form-dialog';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

function NoAccessPanel() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <ShieldAlert className="text-muted-foreground/50 h-10 w-10" />
        <div>
          <p className="font-medium">You don&apos;t have access to this page</p>
          <p className="text-muted-foreground text-sm">
            Managing boards needs the &ldquo;Manage Improvement Board&rdquo;
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

export function ManageBoardsClient() {
  const { can, isLoading: permsLoading } = usePermissions();

  // Branch on loading FIRST — otherwise `can()` reads false while perms load
  // and a manager sees the no-access panel flash.
  if (permsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (!can('improvement.board.manage')) return <NoAccessPanel />;

  return <ManageBoards />;
}

/* -------------------------------------------------------------------------- */
/* Board list                                                                 */
/* -------------------------------------------------------------------------- */

function ManageBoards() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [areas, setAreas] = useState<ManagedImprovementArea[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedImprovementArea | null>(null);
  const [confirmTarget, setConfirmTarget] =
    useState<ManagedImprovementArea | null>(null);
  /** Set while a switch-off is waiting on the manager to read the warning. */
  const [switchOffTarget, setSwitchOffTarget] = useState<{
    area: ManagedImprovementArea;
    dependants: AreaDependants;
  } | null>(null);
  /** The board whose attached work is being read right now. */
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await ImprovementAreaService.listForManagement();
    setAreas(rows);
  }, []);

  const refresh = useCallback(async () => {
    try {
      await load();
      setLoadError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load the boards.';
      setLoadError(message);
      toast.error(message);
    }
  }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const rows = await ImprovementAreaService.listForManagement();
        if (alive) {
          setAreas(rows);
          setLoadError(null);
        }
      } catch (err) {
        if (alive) {
          const message =
            err instanceof Error ? err.message : 'Failed to load the boards.';
          setLoadError(message);
          toast.error(message);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const activeCount = useMemo(
    () => areas.filter((a) => a.is_active).length,
    [areas]
  );

  /* --- actions ----------------------------------------------------------- */

  /**
   * Actually flip the switch. Everything that reaches here has either nothing
   * attached or an explicit confirmation behind it.
   */
  const applyToggleActive = async (
    area: ManagedImprovementArea,
    next: boolean
  ) => {
    if (busyId) return;
    setBusyId(area.id);
    // Optimistic — reverted from the server on refresh if the call fails.
    setAreas((prev) =>
      prev.map((a) => (a.id === area.id ? { ...a, is_active: next } : a))
    );
    try {
      await ImprovementAreaService.setActive(area, next);
      toast.success(
        next
          ? `"${area.label}" is back on the board.`
          : `"${area.label}" switched off — it is hidden from every picker, and nothing filed against it was deleted.`
      );
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update the board.'
      );
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  /**
   * The switch itself. Turning a board ON needs no warning — nothing is hidden
   * by it. Turning one OFF reads what is attached FIRST (fresh from the server,
   * not from the list loaded when the page opened) and, if anything is, names
   * it and waits for the manager to confirm.
   *
   * If that read fails we stop rather than switch off blind: the whole point is
   * that this never happens silently. The error is surfaced, never swallowed.
   */
  const handleToggleActive = async (
    area: ManagedImprovementArea,
    next: boolean
  ) => {
    if (busyId || checkingId) return;
    if (next) {
      await applyToggleActive(area, true);
      return;
    }

    setCheckingId(area.id);
    try {
      const dependants = await ImprovementAreaService.fetchDependants(area.id);
      if (dependants.dependent_count === 0) {
        await applyToggleActive(area, false);
        return;
      }
      setSwitchOffTarget({ area, dependants });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to check what is attached to this board.'
      );
    } finally {
      setCheckingId(null);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (reordering || target < 0 || target >= areas.length) return;

    const next = areas.slice();
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);

    const previous = areas;
    setAreas(next);
    setReordering(true);
    try {
      await ImprovementAreaService.reorder(next.map((a) => a.id));
      await refresh();
    } catch (err) {
      setAreas(previous);
      toast.error(
        err instanceof Error ? err.message : 'Failed to save the new order.'
      );
    } finally {
      setReordering(false);
    }
  };

  const handleDelete = async (area: ManagedImprovementArea) => {
    setBusyId(area.id);
    try {
      await ImprovementAreaService.deleteArea(area.id);
      toast.success(`"${area.label}" deleted.`);
      setConfirmTarget(null);
      await refresh();
    } catch (err) {
      // The server message names exactly what is blocking the delete — show it.
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete the board.'
      );
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  /* --- render ------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <LayoutGrid className="text-primary h-6 w-6" />
            Manage boards
          </h1>
          <p className="text-muted-foreground mt-1">
            The areas ideas can be filed against. {activeCount} of{' '}
            {areas.length} switched on.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/improvement-board">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to the board
            </Link>
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add a board
          </Button>
        </div>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Couldn&apos;t load the boards
              </p>
              <p className="text-sm text-red-700">{loadError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {areas.length === 0 && !loadError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <LayoutGrid className="text-muted-foreground/50 h-10 w-10" />
            <div>
              <p className="font-medium">No boards yet</p>
              <p className="text-muted-foreground text-sm">
                Add the first area of the institution that ideas can be filed
                against.
              </p>
            </div>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add a board
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {areas.map((area, index) => {
            const attached = dependentBreakdown(area);
            const busy = busyId === area.id || checkingId === area.id;
            const canDelete = !area.is_system && area.dependent_count === 0;

            return (
              <Card key={area.id} className={area.is_active ? '' : 'opacity-70'}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                  {/* Re-order */}
                  <div className="flex shrink-0 flex-row gap-1 sm:flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={reordering || index === 0}
                      onClick={() => handleMove(index, -1)}
                      aria-label={`Move ${area.label} up`}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={reordering || index === areas.length - 1}
                      onClick={() => handleMove(index, 1)}
                      aria-label={`Move ${area.label} down`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Detail */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{area.label}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {area.key}
                      </Badge>
                      {area.is_system && (
                        <Badge
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-xs text-blue-700"
                        >
                          <Lock className="mr-1 h-3 w-3" />
                          Built-in
                        </Badge>
                      )}
                      {!area.is_active && (
                        <Badge variant="secondary" className="text-xs">
                          <EyeOff className="mr-1 h-3 w-3" />
                          Switched off
                        </Badge>
                      )}
                    </div>

                    {area.description && (
                      <p className="text-muted-foreground text-sm">
                        {area.description}
                      </p>
                    )}

                    <p className="text-muted-foreground text-xs">
                      {attached.length === 0
                        ? 'Nothing filed against this board yet.'
                        : attached
                            .map((d) => plural(d.count, d.label))
                            .join(' · ')}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex items-center gap-2 pr-1">
                      <Switch
                        checked={area.is_active}
                        disabled={busy}
                        onCheckedChange={(v) => handleToggleActive(area, v)}
                        aria-label={`Switch ${area.label} ${area.is_active ? 'off' : 'on'}`}
                      />
                      <span className="text-muted-foreground text-xs">
                        {area.is_active ? 'On' : 'Off'}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setEditing(area);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>

                    {!area.is_system && (
                      <Button
                        variant="outline"
                        size="sm"
                        className={
                          canDelete
                            ? 'border-red-200 text-red-700 hover:bg-red-50'
                            : ''
                        }
                        disabled={busy}
                        onClick={() => setConfirmTarget(area)}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        <span className="sr-only">Delete {area.label}</span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BoardFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        area={editing}
        onSaved={refresh}
      />

      {/* Delete confirmation — explains precisely what would happen. */}
      <AlertDialog
        open={!!confirmTarget}
        onOpenChange={(o) => {
          if (!o) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          {confirmTarget &&
            (() => {
              const attached = dependentBreakdown(confirmTarget);
              const blocked = attached.length > 0;
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {blocked
                        ? `"${confirmTarget.label}" can't be deleted`
                        : `Delete "${confirmTarget.label}"?`}
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3">
                        {blocked ? (
                          <>
                            <p>
                              Work is already filed against this board, so it
                              cannot be deleted — deleting it would destroy that
                              work, and the server refuses rather than allow
                              that. What is attached:
                            </p>
                            <ul className="list-inside list-disc space-y-0.5">
                              {attached.map((d) => (
                                <li key={d.label}>{plural(d.count, d.label)}</li>
                              ))}
                            </ul>
                            <p>
                              Switch the board off instead. It disappears from
                              every picker, everything filed against it is kept,
                              and you can switch it back on at any time.
                            </p>
                          </>
                        ) : (
                          <p>
                            Nothing is filed against this board, so deleting it
                            removes only the board itself. This cannot be undone.
                            If you might want it back later, switch it off
                            instead.
                          </p>
                        )}
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={busyId === confirmTarget.id}>
                      Cancel
                    </AlertDialogCancel>
                    {blocked ? (
                      confirmTarget.is_active && (
                        <AlertDialogAction
                          disabled={busyId === confirmTarget.id}
                          onClick={async () => {
                            // Straight to the switch — this dialog has just
                            // listed what is attached and the manager chose
                            // switching off over deleting. Re-running the
                            // switch-off warning here would ask the same
                            // question twice, and stacking a second dialog on
                            // a closing one is a Radix race.
                            const target = confirmTarget;
                            setConfirmTarget(null);
                            await applyToggleActive(target, false);
                          }}
                        >
                          <EyeOff className="mr-2 h-4 w-4" />
                          Switch it off instead
                        </AlertDialogAction>
                      )
                    ) : (
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        disabled={busyId === confirmTarget.id}
                        onClick={(e) => {
                          e.preventDefault();
                          handleDelete(confirmTarget);
                        }}
                      >
                        {busyId === confirmTarget.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          <>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete board
                          </>
                        )}
                      </AlertDialogAction>
                    )}
                  </AlertDialogFooter>
                </>
              );
            })()}
        </AlertDialogContent>
      </AlertDialog>

      {/*
        Switch-off warning — a WARNING, not a block. It names what is attached
        (read fresh a moment ago, role holders first) and says plainly that the
        work is kept and the switch is reversible. Switching a board back ON
        never opens this.
      */}
      <AlertDialog
        open={!!switchOffTarget}
        onOpenChange={(o) => {
          if (!o) setSwitchOffTarget(null);
        }}
      >
        <AlertDialogContent>
          {switchOffTarget &&
            (() => {
              const { area, dependants } = switchOffTarget;
              const attached = joinWithAnd(describeDependants(dependants));
              const saving = busyId === area.id;
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Switch &ldquo;{area.label}&rdquo; off?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3">
                        <p>
                          {attached
                            ? `This board has ${attached} attached to it.`
                            : 'This board has work attached to it.'}
                        </p>
                        <p>
                          Switching it off hides the board everywhere — it stops
                          appearing in every picker and on the Improvement Board
                          itself. Nothing is deleted: all of that work is kept,
                          and everyone holding a role on this board stays
                          recorded as its current holder.
                        </p>
                        <p>
                          You can switch it back on at any time and the board
                          returns exactly as it is now.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={saving}>
                      Keep it on
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={saving}
                      onClick={async (e) => {
                        // Hold the dialog open until the switch has actually
                        // been saved, so a slow call can't look like a no-op.
                        e.preventDefault();
                        await applyToggleActive(area, false);
                        setSwitchOffTarget(null);
                      }}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Switching off…
                        </>
                      ) : (
                        <>
                          <EyeOff className="mr-2 h-4 w-4" />
                          Switch it off
                        </>
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
