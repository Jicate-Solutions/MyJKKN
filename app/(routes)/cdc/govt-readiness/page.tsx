'use client';

// ============================================================
// /cdc/govt-readiness — Government-Job-Readiness cohort-overlap view
// ============================================================
// The bare-route page for the govt-job-readiness track (so /cdc/govt-readiness
// never 404s). Proves the reframe's load-bearing claim — "one coaching cohort
// serves multiple government exams" — as a COMPUTED fact, not a hardcoded
// number: it reads the cdc_exam_syllabus_topics × cdc_exam_topic_map data and
// derives, per exam and overall, how much of the syllabus is shared vs
// domain-specific. NO 60/40 (or any %) is hardcoded; the split moves when the
// CDC head edits the topic rows' is_shared flags.
//
// Source spec: specs/cdc-govt-jobs-readiness-2026-07-04.md (PR-4 / Option B).
// Data model: govt-exam types = cdc_training_types WHERE exam_family IS NOT NULL.
// ============================================================

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Target, Check, BookOpen, Info, Settings2 } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface ExamType { id: string; config_key: string; display_name: string; exam_family: string | null }
interface Topic { id: string; config_key: string; display_name: string; is_shared: boolean }
interface MapRow { exam_training_type_id: string; topic_id: string }

interface OverlapData { exams: ExamType[]; topics: Topic[]; map: MapRow[] }

// PostgREST caps a single response at 1000 rows by default. The topic↔exam
// junction is exams × topics, so on a fully-populated map it can exceed 1000 —
// a silent truncation would skew the computed shared-vs-domain split (the whole
// point of this page). Page through with an explicit ordered .range() loop until
// a short page proves the map is exhausted, so the split is always computed over
// the FULL map (deep-review #2).
const MAP_PAGE_SIZE = 1000;

async function loadFullTopicMap(
  db: ReturnType<typeof createClientSupabaseClient>,
): Promise<MapRow[]> {
  const all: MapRow[] = [];
  for (let from = 0; ; from += MAP_PAGE_SIZE) {
    const { data, error } = await db
      .from('cdc_exam_topic_map')
      .select('exam_training_type_id, topic_id')
      // Stable ordering is required for correct pagination.
      .order('exam_training_type_id', { ascending: true })
      .order('topic_id', { ascending: true })
      .range(from, from + MAP_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as MapRow[];
    all.push(...rows);
    if (rows.length < MAP_PAGE_SIZE) break; // last (short) page → exhausted
  }
  return all;
}

async function loadOverlap(): Promise<OverlapData> {
  // Direct client reads of cdc_training_types / cdc_exam_syllabus_topics /
  // cdc_exam_topic_map are the intended config-master public-read pattern: their
  // RLS SELECT policy is auth.uid() IS NOT NULL (no institution scope, no PII),
  // matching the sibling CDC masters (cdc_drive_types / cdc_offer_types / …). See
  // 20260704090100_cdc_exam_syllabus_topics.sql §5 for the rationale. Writes are
  // the real boundary and are gated elsewhere.
  const db = createClientSupabaseClient();
  const [typesRes, topicsRes, map] = await Promise.all([
    db.from('cdc_training_types')
      .select('id, config_key, display_name, exam_family')
      // exam_family is free-text; a blank ('') tag would slip past the null
      // filter and become a phantom govt-exam column that pollutes the
      // shared-vs-domain split (deep-review R3 #2), so exclude '' too.
      .not('exam_family', 'is', null)
      .neq('exam_family', '')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    db.from('cdc_exam_syllabus_topics')
      .select('id, config_key, display_name, is_shared')
      .eq('is_active', true)
      .order('is_shared', { ascending: false })
      .order('sort_order', { ascending: true }),
    loadFullTopicMap(db),
  ]);

  if (typesRes.error) throw typesRes.error;
  if (topicsRes.error) throw topicsRes.error;

  return {
    exams: (typesRes.data ?? []) as ExamType[],
    topics: (topicsRes.data ?? []) as Topic[],
    map,
  };
}

export default function GovtReadinessPage() {
  const { isLoading: authLoading } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cdc-govt-readiness-overlap'],
    queryFn: loadOverlap,
    enabled: !authLoading,
    staleTime: 60 * 1000,
  });

  const derived = useMemo(() => {
    if (!data) return null;
    const { exams, topics, map } = data;

    const mappedTopicIds = new Set(map.map((m) => m.topic_id));
    // Only topics actually mapped to at least one exam participate in the split.
    const activeTopics = topics.filter((t) => mappedTopicIds.has(t.id));
    const sharedTopics = activeTopics.filter((t) => t.is_shared);
    const domainTopics = activeTopics.filter((t) => !t.is_shared);

    // Cell lookup: which (exam, topic) pairs are mapped.
    const cell = new Set(map.map((m) => `${m.exam_training_type_id}::${m.topic_id}`));

    // Per-exam split — DATA-DRIVEN (count of is_shared over mapped topics).
    const perExam = exams.map((ex) => {
      const mine = activeTopics.filter((t) => cell.has(`${ex.id}::${t.id}`));
      const sharedCount = mine.filter((t) => t.is_shared).length;
      const total = mine.length;
      const pct = total > 0 ? Math.round((sharedCount / total) * 100) : 0;
      return { exam: ex, total, sharedCount, domainCount: total - sharedCount, sharedPct: pct };
    });

    // Overall shared share across the whole active topic set.
    const overallShared = activeTopics.length > 0
      ? Math.round((sharedTopics.length / activeTopics.length) * 100)
      : 0;

    // How many exams each shared topic serves (the "one cohort, many exams" proof).
    const sharedReach = sharedTopics.map((t) => ({
      topic: t,
      examCount: exams.filter((ex) => cell.has(`${ex.id}::${t.id}`)).length,
    }));
    const maxReach = sharedReach.reduce((m, r) => Math.max(m, r.examCount), 0);

    return { activeTopics, sharedTopics, domainTopics, cell, perExam, overallShared, maxReach };
  }, [data]);

  return (
    <PermissionGuard module="cdc.govt_readiness" action="view">
      <ContentLayout title="CDC — Government Job Readiness">
        <PageBreadcrumb items={[
          { label: 'Home', href: '/' },
          { label: 'CDC', href: '/cdc' },
          { label: 'Government Job Readiness' },
        ]} />

        <div className="space-y-6 mt-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Target className="w-6 h-6 text-primary" />
                Government Job Readiness
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Coaching cohorts for TNPSC, RRB (railways), banking (IBPS/SBI) and SSC / TN Police (TNUSRB).
                The shared-syllabus overlap below is computed live from the topic map — it is not a fixed number.
              </p>
            </div>
            <PermissionGuard module="cdc.training" action="view">
              <Button asChild variant="outline">
                <Link href="/cdc/training?exam=govt">
                  <BookOpen className="w-4 h-4 mr-2" />
                  Training programmes
                </Link>
              </Button>
            </PermissionGuard>
          </div>

          {/* Skeleton while auth is still resolving too (query is disabled until
              then): with enabled:false, react-query reports isLoading=false /
              data=undefined, which would otherwise flash the "No government-exam
              types yet" empty state before the real fetch runs (deep-review #7). */}
          {authLoading || isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : isError ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Target className="w-12 h-12 text-destructive/40" />
                <p className="text-lg font-medium text-destructive">Failed to load government-readiness data</p>
                <p className="text-sm text-muted-foreground">
                  {error instanceof Error ? error.message : 'Something went wrong. Please try again.'}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
              </CardContent>
            </Card>
          ) : !data || data.exams.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-2">
                <Target className="w-12 h-12 text-muted-foreground" />
                <p className="text-lg font-medium">No government-exam types yet</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  Add government-exam training types (with an exam-family tag) under CDC Admin → Training Types,
                  then map their syllabus topics under Exam Syllabus Topics.
                </p>
              </CardContent>
            </Card>
          ) : derived && (
            <>
              {/* Summary tiles */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Government exams" value={data.exams.length} hint="tagged with an exam family" />
                <StatTile label="Syllabus topics mapped" value={derived.activeTopics.length}
                  hint={`${derived.sharedTopics.length} shared · ${derived.domainTopics.length} domain-specific`} />
                <StatTile label="Shared syllabus" value={`${derived.overallShared}%`}
                  hint="of mapped topics are common across exams (computed)" />
                <StatTile label="Widest-reaching topic" value={derived.maxReach > 0 ? `${derived.maxReach} exams` : '—'}
                  hint="one shared topic serves this many exams" />
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Why this matters</AlertTitle>
                <AlertDescription className="text-sm">
                  Shared topics span multiple exams, so a single coaching cohort provably prepares learners for
                  several government exams at once. These figures are derived from the topic map — the ~60/40
                  split cited in the reframe is an unverified estimate and is <strong>not</strong> hardcoded anywhere.
                </AlertDescription>
              </Alert>

              {/* Per-exam split */}
              <div>
                <h2 className="text-lg font-semibold mb-3">Shared-vs-domain split per exam</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {derived.perExam.map(({ exam, total, sharedCount, domainCount, sharedPct }) => (
                    <Card key={exam.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base line-clamp-2">{exam.display_name}</CardTitle>
                          {exam.exam_family && (
                            <Badge variant="outline" className="shrink-0 text-xs">{exam.exam_family}</Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs">{total} topics mapped</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-amber-100">
                          <div className="h-full bg-emerald-500" style={{ width: `${sharedPct}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span className="text-emerald-700 font-medium">{sharedCount} shared ({sharedPct}%)</span>
                          <span className="text-amber-700 font-medium">{domainCount} domain</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Overlap matrix */}
              <div>
                <h2 className="text-lg font-semibold mb-3">Topic × exam overlap</h2>
                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium sticky left-0 bg-muted/30">Topic</th>
                          {data.exams.map((ex) => (
                            <th key={ex.id} className="px-3 py-3 font-medium text-center whitespace-nowrap text-xs">
                              {ex.display_name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {derived.activeTopics.map((t) => (
                          <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-medium sticky left-0 bg-background">
                              <div className="flex items-center gap-2">
                                {t.display_name}
                                {t.is_shared ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">shared</span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">domain</span>
                                )}
                              </div>
                            </td>
                            {data.exams.map((ex) => {
                              const on = derived.cell.has(`${ex.id}::${t.id}`);
                              return (
                                <td key={ex.id} className="px-3 py-2.5 text-center">
                                  {on ? (
                                    <Check className={`inline w-4 h-4 ${t.is_shared ? 'text-emerald-600' : 'text-amber-600'}`} />
                                  ) : (
                                    <span className="text-muted-foreground/30">·</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>

              {/* Admin links (only where the user can edit masters) */}
              <PermissionGuard module="cdc.training" action="edit">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Settings2 className="w-4 h-4" />
                  <span>
                    Curate topics and the shared/domain flags under{' '}
                    <Link href="/cdc/admin/exam-syllabus-topics" className="text-primary underline underline-offset-2">
                      Exam Syllabus Topics
                    </Link>
                    , and map topics to exams under{' '}
                    <Link href="/cdc/admin/exam-topic-map" className="text-primary underline underline-offset-2">
                      Exam Topic Map
                    </Link>.
                  </span>
                </div>
              </PermissionGuard>
            </>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
