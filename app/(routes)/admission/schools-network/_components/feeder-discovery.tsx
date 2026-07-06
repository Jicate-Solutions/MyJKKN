'use client';

/**
 * Feeder discovery panel — the Director's "just pull those tables" design,
 * split into THREE stacked sections by the JKKN program level the learners
 * joined:
 *   • "Feeder Schools"      (Undergraduate) — listFeeders({ level: 'ug' })
 *   • "Feeder Colleges"     (Postgraduate)  — listFeeders({ level: 'pg' })
 *   • "Feeder — Other Levels" (diploma / PhD / unrecorded) — listFeeders({ level: 'other' })
 *
 * The Other-levels section is always on even when empty, so no feeder whose
 * learners fall outside UG/PG is ever invisible.
 *
 * Both read EXISTING data through fn_schools_network_feeders (via
 * /api/schools-network/feeders): every distinct school in
 * learners_profiles.last_school with per-level enrolled counts, an adopted
 * flag from the schools table, and per-cycle momentum. A feeder that fed both
 * levels appears in both sections with its own per-level count. Nothing is
 * copied — "Adopt" pre-fills the Add School form; only adopted schools store
 * JKKN-side activity (owners / sessions / contributions).
 *
 * Because each section is scoped to a JKKN program level, every row is an
 * enrolled-learner feeder (marketing leads have no program level), so the
 * old "Marketing leads" and "Source" columns and the source filter are gone —
 * they would be empty / constant in every typed row.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, Compass, Check, Plus, GitMerge, TrendingUp, MapPin, Split } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { listFeeders } from '../_lib/api';
import { FeederPreviewDialog } from './feeder-preview-dialog';

const PAGE_SIZE = 25;

/** The shared filter form's committed state, fed to both sections. */
interface SectionFilters {
  search?: string;
  adopted?: string;
  sort?: 'priority' | 'volume';
}

export function FeederDiscovery() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [adopted, setAdopted] = useState<string>('all');
  // 'priority' = the visit list the loop re-ranks: schools whose per-cycle
  // enrollment dropped the most come first. 'volume' = all-time count order.
  const [sort, setSort] = useState<'priority' | 'volume'>('priority');

  // Memoised so the reference only changes when a filter actually changes —
  // each section keys its page-reset on this identity.
  const filters = useMemo<SectionFilters>(
    () => ({
      search: appliedSearch || undefined,
      adopted: adopted === 'all' ? undefined : adopted,
      sort,
    }),
    [appliedSearch, adopted, sort]
  );

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(search.trim());
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Compass className="h-5 w-5" /> Discover feeders
            </CardTitle>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Every school and college your enrolled learners came from — read
              live from the admission database, split by whether they joined an
              undergraduate or postgraduate programme. Adopt one to start
              tracking visits, contributions and contacts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admission/schools-network/scoreboard">
              <Button variant="outline" size="sm" className="gap-1.5">
                <TrendingUp className="h-4 w-4" /> Scoreboard
              </Button>
            </Link>
            <Link href="/admission/schools-network/worklist">
              <Button variant="outline" size="sm" className="gap-1.5">
                <MapPin className="h-4 w-4" /> Visit worklist
              </Button>
            </Link>
            <Link href="/admission/schools-network/duplicates">
              <Button variant="outline" size="sm" className="gap-1.5">
                <GitMerge className="h-4 w-4" /> Tidy duplicates
              </Button>
            </Link>
            <Link href="/admission/schools-network/qualify">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Split className="h-4 w-4" /> Rescue shared-name schools
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        <form onSubmit={apply} className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={adopted} onValueChange={setAdopted}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schools</SelectItem>
              <SelectItem value="adopted">In network</SelectItem>
              <SelectItem value="not_adopted">Not adopted yet</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as 'priority' | 'volume')}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Needs attention first</SelectItem>
              <SelectItem value="volume">Highest volume first</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>

        <FeederSection
          level="ug"
          title="Feeder Schools"
          subtitle="Undergraduate"
          filters={filters}
        />
        <FeederSection
          level="pg"
          title="Feeder Colleges"
          subtitle="Postgraduate"
          filters={filters}
          note="Records are hand-entered at admission time, so this list can include some schools mixed in with colleges. The admission office is tidying these over time."
        />
        <FeederSection
          level="other"
          title="Feeder — Other Levels"
          subtitle="Diploma, PhD & other levels"
          filters={filters}
          note="Learners whose JKKN level is diploma, PhD, or wasn't recorded — kept here so no feeder is invisible. Usually a short list."
        />
      </CardContent>
    </Card>
  );
}

function FeederSection({
  level,
  title,
  subtitle,
  filters,
  note,
}: {
  level: 'ug' | 'pg' | 'other';
  title: string;
  subtitle: string;
  filters: SectionFilters;
  note?: React.ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [previewName, setPreviewName] = useState<string | null>(null);

  // Reset to page 1 when the shared filters change — React's documented
  // "adjust state during render" pattern. Doing it here (rather than in an
  // effect) means the query key below already sees page 1, avoiding a
  // transient fetch of a now-out-of-range page.
  const [prevFilters, setPrevFilters] = useState(filters);
  if (filters !== prevFilters) {
    setPrevFilters(filters);
    setPage(1);
  }

  const queryFilters = useMemo(
    () => ({
      ...filters,
      level,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [filters, level, page]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['schools-network', 'feeders', level, queryFilters],
    queryFn: () => listFeeders(queryFilters),
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold leading-none">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {isLoading ? '…' : `${total.toLocaleString('en-IN')} found`}
        </span>
      </div>
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No feeders match the current filters.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{level === 'pg' ? 'College / school' : 'School'}</TableHead>
                <TableHead className="text-right">
                  {rows[0]?.cycleYear && rows[0]?.priorCycleYear
                    ? `${rows[0].priorCycleYear} → ${rows[0].cycleYear} so far`
                    : 'Momentum'}
                </TableHead>
                <TableHead className="text-right">Enrolled learners</TableHead>
                <TableHead className="text-right">Network</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.schoolName}__${r.adoptedSchoolId ?? i}`}>
                  <TableCell className="font-medium">
                    {r.adoptedSchoolId ? (
                      <Link
                        href={`/admission/schools-network/${r.adoptedSchoolId}`}
                        className="cursor-pointer hover:underline"
                      >
                        {r.schoolName}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => setPreviewName(r.schoolName)}
                      >
                        {r.schoolName}
                      </button>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-right whitespace-nowrap"
                    title={
                      r.cycleYear > 0 && r.priorCycleYear > 0 && r.cycleDelta !== null
                        ? `${r.priorCycleEnrolled} enrolled last cycle, ${r.currentCycleEnrolled} so far in ${r.cycleYear} (cycle still in progress — early-cycle drops are expected to shrink as admissions come in). ${r.cohortKnown} of ${r.enrolledCount} learners fall in the two compared cycles; the rest are excluded.`
                        : 'No admission-cycle data for this school yet — momentum is unknown.'
                    }
                  >
                    {r.cycleYear > 0 && r.priorCycleYear > 0 && r.cycleDelta !== null ? (
                      <>
                        <span className="text-xs text-muted-foreground">
                          {r.priorCycleEnrolled} → {r.currentCycleEnrolled}
                        </span>{' '}
                        {r.cycleDelta !== 0 ? (
                          <Badge
                            variant={r.cycleDelta < 0 ? 'destructive' : 'secondary'}
                            className={
                              r.cycleDelta < 0
                                ? 'text-xs'
                                : 'text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                            }
                          >
                            {r.cycleDelta > 0 ? `+${r.cycleDelta}` : r.cycleDelta}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">±0</span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.enrolledCount > 0 ? r.enrolledCount.toLocaleString('en-IN') : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.adoptedSchoolId ? (
                      <Link href={`/admission/schools-network/${r.adoptedSchoolId}`}>
                        <Badge className="gap-1 cursor-pointer">
                          <Check className="h-3 w-3" /> In network
                        </Badge>
                      </Link>
                    ) : (
                      <Link
                        href={`/admission/schools-network/new?name=${encodeURIComponent(r.schoolName)}`}
                      >
                        <Button size="sm" variant="outline" className="h-7 gap-1">
                          <Plus className="h-3 w-3" /> Adopt
                        </Button>
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages.toLocaleString('en-IN')}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <FeederPreviewDialog
        schoolName={previewName ?? ''}
        level={level}
        open={previewName !== null}
        onOpenChange={(o) => {
          if (!o) setPreviewName(null);
        }}
      />
    </section>
  );
}
