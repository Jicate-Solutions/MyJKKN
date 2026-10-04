'use client';

// The InstaSolver assign flow — ported unchanged in behaviour from the
// standalone app (C:\jkkn_instasolver: lib/assignment.ts,
// app/(app)/issues/[id]/_components/{quick-assign,assignee-picker,issue-actions}.tsx).
//
//   · "Assign team" (green) opens Prioritise and assign with the category's
//     covering team PRE-SELECTED and nobody named — the assignment that does
//     not depend on knowing who is free today.
//   · "Assign member: <name>" (outline) beside it assigns the covering person
//     in one click; several people → a short list of just them.
//   · No team covers the category → "Prioritise and assign" only.
//   · Assigned / in progress → "Reassign", same dialog, with an optional "why"
//     saved as an internal note.
//
// In MyJKKN "maintenance staff" are the members of active InstaSolver teams
// (maintenance is team membership, not a role), so that is who the picker and
// the suggestions offer. Nothing here is a permission — the database decides.

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronsUpDown, UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useInstaSolverMutation, useTeamsWithMembers } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import { SUGGESTED_PRIORITY_FOR_SEVERITY } from '@/lib/instasolver/constants';
import type { Issue, TeamWithMembers } from '@/types/instasolver';

export const NOBODY = 'none';

// ---------------------------------------------------------------------------
// Who should this issue go to? — the category-team suggestion.
// A SUGGESTION, never an assignment: nothing is written until a manager
// presses the button that names the person.
// ---------------------------------------------------------------------------
export interface AssigneeSuggestion {
  userId: string;
  name: string;
  teamId: number;
  teamName: string;
  isLead: boolean;
}

const NAME_FALLBACK = 'A maintenance team member';

export function suggestAssignees(
  teams: readonly TeamWithMembers[],
  issue: { category_id: number; institution_id: string }
): AssigneeSuggestion[] {
  const covering = teams
    .filter(
      (team) =>
        team.is_active &&
        team.category_id === issue.category_id &&
        // An organisation-wide team (no institution) covers every institution;
        // a team scoped to one institution covers only that one.
        (team.institution_id === null || team.institution_id === issue.institution_id)
    )
    // A team scoped to this issue's own institution is the closer fit, so it
    // leads; then alphabetical, so the order is stable between renders.
    .sort(
      (a, b) =>
        Number(b.institution_id !== null) - Number(a.institution_id !== null) || a.name.localeCompare(b.name)
    );

  const seen = new Set<string>();
  const suggestions: AssigneeSuggestion[] = [];
  for (const team of covering) {
    for (const member of team.members) {
      if (!member.user_id || seen.has(member.user_id)) continue;
      seen.add(member.user_id);
      suggestions.push({
        userId: member.user_id,
        name: member.person?.full_name ?? NAME_FALLBACK,
        teamId: team.id,
        teamName: team.name,
        isLead: member.is_team_lead
      });
    }
  }
  return suggestions;
}

export function useAssigneeSuggestions(
  issue: Pick<Issue, 'category_id' | 'institution_id'> | null,
  enabled = true
): { suggestions: AssigneeSuggestion[]; isLoading: boolean } {
  const { data, isLoading } = useTeamsWithMembers();
  return {
    suggestions: enabled && issue && data ? suggestAssignees(data, issue) : [],
    isLoading: enabled && isLoading
  };
}

/** Everyone on an active team, with the names of the teams they are on. */
export function useAssignablePeople() {
  const { data: teams, isLoading } = useTeamsWithMembers();
  return useMemo(() => {
    const people = new Map<string, { id: string; full_name: string | null }>();
    const teamsByMember = new Map<string, string[]>();
    for (const team of teams ?? []) {
      if (!team.is_active) continue;
      for (const m of team.members) {
        if (!people.has(m.user_id)) people.set(m.user_id, { id: m.user_id, full_name: m.person?.full_name ?? null });
        teamsByMember.set(m.user_id, [...(teamsByMember.get(m.user_id) ?? []), team.name]);
      }
    }
    const list = [...people.values()].sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));
    return { people: list, teamsByMember, activeTeams: (teams ?? []).filter((t) => t.is_active), isLoading };
  }, [teams, isLoading]);
}

// ---------------------------------------------------------------------------
// Quick assign — the category's own people, by name, one click.
// ---------------------------------------------------------------------------
type QuickIssue = Pick<
  Issue,
  'id' | 'reference_no' | 'status' | 'severity' | 'priority' | 'category_id' | 'institution_id' | 'category'
>;

export function QuickAssign({
  issue,
  canAssign,
  size = 'default',
  className
}: {
  issue: QuickIssue;
  /** CAO / Super Admin. */
  canAssign: boolean;
  size?: 'default' | 'sm';
  className?: string;
}) {
  const show = canAssign && issue.status === 'pending';
  const { suggestions } = useAssigneeSuggestions(issue, show);
  const triage = useInstaSolverMutation(
    (person: AssigneeSuggestion) =>
      InstaSolverIssueService.triage(issue.id, {
        priority: issue.priority ?? SUGGESTED_PRIORITY_FOR_SEVERITY[issue.severity],
        assigned_to: person.userId,
        assigned_team_id: person.teamId
      }),
    (_r, person) => `${issue.reference_no} assigned to ${person.name}`
  );

  if (!show || suggestions.length === 0) return null;

  if (suggestions.length === 1) {
    const person = suggestions[0];
    return (
      <Button
        size={size}
        // Outline, not primary: the green button beside this one is "Assign
        // team", the assignment that does not depend on who is free today.
        variant="outline"
        className={cn('max-w-full', className)}
        disabled={triage.isPending}
        onClick={() => triage.mutate(person)}
        title={`Assign to ${person.name} — ${person.teamName} covers this category`}
      >
        <UserCheck className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{triage.isPending ? 'Assigning…' : `Assign member: ${person.name}`}</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant="outline" className={className} disabled={triage.isPending}>
          <UserCheck className="mr-1.5 h-4 w-4" aria-hidden />
          {triage.isPending ? 'Assigning…' : 'Assign member'}
          <ChevronDown className="ml-1 h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          People who cover {issue.category?.name ?? 'this category'}
        </DropdownMenuLabel>
        {suggestions.map((person) => (
          <DropdownMenuItem key={person.userId} onSelect={() => triage.mutate(person)}>
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{person.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {person.teamName}
                {person.isLead ? ' · lead' : ''}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// The Details-card line: who covers this issue's category. Staff only.
// ---------------------------------------------------------------------------
export function CategoryTeamLine({ issue }: { issue: Pick<Issue, 'category_id' | 'institution_id'> }) {
  const { suggestions, isLoading } = useAssigneeSuggestions(issue);
  const byTeam = new Map<string, string[]>();
  for (const person of suggestions) {
    byTeam.set(person.teamName, [...(byTeam.get(person.teamName) ?? []), person.name]);
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Covers this category</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : byTeam.size > 0 ? (
        <ul className="space-y-1 text-sm">
          {[...byTeam].map(([teamName, names]) => (
            <li key={teamName}>
              <span className="font-medium">{names.join(', ')}</span>
              <span className="block text-xs text-muted-foreground">{teamName}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No team covers this category yet — choose someone when assigning. A team set up under Administration →
          Maintenance teams will appear here.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assignee picker — searchable, the chosen team's members listed first.
// ---------------------------------------------------------------------------
interface Person {
  id: string;
  full_name: string | null;
}

export function AssigneePicker({
  id,
  people,
  teamsByMember,
  teamName,
  value,
  onChange,
  disabled
}: {
  id?: string;
  people: readonly Person[];
  teamsByMember: Map<string, string[]>;
  /** The team chosen in the dialog, if any — its members are listed first. */
  teamName: string | null;
  value: string;
  onChange: (personId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = people.find((p) => p.id === value);
  const memberOf = (p: Person) => teamsByMember.get(p.id) ?? [];
  const inTeam = teamName ? people.filter((p) => memberOf(p).includes(teamName)) : [];
  const others = teamName ? people.filter((p) => !inTeam.includes(p)) : [...people];

  function choose(personId: string) {
    onChange(personId);
    setOpen(false);
  }

  function renderPerson(p: Person) {
    const name = p.full_name ?? NAME_FALLBACK;
    const teams = memberOf(p);
    return (
      <CommandItem
        key={p.id}
        // cmdk filters on `value`; including the teams lets "electrical" find
        // everyone on the Electrical team, not only people named so.
        value={`${name} ${teams.join(' ')} ${p.id}`}
        onSelect={() => choose(p.id)}
      >
        <Check className={cn('mr-2 h-4 w-4', value === p.id ? 'opacity-100' : 'opacity-0')} aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{name}</span>
          {teams.length ? <span className="truncate text-xs text-muted-foreground">{teams.join(', ')}</span> : null}
        </span>
      </CommandItem>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selected ? selected.full_name ?? NAME_FALLBACK : 'Nobody in particular'}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* Plain substring match: a CAO typing the start of a name expects that
            name, not everyone whose letters happen to appear in order. */}
        <Command filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Type a name or a team…" />
          <CommandList>
            <CommandEmpty>Nobody by that name.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="nobody in particular" onSelect={() => choose(NOBODY)}>
                <UserX className="mr-2 h-4 w-4" aria-hidden />
                Nobody in particular
                {value === NOBODY ? <Check className="ml-auto h-4 w-4" aria-hidden /> : null}
              </CommandItem>
            </CommandGroup>
            {inTeam.length > 0 ? <CommandGroup heading={`In ${teamName}`}>{inTeam.map(renderPerson)}</CommandGroup> : null}
            {others.length > 0 ? (
              <CommandGroup heading={teamName ? 'Everyone else' : 'Maintenance team members'}>
                {others.map(renderPerson)}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
