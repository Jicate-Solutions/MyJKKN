'use client';

/**
 * Staff picker for the biometric Link codes step.
 * Created: 2026-08-20.
 *
 * Replaces an `<input list>` backed by a `<datalist>` holding every staff row.
 * That control dumped all 868 staff from every college at once, gave no way to
 * narrow by institution, and — because `onChange` looked the typed text up
 * against the exact option label — resolved to "nothing selected" for any
 * partial name, so a half-typed search silently cleared the row.
 *
 * Matching normalises BOTH sides through normPersonName, so the machine's
 * "Radhakrishnan T" reaches MyJKKN's "Mr. RADHA KRISHNAN T". That is the same
 * normalisation the suggest route uses, widened from equality to substring —
 * and equality failing is exactly why the row is unresolved to begin with.
 *
 * Everything filters in memory. The suggest response already carries the whole
 * roster, so narrowing costs no request.
 *
 * ONE instance is mounted for the whole table rather than one per row: 40-odd
 * mounted Radix dialogs is both wasteful and the shape that provokes the focus
 * and pointer-events races documented in .claude/skills/radix-dialog-race-fix.
 */

import { useDeferredValue, useMemo, useState } from 'react';
import { Check, Search, UserRound, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { normPersonName } from '@/lib/hr/biometric/normalize-name';
import type { BiometricStaffOption } from '@/types/hr-biometric';

/** A long list means the filters are not narrow enough, not a list to scroll. */
const MAX_RESULTS = 200;

type Employment = 'any' | 'active' | 'relieved';
type Enrolment = 'any' | 'free' | 'this_machine' | 'other_machine';

export interface StaffPickerTarget {
  code: string;
  deviceName: string;
  /** Currently chosen staff id for this code, if any. */
  value: string | null;
}

interface Props {
  target: StaffPickerTarget | null;
  onOpenChange: (open: boolean) => void;
  staff: BiometricStaffOption[];
  machineName: string;
  /** staff id -> the OTHER code already claiming them in this session. */
  assignedElsewhere: Map<string, string>;
  onSelect: (staffId: string | null) => void;
}

export function StaffPickerDialog({
  target,
  onOpenChange,
  staff,
  machineName,
  assignedElsewhere,
  onSelect,
}: Props) {
  // Seeded from the machine's own spelling — the name HR is actually hunting
  // for. Keyed on the code so switching rows re-seeds rather than stranding the
  // previous row's search.
  const [term, setTerm] = useState('');
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [institutionId, setInstitutionId] = useState('any');
  const [employment, setEmployment] = useState<Employment>('any');
  const [enrolment, setEnrolment] = useState<Enrolment>('any');

  // Adjusting state during render, the React-documented alternative to an
  // effect: both branches are guarded by a value that changes, so neither loops.
  if (target && seededFor !== target.code) {
    setSeededFor(target.code);
    setTerm(target.deviceName ?? '');
  } else if (!target && seededFor !== null) {
    setSeededFor(null);
  }

  const deferred = useDeferredValue(term);

  const institutions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) {
      if (s.institution_id) m.set(s.institution_id, s.institution_name ?? 'Unnamed institution');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [staff]);

  // normPersonName is not free; pay for it once per staff member, not once per
  // keystroke per staff member.
  const indexed = useMemo(
    () => staff.map((s) => ({
      s,
      norm: normPersonName(s.full_name),
      code: (s.staff_id ?? '').toUpperCase(),
    })),
    [staff],
  );

  const results = useMemo(() => {
    const q = deferred.trim();
    const qNorm = normPersonName(q);
    const qCode = q.toUpperCase();

    const hits = indexed.filter(({ s, norm, code }) => {
      if (institutionId !== 'any' && s.institution_id !== institutionId) return false;
      if (employment === 'active' && s.is_active === false) return false;
      if (employment === 'relieved' && s.is_active !== false) return false;
      if (enrolment === 'free' && (s.current_code || s.other_machine)) return false;
      if (enrolment === 'this_machine' && !s.current_code) return false;
      if (enrolment === 'other_machine' && !s.other_machine) return false;

      if (!q) return true;
      if (qNorm.length >= 2 && norm.includes(qNorm)) return true;
      if (qCode.length >= 2 && code.includes(qCode)) return true;
      return false;
    });

    hits.sort((a, b) => a.s.full_name.localeCompare(b.s.full_name));
    return hits;
  }, [indexed, deferred, institutionId, employment, enrolment]);

  const filtersOn =
    institutionId !== 'any' || employment !== 'any' || enrolment !== 'any' || term.trim() !== '';

  const resetFilters = () => {
    setTerm('');
    setInstitutionId('any');
    setEmployment('any');
    setEnrolment('any');
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 p-0 sm:w-full">
        <DialogHeader className="border-b p-4 text-left sm:p-6 sm:pb-4">
          <DialogTitle className="text-base">
            Link enrolment code <span className="font-mono">{target?.code}</span>
          </DialogTitle>
          <DialogDescription>
            The machine calls this person{' '}
            <strong>{target?.deviceName || 'nothing at all'}</strong>. Pick the MyJKKN team member
            record they belong to — only team members in this list can ever be imported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b p-4 sm:px-6 sm:py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search name or team member code…"
              className="pl-9 pr-9"
              aria-label="Search team members"
            />
            {term && (
              <button
                type="button"
                onClick={() => setTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger aria-label="Filter by institution">
                <SelectValue placeholder="All institutions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All institutions</SelectItem>
                {institutions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={employment} onValueChange={(v) => setEmployment(v as Employment)}>
              <SelectTrigger aria-label="Filter by employment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Working &amp; relieved</SelectItem>
                <SelectItem value="active">Working here now</SelectItem>
                <SelectItem value="relieved">Relieved only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={enrolment} onValueChange={(v) => setEnrolment(v as Enrolment)}>
              <SelectTrigger aria-label="Filter by enrolment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any enrolment state</SelectItem>
                <SelectItem value="free">No code anywhere</SelectItem>
                <SelectItem value="this_machine">Has a code on this machine</SelectItem>
                <SelectItem value="other_machine">Enrolled on another machine</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {results.length} of {staff.length} team members match
              {results.length > MAX_RESULTS ? ` — showing the first ${MAX_RESULTS}` : ''}
            </p>
            {filtersOn && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs">
                Reset filters
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <UserRound className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No team members match {term.trim() ? <>&ldquo;{term.trim()}&rdquo;</> : 'these filters'}.
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                The machine&rsquo;s spelling often differs from MyJKKN&rsquo;s. Widen the search, or
                accept that this person has no team member record — their punches will not import.
              </p>
              {filtersOn && (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear search &amp; filters
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {results.slice(0, MAX_RESULTS).map(({ s }) => {
                const clash = assignedElsewhere.get(s.id);
                const chosen = target?.value === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 sm:px-6 ${
                        chosen ? 'bg-primary/5' : ''
                      }`}
                    >
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${chosen ? 'text-primary' : 'opacity-0'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{s.full_name}</span>
                          {s.is_active === false && (
                            <Badge variant="outline" className="border-amber-300 text-amber-800">Relieved</Badge>
                          )}
                          {s.current_code && (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                              Code {s.current_code} here
                            </Badge>
                          )}
                          {s.other_machine && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                              On another machine
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {[s.staff_id ?? 'no team member code', s.institution_name ?? 'no institution'].join(' · ')}
                        </span>
                        {clash && (
                          <span className="mt-0.5 block text-xs text-destructive">
                            Already picked for code {clash} in this session — one person holds one code per machine.
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t p-4 sm:justify-between sm:space-x-0 sm:px-6 sm:py-4">
          <p className="hidden text-xs text-muted-foreground sm:block">Machine: {machineName}</p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => onSelect(null)}>
              Leave unlinked
            </Button>
            <Button variant="ghost" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
