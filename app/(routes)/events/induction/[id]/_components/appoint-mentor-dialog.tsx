'use client';

// Appoint a Senior Peer Mentor — the shared picker.
//
// Used by BOTH the event page's volunteers card (feedback-volunteers-section)
// and the mentor console (/mentors). It was duplicated in the two files, which
// let the eligibility copy drift; one copy now, so the year-band wording and the
// search affordances can only ever change in one place.
//
// Eligibility is enforced server-side by fn_induction_assignable_peer_mentors:
// every active learner of the college from their 2nd year upward — no upper
// bound, so final-year students of a 4- or 5-year programme count too. Only
// first-years are out, and they are out because they have no senior year behind
// them, not because of a policy cap.
// The search box is a thin pass-through: the RPC matches name, register/roll
// number, college email, student email, mobile and programme as %value%.
//
// FILTERS, BECAUSE SEARCH ALONE WAS NOT REACHABLE. A college has up to ~740
// eligible seniors and the RPC returns one capped page, so the only way to reach
// anyone past the first screen was to already know enough of their name to type
// it. The five cascading academic filters — degree → department → programme →
// semester → section — let an admin walk down to a section they know instead,
// and the footer states the TRUE match count so a capped list can never again
// read as "there is nobody else".
//
// Options come from fn_induction_peer_mentor_filter_options and are derived from
// the learners actually eligible for THIS event, not the college's catalogue, so
// a filter value can never match zero people — the rule the rest of this
// codebase's filter panels follow.
//
// INSTITUTION IS SHOWN LOCKED, NEVER SENT. A mentor must share a college with
// their mentees, so the RPC resolves it from the event itself; a caller-supplied
// institution would either be ignored or be a cross-college hole.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionVolunteerService,
  type AssignablePeerMentor,
  type PeerMentorFilterOption,
  type PeerMentorFilterOptions,
  type PeerMentorFilters,
} from '@/lib/services/induction/induction-volunteer-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  UserPlus, Loader2, Search, X, Mail, Phone, GraduationCap, SearchX,
  SlidersHorizontal, Building2, Info,
} from 'lucide-react';

/** One page of results. The RPC clamps anything larger to 500; this is what the
 *  list renders before asking the admin to narrow down, and the footer reports
 *  the real total against it. */
const PAGE_SIZE = 50;

/** Radix Select rejects an empty-string value, so "Any" needs a sentinel. */
const ANY = '__any__';

/** Parent → child, in the order the academic hierarchy nests. Selecting a level
 *  clears everything below it. */
const FILTER_ORDER = ['degreeId', 'departmentId', 'programId', 'semesterId', 'sectionId'] as const;

const EMPTY_FILTERS: PeerMentorFilters = {
  degreeId: null,
  departmentId: null,
  programId: null,
  semesterId: null,
  sectionId: null,
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const nameById = (list: PeerMentorFilterOption[]) =>
  new Map(list.map((o) => [o.id, o.name]));

/** Two options with the SAME label are indistinguishable in a dropdown, and this
 *  is not hypothetical: JKKN College of Pharmacy has 25 section rows carrying
 *  only 7 distinct names — six different sections are all called "A", one per
 *  programme. Picking one of six identical entries is a coin flip, and the
 *  result set that came back looked like a broken filter.
 *
 *  So: where a name repeats in the VISIBLE list, append the parent it belongs
 *  to. Unique names are left untouched, and choosing a parent level above
 *  collapses the duplicates anyway, so the suffix appears only while it is
 *  actually needed. `parents` is tried in order — a section prefers to be
 *  identified by its semester, falling back to its programme. */
function disambiguate(
  list: PeerMentorFilterOption[],
  parents: [keyof PeerMentorFilterOption, Map<string, string>][],
): PeerMentorFilterOption[] {
  const counts = new Map<string, number>();
  list.forEach((o) => counts.set(o.name, (counts.get(o.name) ?? 0) + 1));
  if (![...counts.values()].some((n) => n > 1)) return list;

  return list.map((o) => {
    if ((counts.get(o.name) ?? 0) < 2) return o;
    for (const [key, names] of parents) {
      const parentId = o[key];
      const parentName = typeof parentId === 'string' ? names.get(parentId) : undefined;
      if (parentName) return { ...o, name: `${o.name} · ${parentName}` };
    }
    return o;
  });
}

/** One compact filter dropdown. Disabled when its list is empty — that only
 *  happens once the level above narrowed it to nothing, and a dropdown whose
 *  only entry is "Any" is noise. */
function FilterSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: PeerMentorFilterOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1 min-w-0">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Select
        value={value ?? ANY}
        onValueChange={(v) => onChange(v === ANY ? null : v)}
        disabled={options.length === 0}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={`Any ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY} className="text-xs">Any {label.toLowerCase()}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-xs">{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AppointMentorDialog({
  eventId,
  onAppointed,
  triggerLabel = 'Appoint Senior Peer Mentor',
}: {
  eventId: string;
  onAppointed: () => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<PeerMentorFilters>(EMPTY_FILTERS);
  const [options, setOptions] = useState<PeerMentorFilterOptions | null>(null);
  const [results, setResults] = useState<AssignablePeerMentor[]>([]);
  const [searching, setSearching] = useState(false);
  const [appointing, setAppointing] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [optionsFailed, setOptionsFailed] = useState(false);

  // Filter options, once per opening. Refetched rather than kept across
  // openings on purpose: appointing someone removes them from the eligible pool,
  // so a cached payload would keep offering a learner who is already a mentor.
  useEffect(() => {
    if (!open || options) return;
    let active = true;
    InductionVolunteerService.peerMentorFilterOptions(eventId)
      .then((o) => { if (active) setOptions(o); })
      // Search still works unaided, so this degrades rather than blocks — but it
      // is SAID. Five permanently greyed-out dropdowns with no explanation is
      // the silent empty state this module keeps getting bitten by.
      .catch(() => { if (active) setOptionsFailed(true); });
    return () => { active = false; };
  }, [open, eventId, options]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await InductionVolunteerService.assignablePeerMentors(
          eventId, query, filters, PAGE_SIZE,
        );
        if (active) setResults(r);
      } catch {
        /* surfaced on appoint */
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [open, query, filters, eventId]);

  // Reset between openings — a stale query or a stale filter from last time
  // reads as "no eligible seniors exist", which is the exact confusion this
  // dialog must avoid.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setFilters(EMPTY_FILTERS);
      setOptions(null);
      setOptionsFailed(false);
    }
  }, [open]);

  // Each level is narrowed by every level above it. The payload denormalizes the
  // parent ids onto every option, so this is a plain in-memory filter — no round
  // trip per level.
  const lists = useMemo(() => {
    if (!options) {
      return { degrees: [], departments: [], programs: [], semesters: [], sections: [] };
    }
    const { degreeId, departmentId, programId, semesterId } = filters;
    const degreeNames = nameById(options.degrees);
    const deptNames = nameById(options.departments);
    const progNames = nameById(options.programs);
    const semNames = nameById(options.semesters);

    return {
      degrees: options.degrees,
      departments: disambiguate(
        options.departments.filter((d) => !degreeId || d.degree_id === degreeId),
        [['degree_id', degreeNames]],
      ),
      programs: disambiguate(
        options.programs.filter(
          (p) => (!degreeId || p.degree_id === degreeId)
              && (!departmentId || p.department_id === departmentId),
        ),
        [['department_id', deptNames], ['degree_id', degreeNames]],
      ),
      semesters: disambiguate(
        options.semesters.filter(
          (s) => (!degreeId || s.degree_id === degreeId)
              && (!departmentId || s.department_id === departmentId)
              && (!programId || s.program_id === programId),
        ),
        [['program_id', progNames], ['department_id', deptNames]],
      ),
      sections: disambiguate(
        options.sections.filter(
          (s) => (!degreeId || s.degree_id === degreeId)
              && (!departmentId || s.department_id === departmentId)
              && (!programId || s.program_id === programId)
              && (!semesterId || s.semester_id === semesterId),
        ),
        [['semester_id', semNames], ['program_id', progNames]],
      ),
    };
  }, [options, filters]);

  // Setting a level clears the levels below it. Without this a section left over
  // from a previous degree stays ANDed into the query and silently returns zero
  // rows — which reads as "no eligible seniors" rather than "your filters
  // disagree with each other".
  const setFilter = useCallback((key: (typeof FILTER_ORDER)[number], value: string | null) => {
    setFilters((prev) => {
      const next: PeerMentorFilters = { ...prev, [key]: value };
      FILTER_ORDER.slice(FILTER_ORDER.indexOf(key) + 1).forEach((k) => { next[k] = null; });
      return next;
    });
  }, []);

  const activeCount = FILTER_ORDER.filter((k) => filters[k]).length;

  // count(*) OVER () — identical on every row, so row 0 carries the total for the
  // whole match set, not just this page.
  const totalMatches = results.length ? Number(results[0].total_matches ?? results.length) : 0;

  const appoint = async (m: AssignablePeerMentor) => {
    setAppointing(m.learner_id);
    try {
      await InductionVolunteerService.appointVolunteer(eventId, m.learner_id);
      toast.success(`${m.full_name} is now a Senior Peer Mentor.`);
      setOpen(false);
      onAppointed();
    } catch (e: any) {
      toast.error(`Couldn't appoint: ${e.message ?? e}`);
    } finally {
      setAppointing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="h-3.5 w-3.5 mr-1" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-5 pb-3 space-y-1.5 text-left">
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary shrink-0" />
            Appoint a Senior Peer Mentor
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            <span className="font-medium text-foreground">Any student past their first year</span> of
            this college can be a Senior Peer Mentor — 2nd year right through to final year. The list
            below is already filtered to them — freshers being inducted here can&apos;t be appointed.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-3 space-y-2.5 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 pr-9 h-10"
              placeholder="Search name, register number, college email or mobile…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
              Filters
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                  {activeCount}
                </Badge>
              )}
            </Button>

            {activeCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                Clear all
              </Button>
            )}

            {options?.institution && (
              <span
                title="A mentor must be from the same college as their mentees, so this is fixed by the event."
                className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground"
              >
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{options.institution.name}</span>
              </span>
            )}
          </div>

          {showFilters && optionsFailed && (
            <p className="flex items-start gap-1.5 text-[11px] text-destructive">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              Couldn&apos;t load the filter lists. Search still works — reopen this dialog to retry.
            </p>
          )}

          {showFilters && !optionsFailed && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <FilterSelect
                label="Degree"
                value={filters.degreeId}
                options={lists.degrees}
                onChange={(v) => setFilter('degreeId', v)}
              />
              <FilterSelect
                label="Department"
                value={filters.departmentId}
                options={lists.departments}
                onChange={(v) => setFilter('departmentId', v)}
              />
              <FilterSelect
                label="Programme"
                value={filters.programId}
                options={lists.programs}
                onChange={(v) => setFilter('programId', v)}
              />
              <FilterSelect
                label="Semester"
                value={filters.semesterId}
                options={lists.semesters}
                onChange={(v) => setFilter('semesterId', v)}
              />
              <FilterSelect
                label="Section"
                value={filters.sectionId}
                options={lists.sections}
                onChange={(v) => setFilter('sectionId', v)}
              />
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Partial matches work anywhere in the value — type <code className="font-mono">98765</code> or{' '}
            <code className="font-mono">@jkkn</code> and it still finds them. Most senior listed first.
          </p>

          {options && options.without_login > 0 && (
            // Named rather than hidden: these learners are in the eligible year
            // band and are missing only an account, which is fixable.
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                {options.without_login} senior{options.without_login === 1 ? '' : 's'} in the eligible
                year band {options.without_login === 1 ? 'has' : 'have'} no login for this college yet,
                so they can&apos;t be appointed until the account is created.
              </span>
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-[14rem]">
          {searching ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 gap-2">
              <SearchX className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">
                {query
                  ? `No eligible student matches “${query}”.`
                  : activeCount > 0
                    ? 'No eligible student matches these filters.'
                    : 'No appointable Senior Peer Mentors found.'}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {query || activeCount > 0
                  ? 'Widen or clear the filters, or search part of the name, register number, college email or mobile instead.'
                  : 'Every senior (2nd year and above) is either already a mentor here, or their programme duration / admission year is not filled in yet.'}
              </p>
              {activeCount > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1 h-7 text-xs"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  Clear all filters
                </Button>
              )}
            </div>
          ) : (
            <>
              {results.map((m) => {
                const meta = [
                  m.register_number,
                  m.program_name,
                  m.department_name,
                  m.section_name ? `Section ${m.section_name}` : null,
                ].filter(Boolean) as string[];

                return (
                  <button
                    key={m.learner_id}
                    type="button"
                    onClick={() => appoint(m)}
                    disabled={!!appointing}
                    className={cn(
                      'w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                      'hover:border-primary hover:bg-primary/5 focus-visible:outline-none',
                      'focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none',
                    )}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(m.full_name)}
                    </span>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{m.full_name}</span>
                        {m.year_of_study != null && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                            Year {m.year_of_study}
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground truncate">
                        {meta.length ? meta.join(' • ') : '—'}
                      </div>

                      {(m.college_email || m.student_email || m.student_mobile) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {(m.college_email || m.student_email) && (
                            <span className="inline-flex items-center gap-1 min-w-0">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{m.college_email || m.student_email}</span>
                            </span>
                          )}
                          {m.student_mobile && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0" />
                              {m.student_mobile}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <span className="shrink-0 pt-0.5">
                      {appointing === m.learner_id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <UserPlus className="h-4 w-4 text-primary" />}
                    </span>
                  </button>
                );
              })}

              {/* The RPC caps the page. State the real total so an admin can never
                  conclude the students past the cap simply aren't eligible. */}
              <p className="pt-1 text-[11px] text-muted-foreground text-center">
                {totalMatches > results.length
                  ? `Showing ${results.length} of ${totalMatches} matching seniors — narrow it with the filters or search above.`
                  : `${totalMatches} matching senior${totalMatches === 1 ? '' : 's'}.`}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
