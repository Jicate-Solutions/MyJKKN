'use client';

/**
 * Feeder-school discovery panel — the Director's "just pull those tables"
 * design. Reads EXISTING data through fn_schools_network_feeders (via
 * /api/schools-network/feeders): every distinct school in
 * learners_profiles.last_school (real enrolled feeders) and
 * marketing_leads_database.school_name (prospects), with counts, source
 * badges, and an adopted flag from the schools table. Nothing is copied —
 * "Adopt" pre-fills the Add School form; only adopted schools store
 * JKKN-side activity (owners / sessions / contributions).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, Compass, Check, Plus } from 'lucide-react';

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

const PAGE_SIZE = 25;

const SOURCE_LABEL: Record<string, string> = {
  enrolled_learners: 'Enrolled learners',
  marketing_leads: 'Marketing leads',
};

export function FeederDiscovery() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [source, setSource] = useState<string>('all');
  const [adopted, setAdopted] = useState<string>('all');
  // 'priority' = the visit list the loop re-ranks: schools whose per-cycle
  // enrollment dropped the most come first. 'volume' = all-time count order.
  const [sort, setSort] = useState<'priority' | 'volume'>('priority');
  const [page, setPage] = useState(1);

  const filters = useMemo(
    () => ({
      search: appliedSearch || undefined,
      source: source === 'all' ? undefined : source,
      adopted: adopted === 'all' ? undefined : adopted,
      sort,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [appliedSearch, source, adopted, sort, page]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['schools-network', 'feeders', filters],
    queryFn: () => listFeeders(filters),
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Compass className="h-5 w-5" /> Discover feeder schools
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {isLoading ? '…' : `${total.toLocaleString('en-IN')} schools found in existing data`}
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Every school your enrolled learners and marketing leads came from —
          read live from the admission database. Adopt one to start tracking
          visits, contributions and contacts.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={apply} className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search school name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={source}
            onValueChange={(v) => {
              setSource(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="enrolled_learners">Enrolled learners</SelectItem>
              <SelectItem value="marketing_leads">Marketing leads</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={adopted}
            onValueChange={(v) => {
              setAdopted(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schools</SelectItem>
              <SelectItem value="adopted">In network</SelectItem>
              <SelectItem value="not_adopted">Not adopted yet</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(v as 'priority' | 'volume');
              setPage(1);
            }}
          >
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

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No feeder schools match the current filters.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">
                    {rows[0]?.cycleYear && rows[0]?.priorCycleYear
                      ? `${rows[0].priorCycleYear} → ${rows[0].cycleYear} so far`
                      : 'Momentum'}
                  </TableHead>
                  <TableHead className="text-right">Enrolled learners</TableHead>
                  <TableHead className="text-right">Marketing leads</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Network</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.schoolName}__${r.adoptedSchoolId ?? i}`}>
                    <TableCell className="font-medium">{r.schoolName}</TableCell>
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
                      {r.leadsCount > 0 ? r.leadsCount.toLocaleString('en-IN') : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.sources.map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">
                            {SOURCE_LABEL[s] ?? s}
                          </Badge>
                        ))}
                      </div>
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
              <div className="flex items-center justify-between mt-4">
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
      </CardContent>
    </Card>
  );
}
