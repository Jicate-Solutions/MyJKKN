'use client';

/**
 * AI Pulse — Joined Learners Card (Champion Console, per-cycle)
 *
 * The named roster behind the Participation counts: WHO actually attended this
 * cycle's live session, with college + department, searchable and filterable by
 * college. Answers the Champion's "who joined?" directly, alongside the raw
 * turnout numbers.
 *
 * Identity read: participation-service.getCycleJoinedLearners — the canonical
 * ai_pulse_live_attendance read extended with the profiles identity graph
 * (RLS-scoped; the Champion role can read these learners).
 *
 * Pattern: sibling participation-card + learner-feedback-card (per-cycle
 * client-side read via the participation-service hook).
 */

import { useMemo, useState } from 'react';
import { Users, Loader2, Search } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useCycleJoinedLearners,
  type JoinedLearner,
} from '@/lib/services/ai-pulse/participation-service';

interface JoinedLearnersCardProps {
  cycleId: string;
}

const ALL_COLLEGES = '__all__';

/** Local join time, HH:MM in IST; null joined_at = async make-up (quiz only). */
function joinLabel(joinedAt: string | null): string {
  if (!joinedAt) return 'Async make-up';
  return new Date(joinedAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export function JoinedLearnersCard({ cycleId }: JoinedLearnersCardProps) {
  const { data, isLoading, error } = useCycleJoinedLearners(cycleId);
  const [query, setQuery] = useState('');
  const [college, setCollege] = useState<string>(ALL_COLLEGES);
  const [population, setPopulation] = useState<'all' | 'student' | 'senior_learner'>(
    'all',
  );

  const colleges = useMemo(() => {
    const set = new Set<string>();
    for (const r of data ?? []) if (r.college) set.add(r.college);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (college !== ALL_COLLEGES && r.college !== college) return false;
      if (population !== 'all' && r.population !== population) return false;
      if (q && !r.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, query, college, population]);

  const seniorCount = useMemo(
    () => (data ?? []).filter((r) => r.population === 'senior_learner').length,
    [data],
  );

  const total = data?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" aria-hidden />
          Who joined
        </CardTitle>
        <CardDescription>
          Everyone who attended this cycle&apos;s live session — learners and
          senior learners on their own lines. Search by name, or filter by
          college or population.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading roster…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            Could not load the roster: {error.message}
          </p>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one has attended this cycle yet.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Controls */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name…"
                  className="pl-8"
                  aria-label="Search learners by name"
                />
              </div>
              <Select value={college} onValueChange={setCollege}>
                <SelectTrigger className="sm:w-64" aria-label="Filter by college">
                  <SelectValue placeholder="All colleges" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_COLLEGES}>All colleges</SelectItem>
                  {colleges.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={population}
                onValueChange={(v) =>
                  setPopulation(v as 'all' | 'student' | 'senior_learner')
                }
              >
                <SelectTrigger
                  className="sm:w-44"
                  aria-label="Filter by population"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All people</SelectItem>
                  <SelectItem value="student">Learners</SelectItem>
                  <SelectItem value="senior_learner">Senior learners</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {total}{' '}
              {total === 1 ? 'person' : 'people'}
              {seniorCount > 0 && (
                <>
                  {' '}
                  · {seniorCount} senior learner{seniorCount === 1 ? '' : 's'}
                </>
              )}
            </p>

            {/* Roster */}
            <ScrollArea className="h-[22rem] rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>College</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r: JoinedLearner) => (
                    <TableRow key={r.profile_id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {r.full_name}
                          {r.population === 'senior_learner' && (
                            <Badge variant="outline" className="font-normal">
                              Senior learner
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.college ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.department ?? '—'}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.joined_at ? (
                          joinLabel(r.joined_at)
                        ) : (
                          <span className="text-muted-foreground">
                            {joinLabel(null)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.on_time && (
                            <Badge variant="secondary">On time</Badge>
                          )}
                          {r.quiz_submitted && (
                            <Badge
                              variant={r.quiz_passed ? 'default' : 'outline'}
                            >
                              {r.quiz_passed ? 'Quiz passed' : 'Quiz attempted'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-sm text-muted-foreground"
                      >
                        No one matches your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
