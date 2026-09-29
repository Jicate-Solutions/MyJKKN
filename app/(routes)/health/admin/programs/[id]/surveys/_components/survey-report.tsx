'use client';

// Survey report: summary tiles, question-wise distribution, individual table,
// and the two-sheet Excel export.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, Pencil, RefreshCw, Search } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAllPrograms } from '@/hooks/health/use-wellness-programs';
import { useSurvey, useSurveyResponses } from '@/hooks/health/use-wellness-surveys';
import { RESPONDENT_TYPE_LABEL } from '@/types/health-surveys';
import { computeAnalytics, responseSummary } from './survey-analytics';
import { exportSurveyReport } from './survey-report-excel';

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-800">{value}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function SurveyReport({ programId, surveyId }: { programId: string; surveyId: string }) {
  const { data: programs } = useAllPrograms();
  const program = programs?.find((p) => p.id === programId);
  const { data: survey, isLoading: surveyLoading } = useSurvey(surveyId);
  const {
    data: responses,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useSurveyResponses(surveyId);
  const [search, setSearch] = useState('');

  const analytics = useMemo(
    () => (survey && responses ? computeAnalytics(survey, responses) : null),
    [survey, responses]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!responses || !q) return responses ?? [];
    return responses.filter((r) =>
      [r.name, r.email, r.mobile, r.designation, r.institution_name]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [responses, search]);

  if (surveyLoading || isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error || !survey) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load the report</AlertTitle>
        <AlertDescription>{error ? (error as Error).message : 'Survey not found.'}</AlertDescription>
      </Alert>
    );
  }

  const handleExport = async () => {
    if (!responses || responses.length === 0) {
      toast.error('No responses to export yet.');
      return;
    }
    try {
      await exportSurveyReport(survey, program?.title, responses);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/health/admin/programs/${programId}/surveys`}>
            <Button variant="ghost" size="sm" className="-ml-2 gap-2">
              <ArrowLeft className="h-4 w-4" />
              All surveys
            </Button>
          </Link>
          <h2 className="text-lg font-semibold text-slate-800">{survey.title}</h2>
          {program && <p className="text-xs text-slate-500">{program.title}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href={`/health/admin/programs/${programId}/surveys/${surveyId}`}>
            <Button variant="outline" size="sm" className="gap-2">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Button size="sm" onClick={handleExport} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {analytics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Responses" value={analytics.total} />
          <Stat label="Avg constructive score" value={`${analytics.avgScorePct}%`} />
          {(['student', 'staff', 'public'] as const).map((t) => {
            const x = analytics.byType.find((b) => b.type === t);
            if (!survey.audience.includes(t) && !x) return null;
            return (
              <Stat
                key={t}
                label={RESPONDENT_TYPE_LABEL[t]}
                value={x?.count ?? 0}
                hint={x ? `avg ${x.avgScorePct}%` : undefined}
              />
            );
          })}
        </div>
      )}

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="individual">Individual ({responses?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4 pt-2">
          {analytics?.questions.map((q) => (
            <Card key={q.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-slate-800">{q.label}</span>
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    {q.constructiveRate}% constructive
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {q.options.map((o) => (
                  <div key={o.id} className="space-y-1">
                    <div className="flex items-start justify-between gap-3 text-xs">
                      <span className={o.constructive ? 'font-medium text-emerald-700' : 'text-slate-600'}>
                        {o.id}. {o.text}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500">
                        {o.count} · {o.pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${o.constructive ? 'bg-emerald-500' : 'bg-amber-400'}`}
                        style={{ width: `${o.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          {analytics && analytics.byInstitution.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-800">By institution</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>
                      <th className="py-1.5 pr-3">Institution</th>
                      <th className="py-1.5 pr-3 text-right">Responses</th>
                      <th className="py-1.5 text-right">Avg score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.byInstitution.map((i) => (
                      <tr key={i.name} className="border-t">
                        <td className="py-1.5 pr-3">{i.name}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{i.count}</td>
                        <td className="py-1.5 text-right tabular-nums">{i.avgScorePct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="individual" className="space-y-3 pt-2">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, mobile, institution…"
              className="pl-8"
            />
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">S.No</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Designation</th>
                    <th className="px-3 py-2">Institution</th>
                    <th className="px-3 py-2">Email ID</th>
                    <th className="px-3 py-2">Mobile</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Response</th>
                    <th className="px-3 py-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                        No responses yet.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, i) => (
                      <tr key={r.id} className="border-t align-top">
                        <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                        <td className="px-3 py-2">{r.designation ?? '—'}</td>
                        <td className="px-3 py-2">{r.institution_name ?? '—'}</td>
                        <td className="px-3 py-2">{r.email}</td>
                        <td className="px-3 py-2">{r.mobile ?? '—'}</td>
                        <td className="px-3 py-2">{RESPONDENT_TYPE_LABEL[r.respondent_type]}</td>
                        <td className="px-3 py-2 font-mono text-xs">{responseSummary(survey, r)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.constructive_count}/{r.total_questions}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
