'use client';

/**
 * MBA Team Rotation — team builder (client).
 * Manager-only (improvement.board.manage). Build teams of MBA Associates by
 * hand: create a team, add/remove associates, (de)activate or delete a team.
 * The associate picker is backed by the manager-gated SECDEF fn_mba_list_associates
 * (via MbaAnalystService.listAssociates) — never a raw user_roles read, which RLS
 * self-scopes and would silently truncate the picker.
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
  type MbaTeam,
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
  const [associates, setAssociates] = useState<MbaAssociateLite[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [nextTeams, nextAssociates] = await Promise.all([
      MbaRotationService.listTeams(),
      MbaAnalystService.listAssociates(),
    ]);
    setTeams(nextTeams);
    setAssociates(nextAssociates);
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
      await MbaRotationService.createTeam(name);
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
          Build teams of MBA Associates by hand. Each team rotates through the
          departments together.
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
          {associates.length} associates on a team
        </span>
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
            const available = associates.filter((a) => !heldIds.has(a.user_id));
            const isBusy = busy.has(team.id);
            return (
              <Card key={team.id} className={team.is_active ? '' : 'opacity-70'}>
                <CardContent className="space-y-3 p-4">
                  {/* Team header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{team.name}</p>
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
                          {m.name || m.email || 'Associate'}
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
                      All associates are on this team.
                    </span>
                  ) : (
                    <Select
                      value=""
                      disabled={isBusy}
                      onValueChange={(userId) => {
                        const a = associates.find((x) => x.user_id === userId);
                        if (a) handleAddMember(team.id, a.user_id, a.name ?? a.email ?? 'associate');
                      }}
                    >
                      <SelectTrigger className="w-64">
                        <span className="flex items-center gap-1.5">
                          <UserPlus className="h-4 w-4" />
                          <SelectValue placeholder="Add an associate" />
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((a) => (
                          <SelectItem key={a.user_id} value={a.user_id}>
                            {a.name || a.email || 'Associate'}
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
