'use client';

// ============================================================================
// WHO CAN I ASK? — the roll, not a search box
// ============================================================================
// Created 2026-08-14.
//
// The invite screen used to be a search box needing two characters before it
// showed anything. That only helps a learner who ALREADY knows the name of
// someone she wants to live with — which is precisely what she does not know.
// She cannot see who else is in her room category, so she had nothing to type.
//
// This lists everyone she may invite, carrying the details a person is actually
// recognised by: department, year, programme, and the room they live in today.
// Search stays, as a filter over a list rather than the only way in.
//
// SAME ROOM CATEGORY ONLY. A Premium resident sees Premium residents; Deluxe
// never appears. That is decided server-side by fn_premium_invite_candidates,
// which mirrors fn_premium_create_invite's rules exactly — so nobody shown here
// can be refused by the invite itself. There is deliberately no room-category
// filter control: every row is already her category, and a dropdown with one
// option is furniture.
// ============================================================================

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BedDouble, Check, Loader2, Search, Send, Users } from 'lucide-react';
import type { PremiumInviteCandidate } from '@/types/campus-living/premium';

const ALL = '__all__';

interface Props {
  candidates: PremiumInviteCandidate[];
  loading: boolean;
  /** Room category of the inviter, for the group heading. */
  myCategoryName: string | null;
  /** Beds still free in her room — the most she can usefully invite at once. */
  emptyBeds: number | null;
  sending: boolean;
  onInvite: (profileIds: string[]) => void;
}

export function InviteCandidateList({
  candidates,
  loading,
  myCategoryName,
  emptyBeds,
  sending,
  onInvite,
}: Props) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState(ALL);
  const [sem, setSem] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const options = useMemo(() => {
    const uniq = (vals: (string | null)[]) =>
      Array.from(new Set(vals.filter((v): v is string => !!v))).sort();
    return {
      depts: uniq(candidates.map((c) => c.department_name)),
      sems: uniq(candidates.map((c) => c.semester_name)),
    };
  }, [candidates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (dept !== ALL && c.department_name !== dept) return false;
      if (sem !== ALL && c.semester_name !== sem) return false;
      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        (c.register_number ?? '').toLowerCase().includes(q) ||
        (c.program_name ?? '').toLowerCase().includes(q) ||
        (c.current_room_number ?? '').toLowerCase().includes(q)
      );
    });
  }, [candidates, search, dept, sem]);

  const sameCat = filtered.filter((c) => c.same_category);
  const otherCat = filtered.filter((c) => !c.same_category);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearFilters = () => {
    setSearch('');
    setDept(ALL);
    setSem(ALL);
  };

  const filtersActive = search !== '' || dept !== ALL || sem !== ALL;
  const count = selected.size;
  // A soft warning, not a block: she may reasonably ask more people than she has
  // beds, since some will decline. The first to accept takes the bed and the
  // rest are refused by the room-full check.
  const overBeds = emptyBeds !== null && count > emptyBeds;

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        There is nobody you can invite right now. Roommates have to be in the
        same room category as you
        {myCategoryName ? ` — a ${myCategoryName}` : ''}, from your college, and
        the same gender, and everyone who qualifies already shares your room. The
        hostel office can still place someone with you.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Name, register number, room…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search learners"
          />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger aria-label="Department"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {options.depts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sem} onValueChange={setSem}>
          <SelectTrigger aria-label="Year or semester"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All years</SelectItem>
            {options.sems.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Showing {filtered.length} of {candidates.length}
          {filtersActive ? (
            <Button variant="link" size="sm" className="h-auto p-0 pl-2" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </span>
        {count > 0 ? (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setSelected(new Set())}>
            Clear {count} selected
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          Nobody matches those filters.
        </div>
      ) : (
        <div className="space-y-5">
          <CandidateGroup
            title={myCategoryName ? `In a ${myCategoryName}, like you` : 'In your room category'}
            hint="They already have this room and this price, so moving in changes neither for them."
            rows={sameCat}
            selected={selected}
            onToggle={toggle}
          />
          {/* Hostelites in this category with no room allocated yet. Rare, and
              usually empty — but they are legitimately invitable, so they are
              shown apart rather than mixed in with people who have a room. */}
          <CandidateGroup
            title="No room allocated yet"
            hint="Same room category on their profile, but no bed assigned so far."
            rows={otherCat}
            selected={selected}
            onToggle={toggle}
          />
        </div>
      )}

      {/* Send bar */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 py-3 backdrop-blur">
        <div className="text-sm">
          {count === 0 ? (
            <span className="text-muted-foreground">Pick the people you want to ask.</span>
          ) : (
            <span>
              <strong>{count}</strong> selected
              {overBeds ? (
                <span className="text-muted-foreground">
                  {' '}— more than the {emptyBeds} empty {emptyBeds === 1 ? 'bed' : 'beds'} you
                  have. Whoever accepts first takes the bed.
                </span>
              ) : null}
            </span>
          )}
        </div>
        <Button
          disabled={count === 0 || sending}
          onClick={() => {
            onInvite(Array.from(selected));
            setSelected(new Set());
          }}
        >
          {sending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
          ) : (
            <><Send className="mr-2 h-4 w-4" />Invite {count > 0 ? count : ''}</>
          )}
        </Button>
      </div>
    </div>
  );
}

function CandidateGroup({
  title,
  hint,
  rows,
  selected,
  onToggle,
}: {
  title: string;
  hint: string;
  rows: PremiumInviteCandidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div className="mb-2">
        <h3 className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
        </h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="divide-y rounded-md border">
        {rows.map((c) => {
          const checked = selected.has(c.profile_id);
          const disabled = c.already_invited;
          return (
            <Label
              key={c.profile_id}
              htmlFor={`cand-${c.profile_id}`}
              className={`flex cursor-pointer items-start gap-3 p-3 font-normal transition-colors ${
                disabled ? 'cursor-default opacity-60' : 'hover:bg-muted/40'
              }`}
            >
              <Checkbox
                id={`cand-${c.profile_id}`}
                checked={checked}
                disabled={disabled}
                onCheckedChange={() => onToggle(c.profile_id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.full_name}</span>
                  {c.register_number ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.register_number}
                    </span>
                  ) : null}
                  {disabled ? (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" /> Already asked
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[c.department_name, c.semester_name, c.program_name]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <BedDouble className="h-3 w-3 shrink-0" />
                  {c.current_room_category ? (
                    <>
                      {c.current_room_category}
                      {c.current_block_name ? ` · ${c.current_block_name}` : ''}
                      {c.current_room_number ? ` · Room ${c.current_room_number}` : ''}
                    </>
                  ) : (
                    <span className="italic">No room yet</span>
                  )}
                </p>
              </div>
              {c.same_category ? (
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-label="Same room category" />
              ) : null}
            </Label>
          );
        })}
      </div>
    </section>
  );
}
