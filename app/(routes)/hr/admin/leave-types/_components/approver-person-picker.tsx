'use client';

// The "one named person" half of an approval step.
//
// WHY THIS IS ITS OWN COMPONENT. The dialog used to hold a single `search`
// string for the whole modal, so two steps both set to "one named person" shared
// one search box: typing into the second re-filtered the first one's list
// underneath it, and the person you had already picked scrolled out of view.
// Search and role filter belong to a step, so they live in the step's component.
//
// The role filter is sent to the RPC, not applied to its result. The candidate
// query is capped at 50 rows and ordered can_approve-first; the largest
// organization here has 152 people with a login account, and roles like `hod`
// (which does not grant hr.leave.approve) sort to the very end — filtering the
// returned page client-side would report "nobody holds that role" for nine
// people who do.
//
// What is stored is profiles.id, an auth uid — never staff.id. See the header of
// hr_leave_approver_candidates() for why that distinction is load-bearing.

import { useEffect, useState } from 'react';
import { Search, UserCheck, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaveApproverCandidates } from '@/hooks/hr/use-leave-approval-flows';
import type { LeaveApproverRoleOption } from '@/types/hr-leave-types';
import { cn } from '@/lib/utils';

/** Radix Select rejects an item whose value is the empty string. */
const ANY_ROLE = '__any__';

export function ApproverPersonPicker({
  hrOrgId,
  roles,
  selectedId,
  selectedName,
  onSelect,
  enabled = true,
}: {
  hrOrgId: string | undefined;
  roles: LeaveApproverRoleOption[] | undefined;
  selectedId: string | null;
  selectedName: string | null;
  onSelect: (picked: { id: string; name: string } | null) => void;
  enabled?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [roleKey, setRoleKey] = useState<string>(ANY_ROLE);

  // Debounce in an effect is the legitimate case: it synchronises with a timer,
  // an external system, and cleans up on change.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(id);
  }, [term]);

  const { data: candidates, isLoading } = useLeaveApproverCandidates(
    hrOrgId,
    debounced,
    roleKey === ANY_ROLE ? null : roleKey,
    enabled
  );

  const list = candidates ?? [];
  const roleLabel = roles?.find((r) => r.role_key === roleKey)?.role_name;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
        <div>
          <Label>Person</Label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name or email"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>Filter by role</Label>
          <Select value={roleKey} onValueChange={setRoleKey}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_ROLE}>Any role</SelectItem>
              {(roles ?? []).map((r) => (
                <SelectItem key={r.role_key} value={r.role_key}>
                  {r.role_name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.user_count}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedId && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5">
          <UserCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs">
            Selected: <strong>{selectedName ?? selectedId}</strong>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            aria-label="Clear selected person"
            onClick={() => onSelect(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="max-h-40 overflow-y-auto rounded-md border">
        {isLoading && !candidates ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {roleKey === ANY_ROLE
              ? 'No matching team members with a login account.'
              : `Nobody in this organization holds ${roleLabel ?? 'that role'}${
                  debounced ? ' and matches that search' : ''
                }.`}
          </p>
        ) : (
          list.map((c) => (
            <button
              key={c.profile_id}
              type="button"
              onClick={() =>
                onSelect({ id: c.profile_id, name: c.full_name ?? c.email ?? 'Unnamed' })
              }
              className={cn(
                'flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted',
                selectedId === c.profile_id && 'bg-muted'
              )}
            >
              <span className="min-w-0">
                <span className="block font-medium">{c.full_name ?? c.email}</span>
                <span className="block truncate text-muted-foreground">
                  {c.role_names ?? 'No role assigned'}
                </span>
              </span>
              {!c.can_approve && (
                <Badge variant="destructive" className="shrink-0 text-[10px]">
                  cannot approve
                </Badge>
              )}
            </button>
          ))
        )}
      </div>

      {list.length >= 50 && (
        <p className="text-xs text-muted-foreground">
          Showing the first 50 matches — narrow by name or role to see others.
        </p>
      )}
    </div>
  );
}
