'use client';

/**
 * Department owners — one accountable person per improvement board.
 *
 * TWO TIERS, and they are not the same permission:
 *
 *   SEE the list      improvement.board.manage OR improvement.area_role.assign
 *   CHANGE an owner   improvement.area_role.assign ONLY
 *
 * The split is the Director's standing governance rule (2026-07-28): naming a
 * holder is an officer action — CEO / CAO / EAO — because the row it writes is
 * institution-wide org data. A board manager therefore gets the same table
 * rendered read-only rather than a control the server would refuse; the RPC
 * raises "requires improvement.area_role.assign (CEO / CAO / EAO)" for them,
 * so the read-only rendering is a courtesy over a real server-side guard, not
 * the guard itself.
 *
 * Anyone else gets an explicit panel naming who to ask — never a blank page and
 * never a silent redirect (CLAUDE.md #27). Gating branches on the loading state
 * FIRST, otherwise `can()` reads false while permissions resolve and an officer
 * sees a no-access flash.
 *
 * THIS SCREEN WRITES REAL INSTITUTION-WIDE DATA. There is no draft mode: the
 * moment an officer saves, the assignment exists in `hr_additional_roles` for
 * everyone, and two dormant behaviours start firing off it — the gemba
 * "self-recorded" marker, and a department seeing findings raised about itself.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  ShieldAlert,
  ArrowLeft,
  Loader2,
  UserCheck,
  UserX,
  Eye,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  DepartmentOwnerService,
  type DepartmentOwnerRow
} from '@/lib/services/improvement/department-owner-service';
import {
  PersonPicker,
  type PickedPerson
} from '../../analytics/_components/person-picker';

/* -------------------------------------------------------------------------- */
/* Panels                                                                     */
/* -------------------------------------------------------------------------- */

function NoAccessPanel() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <ShieldAlert className="text-muted-foreground/50 h-10 w-10" />
        <div className="max-w-md">
          <p className="font-medium">You don&apos;t have access to this page</p>
          <p className="text-muted-foreground text-sm">
            Seeing who owns each department needs either the &ldquo;Manage
            Improvement Board&rdquo; permission or the officer permission that
            assigns department role holders. Ask an Improvement Board manager,
            or one of the officers who assign holders — the CEO, the CAO or the
            Executive Admin Officer.
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

export function DepartmentOwnersClient() {
  const { can, isLoading: permsLoading } = usePermissions();

  // Branch on loading FIRST — `can()` returns false until permissions resolve.
  if (permsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const canAssign = can('improvement.area_role.assign');
  const canSee = canAssign || can('improvement.board.manage');

  if (!canSee) return <NoAccessPanel />;

  return <DepartmentOwners canAssign={canAssign} />;
}

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

const EMPTY_PICK: PickedPerson = { name: '', staffId: null };

function DepartmentOwners({ canAssign }: { canAssign: boolean }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<DepartmentOwnerRow[]>([]);
  /** The officer's in-progress pick per department, keyed by area id. */
  const [drafts, setDrafts] = useState<Record<string, PickedPerson>>({});
  const [busyAreaId, setBusyAreaId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const fresh = await DepartmentOwnerService.listDepartmentsWithOwners();
    setRows(fresh);
    // Reset every draft to what the server just said, so a saved row stops
    // looking edited and a failed save cannot leave a stale pick on screen.
    setDrafts(
      Object.fromEntries(
        fresh.map((row) => [
          row.areaId,
          row.ownerName
            ? { name: row.ownerName, staffId: row.ownerStaffId }
            : EMPTY_PICK
        ])
      )
    );
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await load();
      setLoadError(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load the departments and their owners.';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
        if (alive) setLoadError(null);
      } catch (err) {
        if (!alive) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to load the departments and their owners.';
        setLoadError(message);
        toast.error(message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const ownedCount = useMemo(
    () => rows.filter((row) => row.ownerName).length,
    [rows]
  );

  /* --- actions ----------------------------------------------------------- */

  const saveOwner = async (row: DepartmentOwnerRow) => {
    if (busyAreaId) return;
    const pick = drafts[row.areaId] ?? EMPTY_PICK;
    const typed = pick.name.trim();
    if (!pick.staffId && !typed) {
      toast.error(
        `Pick someone for ${row.areaLabel} first, or use Remove to leave it unowned.`
      );
      return;
    }

    setBusyAreaId(row.areaId);
    try {
      await DepartmentOwnerService.setOwner(row.areaId, pick.staffId, typed);
      toast.success(
        row.ownerName
          ? `${row.areaLabel} handed over to ${typed || 'the new owner'}.`
          : `${typed || 'An owner'} now owns ${row.areaLabel}.`
      );
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Couldn't save the owner of ${row.areaLabel}.`
      );
    } finally {
      setBusyAreaId(null);
    }
  };

  const removeOwner = async (row: DepartmentOwnerRow) => {
    if (busyAreaId) return;
    setBusyAreaId(row.areaId);
    try {
      const ended = await DepartmentOwnerService.clearOwner(row.areaId);
      toast.success(
        ended > 0
          ? `${row.areaLabel} has no owner now — the previous assignment was end-dated, not deleted.`
          : `${row.areaLabel} already had no owner.`
      );
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Couldn't remove the owner of ${row.areaLabel}.`
      );
    } finally {
      setBusyAreaId(null);
    }
  };

  const setDraft = useCallback((areaId: string, next: PickedPerson) => {
    setDrafts((prev) => ({ ...prev, [areaId]: next }));
  }, []);

  /* --- render ------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <AlertCircle className="text-destructive/60 h-10 w-10" />
          <div className="max-w-md">
            <p className="font-medium">
              Couldn&apos;t load the departments and their owners
            </p>
            <p className="text-muted-foreground text-sm">{loadError}</p>
            <p className="text-muted-foreground mt-2 text-sm">
              Nothing on this page has been changed. An empty list would look
              the same as &ldquo;nobody owns anything&rdquo;, so it is not shown
              until the read succeeds.
            </p>
          </div>
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Headline count — the gap is the point of the page. */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-lg font-semibold">
              {ownedCount} of {rows.length}{' '}
              {rows.length === 1 ? 'department has' : 'departments have'} an
              owner
            </p>
            <p className="text-muted-foreground max-w-2xl text-sm">
              An owner is the one person accountable for a department on the
              Improvement Board. Naming one lets that person record a visit to
              their own department, and lets the department see findings raised
              about it.
            </p>
          </div>
          <Badge variant={ownedCount === rows.length ? 'default' : 'secondary'}>
            {rows.length - ownedCount} still unowned
          </Badge>
        </CardContent>
      </Card>

      {/* A board manager may look, but may not change anything. Say so once, */}
      {/* up front, rather than showing a control the server would refuse.    */}
      {!canAssign && (
        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <Eye className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-muted-foreground text-sm">
              You can see who owns each department, but only an officer can
              change it — the CEO, the CAO or the Executive Admin Officer. Ask
              one of them to name an owner.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%]">Department</TableHead>
                  <TableHead className="w-[32%]">Owner</TableHead>
                  {canAssign && <TableHead>Name an owner</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const pick = drafts[row.areaId] ?? EMPTY_PICK;
                  const busy = busyAreaId === row.areaId;
                  const unchanged =
                    pick.name.trim() === (row.ownerName ?? '') &&
                    (pick.staffId ?? null) === row.ownerStaffId;

                  return (
                    <TableRow key={row.areaId}>
                      <TableCell className="align-top font-medium">
                        {row.areaLabel}
                      </TableCell>

                      <TableCell className="align-top">
                        {row.ownerName ? (
                          <span className="flex flex-col">
                            <span className="flex items-center gap-1.5">
                              <UserCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span className="text-sm">{row.ownerName}</span>
                            </span>
                            {row.ownerEmail && (
                              <span className="text-muted-foreground pl-5 text-xs">
                                {row.ownerEmail}
                              </span>
                            )}
                            {!row.ownerStaffId && (
                              <span className="text-muted-foreground pl-5 text-xs">
                                Typed in — not linked to a MyJKKN record.
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                            <UserX className="h-3.5 w-3.5 shrink-0" />
                            No owner yet
                          </span>
                        )}
                      </TableCell>

                      {canAssign && (
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-2">
                            <PersonPicker
                              areaId={row.areaId}
                              value={pick}
                              onChange={(next) => setDraft(row.areaId, next)}
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                disabled={busy || unchanged}
                                onClick={() => void saveOwner(row)}
                              >
                                {busy && (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                )}
                                {row.ownerName ? 'Replace owner' : 'Save owner'}
                              </Button>
                              {row.ownerName && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => void removeOwner(row)}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {canAssign && (
        <p className="text-muted-foreground text-xs">
          Saving writes a real, institution-wide assignment straight away —
          there is no draft step. Replacing an owner records a handover: the
          previous assignment is end-dated and kept, never deleted.
        </p>
      )}
    </div>
  );
}
