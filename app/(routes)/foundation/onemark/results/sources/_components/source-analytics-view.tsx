'use client';

// OneMark — did each question source earn its place?
//
// Director ruling (a) of 2026-09-06 is the whole design of this screen: a source
// "worked" only if BOTH its questions appeared in the real board paper AND
// learners who practised it did better. So the two numbers sit side by side and
// the verdict column refuses to call anything a success on half the evidence.
//
// THE FOOTNOTES ARE PART OF THE PRODUCT, not decoration. A hit rate is per past
// board year and says nothing about results. A lift is a correlation: someone who
// practises more may simply be someone who works harder. Both sentences print
// under the table, every time, because a number without its limits is how a
// screen like this starts making decisions it cannot support.
//
// Below three learners nothing is claimed at all (ruling #9 —
// `onemark.results.min_learners_for_item_stats = 3`, which overrides the 5 first
// written in Lane S3 item 6).

import { useMemo, useState } from 'react';
import { PermissionError } from '@/components/errors/permission-error';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  ANALYTICS_FOOTNOTES,
  analyticsIsEmpty,
  chartData,
  everythingUnrecorded,
  formatAccuracy,
  formatHitRate,
  formatLift,
  sourceVerdict,
} from '@/lib/services/onemark/sources-analytics';
import { ApiError, useSourceAnalytics } from '../../../sources/_lib/use-sources';
import { SourceEvidenceChart } from './source-evidence-chart';

const ALL_YEARS = '__all__';

export function SourceAnalyticsView() {
  const [examId, setExamId] = useState('');
  const [year, setYear] = useState<number | null>(null);

  const { data, isLoading, error } = useSourceAnalytics({ examId, year });

  const exams = data?.exams ?? [];
  const available = data?.available !== false;
  const analytics = data?.analytics ?? null;
  const minLearners = analytics?.min_learners_for_item_stats ?? 3;

  const years = useMemo(() => {
    const max = data?.year_range.max ?? new Date().getFullYear() + 1;
    const out: number[] = [];
    for (let y = max; y >= max - 12; y -= 1) out.push(y);
    return out;
  }, [data]);

  const chart = useMemo(() => (analytics ? chartData(analytics) : []), [analytics]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What are you judging?</CardTitle>
          <CardDescription>
            Pick a subject. The board year narrows the hit rate to one real paper; leave it on every year to see
            the whole record.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a subject" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Board year</Label>
            <Select
              value={year === null ? ALL_YEARS : String(year)}
              onValueChange={(v) => setYear(v === ALL_YEARS ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_YEARS}>Every year</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && error instanceof ApiError && error.status === 403 ? (
        <PermissionError message={error.message} requiredPermission="foundation.assessments.manage" />
      ) : error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This evidence could not be read</CardTitle>
            <CardDescription>{error instanceof Error ? error.message : 'Unknown problem.'}</CardDescription>
          </CardHeader>
        </Card>
      ) : !available ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not switched on yet</CardTitle>
            <CardDescription>
              {data?.reason ?? 'Source evidence is not switched on yet.'} Nothing is lost — the ticks and the
              sittings are being recorded either way, and this screen will read them once it is in place.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : !examId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose a subject to begin</CardTitle>
          </CardHeader>
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : !analytics || analyticsIsEmpty(analytics) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nothing to judge yet</CardTitle>
            <CardDescription>
              This subject has no live questions, so no source has done anything that can be measured. Approve
              some drafts and come back.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {everythingUnrecorded(analytics) ? (
            <Card className="border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/40">
              <CardHeader>
                <CardTitle className="text-base">No question records where it came from</CardTitle>
                <CardDescription className="text-amber-900 dark:text-amber-200">
                  Every question in this subject sits in the &ldquo;source not recorded&rdquo; row. Until origins are
                  filled in, there is nothing to compare — this page is showing you that gap rather than hiding
                  it behind an average.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {chart.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Both halves, side by side</CardTitle>
                <CardDescription>
                  One axis, one unit: per cent. The left bar is how much of a source turned up in the real paper;
                  the right bar is how often learners get its questions right.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SourceEvidenceChart data={chart} year={analytics.exam_year} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Every source, every number</CardTitle>
              <CardDescription>
                Below {minLearners} learners no difference is claimed at all — with fewer than that, a gap between
                two groups is noise wearing a number&rsquo;s clothes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="w-24 text-right">Live</TableHead>
                      <TableHead className="w-44">Turned up in the paper</TableHead>
                      <TableHead className="w-44">Answered correctly</TableHead>
                      <TableHead className="w-52">Difference in board result</TableHead>
                      <TableHead>Reading</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.sources.map((row) => {
                      const verdict = sourceVerdict(row, minLearners);
                      return (
                        <TableRow
                          key={row.source_key ?? '__unrecorded__'}
                          className={cn(!row.source_active && 'opacity-70')}
                        >
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={cn('font-medium', !row.is_recorded && 'italic')}>{row.label}</span>
                              {!row.source_active ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  retired
                                </Badge>
                              ) : null}
                              {!row.is_recorded ? (
                                <Badge variant="outline" className="text-[10px]">
                                  gap in the record
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {row.items_total.toLocaleString()} in the bank ·{' '}
                              {row.times_served.toLocaleString()} served
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.items_active.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatHitRate(row)}
                            {row.hits_exact + row.hits_near > 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {row.hits_exact} exact · {row.hits_near} near
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">{formatAccuracy(row)}</TableCell>
                          <TableCell className="text-sm">{formatLift(row, minLearners)}</TableCell>
                          <TableCell>
                            <VerdictBadge tone={verdict.tone} />
                            <p className="mt-1 text-xs text-muted-foreground">{verdict.text}</p>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
                <p>
                  <strong className="text-foreground">Turned up in the paper.</strong>{' '}
                  {analytics.notes.hit_rate}
                </p>
                <p>
                  <strong className="text-foreground">Difference in board result.</strong> {analytics.notes.lift}
                </p>
                <p>
                  <strong className="text-foreground">Gap in the record.</strong>{' '}
                  {ANALYTICS_FOOTNOTES.unrecorded}
                </p>
                <p>
                  <strong className="text-foreground">Retired sources.</strong> {ANALYTICS_FOOTNOTES.retired}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function VerdictBadge({ tone }: { tone: 'worked' | 'mixed' | 'weak' | 'unproven' }) {
  const map = {
    worked: { text: 'Both halves hold', className: 'border-transparent bg-[#0b6d41] text-white' },
    mixed: { text: 'One half only', className: 'border-transparent bg-amber-500 text-white' },
    weak: { text: 'Neither half', className: 'border-transparent bg-destructive text-destructive-foreground' },
    unproven: { text: 'Not enough evidence', className: '' },
  } as const;
  const v = map[tone];
  return (
    <Badge variant={tone === 'unproven' ? 'outline' : 'default'} className={cn('text-[10px]', v.className)}>
      {v.text}
    </Badge>
  );
}
