'use client';

// What the coordinator reads back: a per-question rollup (means, option counts,
// comments) and the raw response table behind it.
//
// Two tabs rather than one page because they answer different questions.
// "Summary" answers "how did the event go" — the thing a coordinator reports
// upward. "Responses" answers "what did THIS person say" — the thing they act
// on. Merging them produces a page that does neither well.

import { useMemo, useState } from 'react';
import { ArrowLeft, Download, Inbox, Loader2, Star, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFeedbackResponses, useFeedbackSummary } from '@/hooks/events/use-event-feedback';
import type { EventFeedbackFormSummary } from '@/types/event-feedback';

/** "12 Aug 2026, 4:30 pm" — the moment a response landed. */
function formatMoment(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** RFC-4180 escaping. A comment containing a comma or a quote must not shift every column after it. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function FeedbackResponsesView({
  form,
  onBack,
}: {
  form: EventFeedbackFormSummary;
  onBack: () => void;
}) {
  const [tab, setTab] = useState('summary');
  const { data: summary, isLoading: summaryLoading } = useFeedbackSummary(form.id);
  const { data: responses, isLoading: responsesLoading } = useFeedbackResponses(form.id);

  /**
   * Download the responses as CSV. Built in the browser from data already
   * fetched — no extra round-trip, and no server route that would need its own
   * copy of the anonymity rule. An anonymous form simply has no identity
   * columns to omit, because listResponses() never fetched them.
   */
  const downloadCsv = useMemo(
    () => () => {
      if (!responses?.length) return;
      const identityHeaders = form.is_anonymous
        ? []
        : ['Name', 'Email', 'Institution'];
      const questionHeaders = responses[0].answers.map((a) => a.label);
      const header = [...identityHeaders, 'Submitted', ...questionHeaders];
      const lines = responses.map((r) => {
        const identity = form.is_anonymous
          ? []
          : [r.participant_name ?? '', r.participant_email ?? '', r.institution_name ?? ''];
        return [...identity, formatMoment(r.submitted_at), ...r.answers.map((a) => a.value)]
          .map((c) => csvCell(String(c)))
          .join(',');
      });
      const csv = [header.map(csvCell).join(','), ...lines].join('\n');
      // A BOM so Excel opens UTF-8 names correctly instead of mojibake.
      const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.slug}-responses.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [responses, form.is_anonymous, form.slug]
  );

  const answeredCount = responses?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div>
            <h2 className="text-base font-semibold">{form.name}</h2>
            <p className="text-xs text-muted-foreground">
              {answeredCount} {answeredCount === 1 ? 'response' : 'responses'}
              {form.is_anonymous && ' · responses shown without names'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!answeredCount}>
          <Download className="mr-1.5 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {form.is_anonymous && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          This form is marked anonymous, so names are not shown or exported. The system still
          records which registration each response came from, in order to enforce one response
          per attendee — so do not describe it to attendees as untraceable.
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="responses">Responses</TabsTrigger>
        </TabsList>

        {/* ── Summary ── */}
        <TabsContent value="summary" className="mt-4 space-y-4">
          {summaryLoading && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!summaryLoading && !summary?.length && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                <Inbox className="mx-auto mb-2 h-6 w-6" />
                No answers yet.
              </CardContent>
            </Card>
          )}
          {summary?.map((q) => {
            const maxCount = Math.max(1, ...q.distribution.map((d) => d.count));
            return (
              <Card key={q.question_key}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">{q.question_label}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {q.answered} {q.answered === 1 ? 'answer' : 'answers'}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {q.average !== null && (
                    <div className="flex items-center gap-2">
                      <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                      <span className="text-2xl font-semibold">{q.average.toFixed(2)}</span>
                      {q.rating_scale && (
                        <span className="text-sm text-muted-foreground">/ {q.rating_scale}</span>
                      )}
                    </div>
                  )}

                  {q.distribution.map((d) => (
                    <div key={d.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{d.label}</span>
                        <span className="text-muted-foreground">{d.count}</span>
                      </div>
                      <Progress value={(d.count / maxCount) * 100} className="h-1.5" />
                    </div>
                  ))}

                  {q.comments.length > 0 && (
                    <div className="space-y-1.5">
                      {q.comments.slice(0, 25).map((c, i) => (
                        <p
                          key={i}
                          className="rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 px-3 py-1.5 text-sm"
                        >
                          {c}
                        </p>
                      ))}
                      {q.comments.length > 25 && (
                        <p className="text-xs text-muted-foreground">
                          + {q.comments.length - 25} more — see the Responses tab or export the CSV.
                        </p>
                      )}
                    </div>
                  )}

                  {q.average === null && !q.distribution.length && !q.comments.length && (
                    <p className="text-sm text-muted-foreground">No answers to this question yet.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ── Raw responses ── */}
        <TabsContent value="responses" className="mt-4">
          {responsesLoading && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!responsesLoading && !responses?.length && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                <Inbox className="mx-auto mb-2 h-6 w-6" />
                Nobody has answered yet.
              </CardContent>
            </Card>
          )}
          {!!responses?.length && (
            // Wide questionnaires must scroll INSIDE this container; letting the
            // table set the page width breaks every other panel on the console.
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {!form.is_anonymous && <TableHead className="min-w-40">Attendee</TableHead>}
                    <TableHead className="min-w-40">Submitted</TableHead>
                    {responses[0].answers.map((a) => (
                      <TableHead key={a.label} className="min-w-48">
                        {a.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {responses.map((r) => (
                    <TableRow key={r.id}>
                      {!form.is_anonymous && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {r.participant_name ?? 'Unknown'}
                              </p>
                              {r.institution_name && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {r.institution_name}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatMoment(r.submitted_at)}
                      </TableCell>
                      {r.answers.map((a, i) => (
                        <TableCell key={i} className="text-sm">
                          {a.value}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Small open/closed badge shared by the panel's cards. */
export function FeedbackStateBadge({ state }: { state: string }) {
  const tone =
    state === 'Open'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      : state === 'Scheduled'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
        : 'bg-muted text-muted-foreground';
  return <Badge className={`border-0 ${tone}`}>{state}</Badge>;
}
