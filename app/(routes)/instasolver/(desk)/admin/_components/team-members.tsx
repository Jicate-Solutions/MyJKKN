'use client';

// The members of one team: add (people search), toggle team lead, remove.

import { useEffect, useState } from 'react';
import { Loader2, Search, Trash2, UserPlus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useInstaSolverMutation, usePeopleSearch } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverReferenceService } from '@/lib/services/instasolver/reference-service';
import type { TeamMember, TeamWithMembers } from '@/types/instasolver';

type AddMemberDialogProps = {
  team: TeamWithMembers;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Remounts per open, so the search starts empty each time. */
function AddMemberDialog(props: AddMemberDialogProps) {
  return <AddMemberDialogInner key={`${props.team.id}-${props.open}`} {...props} />;
}

function AddMemberDialogInner({ team, open, onOpenChange }: AddMemberDialogProps) {
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const { data: people, isFetching } = usePeopleSearch(term);

  useEffect(() => {
    const t = setTimeout(() => setTerm(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  const add = useInstaSolverMutation(
    (p: { id: string; name: string }) => InstaSolverReferenceService.addMember(team.id, p.id, false),
    (_r, p) => `${p.name} added to ${team.name}`
  );

  const memberIds = new Set(team.members.map((m) => m.user_id));
  const results = (people ?? []).filter((p) => !memberIds.has(p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a team member to {team.name}</DialogTitle>
          <DialogDescription>Search MyJKKN by name or email. Learners and parents are not listed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type at least 2 characters"
              className="pl-9"
              aria-label="Search people"
            />
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto" aria-live="polite">
            {text.trim().length < 2 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Start typing a name or email.</p>
            ) : isFetching ? (
              <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </p>
            ) : results.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No one found, or everyone found is already on this team.
              </p>
            ) : (
              results.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.full_name ?? 'Unnamed'}</p>
                    {p.email && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={add.isPending}
                    onClick={() => add.mutate({ id: p.id, name: p.full_name ?? 'Team member' })}
                  >
                    <UserPlus className="mr-1 h-4 w-4" /> Add
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TeamMembers({ team }: { team: TeamWithMembers }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const setLead = useInstaSolverMutation(
    (v: { userId: string; lead: boolean }) => InstaSolverReferenceService.setLead(team.id, v.userId, v.lead),
    'Team lead updated'
  );
  const remove = useInstaSolverMutation(
    (userId: string) => InstaSolverReferenceService.removeMember(team.id, userId),
    'Team member removed'
  );

  const members = [...team.members].sort(
    (a, b) => Number(b.is_team_lead) - Number(a.is_team_lead) || (a.person?.full_name ?? '').localeCompare(b.person?.full_name ?? '')
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">
          Team members <span className="text-muted-foreground">({members.length})</span>
        </h4>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <UserPlus className="mr-1 h-4 w-4" /> Add team member
        </Button>
      </div>

      {members.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          No team members yet. Add someone so this team can be given work.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {members.map((m) => {
            const name = m.person?.full_name ?? 'Unnamed';
            return (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="truncate">{name}</span>
                    {m.is_team_lead && <Badge variant="secondary">Team lead</Badge>}
                  </p>
                  {m.person?.email && <p className="truncate text-xs text-muted-foreground">{m.person.email}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`lead-${team.id}-${m.user_id}`}
                      checked={m.is_team_lead}
                      disabled={setLead.isPending}
                      onCheckedChange={(lead) => setLead.mutate({ userId: m.user_id, lead })}
                    />
                    <Label htmlFor={`lead-${team.id}-${m.user_id}`} className="text-xs font-normal">
                      Lead
                    </Label>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    aria-label={`Remove ${name} from ${team.name}`}
                    disabled={remove.isPending}
                    onClick={() => setRemoving(m)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AddMemberDialog team={team} open={adding} onOpenChange={setAdding} />

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.person?.full_name ?? 'this person'}?</AlertDialogTitle>
            <AlertDialogDescription>
              They stop being a maintenance team member of {team.name}. If they are on no other team they lose the
              maintenance work screens.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (removing) remove.mutate(removing.user_id);
                setRemoving(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
