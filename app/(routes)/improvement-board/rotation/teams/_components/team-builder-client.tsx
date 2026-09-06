'use client';

/**
 * Team Rotation — team builder (client).
 * Manager-only (improvement.board.manage). Build teams by hand: create a team,
 * add/remove members, (de)activate or delete a team.
 *
 * PHASE 3 — cohort-generic: a team belongs to ONE teaching-enterprise cohort,
 * chosen on creation, and its member picker only offers THAT cohort's learners.
 * The picker is backed by the manager-gated SECDEF pickers (via
 * MbaAnalystService.listAssociates) — never a raw user_roles read, which RLS
 * self-scopes and would silently truncate the list. When the Phase-3 migration
 * is not applied yet the cohort chooser is hidden and everything behaves exactly
 * as before (single MBA cohort).
 *
 * Gating branches on the loading state FIRST (CLAUDE.md #27).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  ShieldAlert,
  Plus,
  X,
  ArrowLeft,
  Loader2,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  MbaAnalystService,
  type MbaAssociateLite,
} from '@/lib/services/mba-analyst/mba-analyst-service';
import {
  MbaRotationService,
  DEFAULT_COHORT_KEY,
  type MbaTeam,
  type TeachingCohortOption,
} from '@/lib/services/mba-rotation/mba-rotation-service';

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96" />
      <div className="grid gap-3 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
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
            Building teams needs the &ldquo;Manage Improvement Board&rdquo;
            permission. Ask an Improvement Board manager if you need access.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/improvement-board/rotation">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to the rotation
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function TeamBuilderClient() {
  const { can, isLoading: permsLoading } = usePermissions();

  if (permsLoading) return <LoadingState />;
  if (!can('improvement.board.manage')) return <NoAccessPanel />;

  return <TeamBuilder />;
}

function TeamBuilder() {
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<MbaTeam[]>([]);
  /** cohort_key -> that cohort's learners (the picker source per team). */
  const [membersByCohort, setMembersByCohort] = useState<Map<string, MbaAssociateLite[]>>(
    new Map()
  );
  const [cohorts, setCohorts] = useState<TeachingCohortOption[]>([]);
  const [cohortsSupported, setCohortsSupported] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCohort, setNewTeamCohort] = useState(DEFAULT_COHORT_KEY);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [cohortState, nextTeams] = await Promise.all([
      MbaRotationService.listCohortOptions(),
      MbaRotationService.listTeams(),
    ]);
    setCohorts(cohortState.options);
    setCohortsSupported(cohortState.supported);
    setTeams(nextTeams);
    setNewTeamCohort((prev) =>
      cohortState.options.some((o) => o.cohort_key === prev)
        ? prev
        : (cohortState.options[0]?.cohort_key ?? DEFAULT_COHORT_KEY)
    );

    // One picker read per cohort in play. A cohort whose role has no holders (or
    // that predates the backend) simply yields an empty list — never a hard fail
    // that would blank the whole page.
    const keys = Array.from(
      new Set([
        ...cohortState.options.map((o) => o.cohort_key),
        ...nextTeams.map((t) => t.cohort_key),
      ])
    );
    const entries = await Promise.all(
      keys.map(async (key) => {
        try {
          const list = await MbaAnalystService.listAssociates(
            cohortState.supported ? key : undefined
          );
          return [key, list] as const;
        } catch {
          return [key, [] as MbaAssociateLite[]] as const;
        }
      })
    );
    setMembersByCohort(new Map(entries));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (err) {
        if (alive)
          toast.error(err instanceof Error ? err.message : 'Could not load teams.');
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

  const refresh = useCallback(async () => {
    setTeams(await MbaRotationService.listTeams());
  }, []);

  const handleCreate = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    setCreating(true);
    try {
      // cohort_key only when the Phase-3 column exists; otherwise the DB default
      // (the MBA cohort) applies and the insert stays valid.
      await MbaRotationService.createTeam(
        name,
        null,
        cohortsSupported ? newTeamCohort : null
      );
      setNewTeamName('');
      await refresh();
      toast.success(`Created team "${name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the team.');
    } finally {
      setCreating(false);
    }
  };

  const handleAddMember = async (teamId: string, associateUserId: string, label: string) => {
    setBusyFor(teamId, true);
    try {
      await MbaRotationService.addMember(teamId, associateUserId);
      await refresh();
      toast.success(`Added ${label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the member.');
    } finally {
      setBusyFor(teamId, false);
    }
  };

  const handleRemoveMember = async (teamId: string, memberId: string, label: string) => {
    setBusyFor(teamId, true);
    try {
      await MbaRotationService.removeMember(memberId);
      await refresh();
      toast.success(`Removed ${label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the member.');
    } finally {
      setBusyFor(teamId, false);
    }
  };

  const handleDeleteTeam = async (team: MbaTeam) => {
    if (
      !window.confirm(
        `Delete team "${team.name}"? Its members and any generated rota slots for it are removed.`
      )
    )
      return;
    setBusyFor(team.id, true);
    try {
      await MbaRotationService.deleteTeam(team.id);
      await refresh();
      toast.success(`Deleted "${team.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the team.');
    } finally {
      setBusyFor(team.id, false);
    }
  };

  const handleToggleActive = async (team: MbaTeam) => {
    setBusyFor(team.id, true);
    try {
      await MbaRotationService.updateTeam(team.id, { is_active: !team.is_active });
      await refresh();
      toast.success(team.is_active ? 'Team set inactive' : 'Team set active');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the team.');
    } finally {
      setBusyFor(team.id, false);
    }
  };

  const assignedCount = useMemo(
    () => new Set(teams.flatMap((t) => t.members.map((m) => m.associate_user_id))).size,
    [teams]
  );

  /** Distinct learners available across every cohort in play. */
  const totalMembers = useMemo(() => {
    const ids = new Set<string>();
    for (const list of membersByCohort.values()) {
      for (const m of list) ids.add(m.user_id);
    }
    return ids.size;
  }, [membersByCohort]);

  const cohortLabel = useMemo(() => {
    const m = new Map(cohorts.map((c) => [c.cohort_key, c.display_name]));
    return (key: string) => m.get(key) ?? key;
  }, [cohorts]);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/improvement-board/rotation">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Team Rotation
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="text-primary h-6 w-6" />
          Rotation Teams
        </h1>
        <p className="text-muted-foreground mt-1">
          Build teams by hand. Each team belongs to one cohort and rotates through
          the departments together.
        </p>
      </div>

      {/* Summary */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-foreground font-semibold">{teams.length}</span> teams
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="text-foreground font-semibold">{assignedCount}</span> of{' '}
          {totalMembers} learners on a team
        </span>
        {cohortsSupported && (
          <>
            <span aria-hidden>·</span>
            <span>
              <span className="text-foreground font-semibold">{cohorts.length}</span>{' '}
              cohort{cohorts.length === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>

      {/* Create team */}
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">New team name</label>
            <Input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="e.g. Team Alpha"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
              }}
            />
          </div>
          {cohortsSupported && (
            <div className="sm:w-56">
              <label className="mb-1 block text-sm font-medium">Cohort</label>
              <Select value={newTeamCohort} onValueChange={setNewTeamCohort}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a cohort" />
                </SelectTrigger>
                <SelectContent>
                  {cohorts.map((c) => (
                    <SelectItem key={c.cohort_key} value={c.cohort_key}>
                      {c.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={handleCreate} disabled={creating || !newTeamName.trim()}>
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create team
          </Button>
        </CardContent>
      </Card>

      {/* Teams */}
      {teams.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No teams yet. Create your first team above.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {teams.map((team) => {
            const heldIds = new Set(team.members.map((m) => m.associate_user_id));
            // Picker scoped to THIS team's cohort — a team can never be given
            // another cohort's learner.
            const cohortMembers = membersByCohort.get(team.cohort_key) ?? [];
            const available = cohortMembers.filter((a) => !heldIds.has(a.user_id));
            const isBusy = busy.has(team.id);
            return (
              <Card key={team.id} className={team.is_active ? '' : 'opacity-70'}>
                <CardContent className="space-y-3 p-4">
                  {/* Team header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{team.name}</p>
                      {cohortsSupported && (
                        <Badge variant="secondary" className="text-xs">
                          {cohortLabel(team.cohort_key)}
                        </Badge>
                      )}
                      {!team.is_active && (
                        <Badge variant="outline" className="text-xs">
                          inactive
                        </Badge>
                      )}
                      <span className="text-muted-foreground text-xs">
                        {team.member_count} member{team.member_count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isBusy && (
                        <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleToggleActive(team)}
                      >
                        {team.is_active ? 'Set inactive' : 'Set active'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleDeleteTeam(team)}
                        aria-label={`Delete ${team.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Members */}
                  {team.members.length === 0 ? (
                    <p className="text-muted-foreground text-xs italic">
                      No members yet
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {team.members.map((m) => (
                        <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
                          {m.name || m.email || 'Learner'}
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveMember(team.id, m.id, m.name ?? 'member')
                            }
                            disabled={isBusy}
                            aria-label={`Remove ${m.name ?? 'member'}`}
                            className="hover:bg-muted-foreground/20 ml-0.5 rounded-full p-0.5 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Add member */}
                  {available.length === 0 ? (
                    <span className="text-muted-foreground text-xs">
                      {cohortMembers.length === 0
                        ? `No learners hold the ${cohortLabel(team.cohort_key)} cohort role yet.`
                        : `Every ${cohortLabel(team.cohort_key)} learner is on this team.`}
                    </span>
                  ) : (
                    <Select
                      value=""
                      disabled={isBusy}
                      onValueChange={(userId) => {
                        const a = cohortMembers.find((x) => x.user_id === userId);
                        if (a) handleAddMember(team.id, a.user_id, a.name ?? a.email ?? 'member');
                      }}
                    >
                      <SelectTrigger className="w-64">
                        <span className="flex items-center gap-1.5">
                          <UserPlus className="h-4 w-4" />
                          <SelectValue placeholder="Add a learner" />
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((a) => (
                          <SelectItem key={a.user_id} value={a.user_id}>
                            {a.name || a.email || 'Learner'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
