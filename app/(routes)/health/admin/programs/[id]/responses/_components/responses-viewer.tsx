'use client';

// app/(routes)/health/admin/programs/[id]/responses/_components/responses-viewer.tsx
// Created: 2026-06-16 — Health → Wellness Programs admin response-viewer.
// Reads health_program_participation.form_responses (manager-readable via
// hpp_select) and renders, per day, a Summary tab (per-question tallies +
// free-text) and an Individual tab (each participant's full submission).
// Choice option IDs are resolved to option text via the shared forms.ts helpers,
// so this view can't drift from how answers are stored/scored. Read-only.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  ShieldAlert,
  Users,
  XCircle,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProgramResponses } from '@/hooks/health/use-wellness-programs';
import { useTabParam } from '@/hooks/use-tab-param';
import {
  FIELD_TYPE_LABELS,
  normalizeForm,
  resolveResponses,
  summarizeResponses,
  type FieldSummary,
} from '@/lib/health/forms';
import type { FormSpec } from '@/types/health-programs';
import type { ProgramResponseRow } from '@/types/health-programs';

interface ResponsesViewerProps {
  programId: string;
}

function personLabel(row: ProgramResponseRow): string {
  const p = row.profile;
  if (p?.full_name?.trim()) return p.full_name;
  if (p?.email?.trim()) return p.email;
  return `Participant ${row.user_id.slice(0, 8)}`;
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

// ── A single option's distribution bar (Summary tab) ──────────────────────
function OptionBar({
  label,
  count,
  max,
  isCorrect,
}: {
  label: string;
  count: number;
  max: number;
  isCorrect?: boolean;
}) {
  const width = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-slate-600">
          {isCorrect && (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          )}
          {label}
        </span>
        <span className="font-mono text-slate-500">{count}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${isCorrect ? 'bg-emerald-500' : 'bg-teal-400'}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

// ── Summary tab: one card per question ────────────────────────────────────
function SummaryView({
  summaries,
  respondents,
}: {
  summaries: FieldSummary[];
  respondents: number;
}) {
  if (summaries.length === 0) {
    return (
      <p className="py-6 text-sm text-slate-400">
        This day’s form has no questions.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {summaries.map((s) => {
        const max = s.options
          ? Math.max(1, ...s.options.map((o) => o.count))
          : 1;
        return (
          <Card key={s.fieldId}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="text-base text-slate-800">
                  {s.label}
                </CardTitle>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="text-xs font-normal">
                    {FIELD_TYPE_LABELS[s.type]}
                  </Badge>
                  {s.graded && (
                    <Badge
                      variant="outline"
                      className="border-emerald-200 text-xs font-normal text-emerald-700"
                    >
                      Graded
                    </Badge>
                  )}
                </span>
              </div>
              <CardDescription className="text-xs">
                {s.answeredCount} of {respondents} answered
                {s.average != null && (
                  <>
                    {' · '}average{' '}
                    <strong className="text-slate-600">
                      {s.average.toFixed(1)}
                    </strong>
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {s.options && (
                <div className="space-y-3">
                  {s.options.map((o) => (
                    <OptionBar
                      key={o.key}
                      label={o.label}
                      count={o.count}
                      max={max}
                      isCorrect={o.isCorrect}
                    />
                  ))}
                </div>
              )}
              {s.textAnswers &&
                (s.textAnswers.length === 0 ? (
                  <p className="text-sm text-slate-400">No answers yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {s.textAnswers.map((t, i) => (
                      <li
                        key={i}
                        className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm text-slate-700"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Individual tab: one card per participant submission ───────────────────
function IndividualView({
  form,
  rows,
}: {
  form: FormSpec;
  rows: ProgramResponseRow[];
}) {
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const answers = resolveResponses(form, row.form_responses);
        return (
          <Card key={row.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                  <Users className="h-4 w-4 text-slate-400" />
                  {personLabel(row)}
                </CardTitle>
                {row.quiz_score != null && (
                  <Badge
                    variant="outline"
                    className="border-blue-200 text-xs font-normal text-blue-700"
                  >
                    Score {row.quiz_score}%
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                {fmtDateTime(row.updated_at)}
                {row.profile?.role ? ` · ${row.profile.role}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {answers.map((a) => (
                <div
                  key={a.fieldId}
                  className="border-l-2 border-slate-100 pl-3"
                >
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500">
                    {a.orphan && (
                      <Badge
                        variant="outline"
                        className="border-amber-200 text-[10px] font-normal text-amber-700"
                      >
                        removed
                      </Badge>
                    )}
                    {a.label}
                    {a.correct === true && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    {a.correct === false && (
                      <XCircle className="h-3.5 w-3.5 text-rose-500" />
                    )}
                  </p>
                  {a.answered ? (
                    <p className="whitespace-pre-wrap text-sm text-slate-800">
                      {a.values.join(', ')}
                    </p>
                  ) : (
                    <p className="text-sm italic text-slate-400">(no answer)</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const RESPONSES_TABS = ['summary', 'individual'] as const;

export function ResponsesViewer({ programId }: ResponsesViewerProps) {
  const router = useRouter();
  const { data, isLoading, error } = useProgramResponses(programId);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useTabParam('summary', RESPONSES_TABS);

  // Group response rows under the day they belong to, keeping day order.
  const daysWithResponses = useMemo(() => {
    if (!data) return [];
    const byDay = new Map<string, ProgramResponseRow[]>();
    for (const r of data.responses) {
      const arr = byDay.get(r.day_id) ?? [];
      arr.push(r);
      byDay.set(r.day_id, arr);
    }
    return data.days
      .filter((d) => byDay.has(d.id))
      .map((d) => ({ day: d, rows: byDay.get(d.id) as ProgramResponseRow[] }));
  }, [data]);

  // ── loading ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full max-w-md rounded-lg" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // ── error (incl. the manager-only gate denying access) ──
  if (error) {
    const message = (error as Error).message || '';
    const looksLikePermission =
      /permission|denied|not authoriz|forbidden|access|rls/i.test(message);
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>
          {looksLikePermission
            ? 'You don’t have access to this program’s responses'
            : 'Couldn’t load responses'}
        </AlertTitle>
        <AlertDescription>
          {looksLikePermission
            ? 'Form responses are limited to program managers. Ask a super-admin to grant health.programs.manage on your role.'
            : message || 'Unknown error reading responses.'}
        </AlertDescription>
      </Alert>
    );
  }

  // ── empty: no submissions yet ──
  if (daysWithResponses.length === 0) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/health/admin/programs/${programId}`)}
          className="-ml-2 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to program
        </Button>
        <Alert>
          <ClipboardList className="h-4 w-4" />
          <AlertTitle>No responses yet</AlertTitle>
          <AlertDescription>
            Answers appear here as soon as participants submit a day’s form.
            {data?.days.length
              ? ' The forms are set up — nothing has been submitted so far.'
              : ' This program has no days with a form yet.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Plain consts (NOT hooks) — safe after the guards above.
  const selected =
    daysWithResponses.find((x) => x.day.id === activeDayId) ??
    daysWithResponses[0];
  const form = normalizeForm(selected.day.quiz);
  const summaries = summarizeResponses(
    form,
    selected.rows.map((r) => r.form_responses)
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/health/admin/programs/${programId}`)}
          className="-ml-2 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to program
        </Button>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
          <Users className="h-4 w-4 text-teal-600" />
          {selected.rows.length}{' '}
          {selected.rows.length === 1 ? 'response' : 'responses'} this day
        </span>
      </div>

      {/* Day selector — only days that have responses */}
      {daysWithResponses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {daysWithResponses.map(({ day, rows }) => {
            const isActive = day.id === selected.day.id;
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => setActiveDayId(day.id)}
                className={`rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
                  isActive
                    ? 'border-teal-300 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="font-medium">Day {day.day_number}</span>
                <span className="ml-1.5 text-xs text-slate-400">
                  ({rows.length})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected day header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">
          Day {selected.day.day_number}
          {selected.day.title ? ` — ${selected.day.title}` : ''}
        </h2>
      </div>

      {/* Summary / Individual tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="summary" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="individual" className="gap-1.5">
            <ListChecks className="h-4 w-4" />
            Individual
          </TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="mt-4">
          <SummaryView summaries={summaries} respondents={selected.rows.length} />
        </TabsContent>
        <TabsContent value="individual" className="mt-4">
          <IndividualView form={form} rows={selected.rows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
