'use client';

// ============================================================
// /cdc/admin/exam-topic-map — topic ↔ exam mapping editor
// ============================================================
// The in-app CRUD surface for the govt-job-readiness junction
// (cdc_exam_topic_map). Before this page the junction was seed-only: a CDC head
// who added a new syllabus topic or a new government-exam training type got zero
// mappings, and the cohort-overlap view showed "0% shared" with no fix short of
// raw SQL (deep-review #3).
//
// The editor is a full matrix — EVERY active topic is a row (including brand-new
// ones with no mappings yet) and every active government-exam type is a column.
// Toggling a cell adds/removes one mapping via /api/admin/cdc/exam-topic-map,
// which is gated to CDC Head / super-admin (RLS is_cdc_head_or_super() plus the
// route's server auth check). Access to the page itself is enforced by the
// /cdc/admin RoutePermissionGuard layout on cdc.training.edit.
// ============================================================

import Link from 'next/link';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, Loader2, ArrowLeft, ListTree } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface ExamType { id: string; display_name: string; exam_family: string | null }
interface Topic { id: string; display_name: string; is_shared: boolean }
interface MapRow { exam_training_type_id: string; topic_id: string }
interface MatrixData { exams: ExamType[]; topics: Topic[]; map: MapRow[] }

const cellKey = (examId: string, topicId: string) => `${examId}::${topicId}`;

async function loadMatrix(): Promise<MatrixData> {
  const db = createClientSupabaseClient();
  const [typesRes, topicsRes, mapRows] = await Promise.all([
    db.from('cdc_training_types')
      .select('id, display_name, exam_family')
      .not('exam_family', 'is', null)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    db.from('cdc_exam_syllabus_topics')
      .select('id, display_name, is_shared')
      .eq('is_active', true)
      .order('is_shared', { ascending: false })
      .order('sort_order', { ascending: true }),
    // The map read is server-paginated (past PostgREST's 1000-row cap).
    fetch('/api/admin/cdc/exam-topic-map').then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Failed to load mappings');
      return (j.data ?? []) as MapRow[];
    }),
  ]);

  if (typesRes.error) throw typesRes.error;
  if (topicsRes.error) throw topicsRes.error;

  return {
    exams: (typesRes.data ?? []) as ExamType[],
    topics: (topicsRes.data ?? []) as Topic[],
    map: mapRows,
  };
}

export default function ExamTopicMapPage() {
  const { isLoading: authLoading } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cdc-exam-topic-map-editor'],
    queryFn: loadMatrix,
    enabled: !authLoading,
    staleTime: 30 * 1000,
  });

  // Local, editable cell set seeded from the server map. Optimistic toggles
  // mutate this; a failed write reverts the single cell that failed.
  const [cells, setCells] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Re-seed whenever the server map identity changes (initial load / refetch).
  const serverMapKey = useMemo(
    () => (data ? data.map.map((m) => cellKey(m.exam_training_type_id, m.topic_id)).sort().join('|') : ''),
    [data],
  );
  useEffect(() => {
    if (data) setCells(new Set(data.map.map((m) => cellKey(m.exam_training_type_id, m.topic_id))));
  }, [serverMapKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(
    async (examId: string, topicId: string) => {
      const key = cellKey(examId, topicId);
      if (pending.has(key)) return;
      const currentlyOn = cells.has(key);

      // Optimistic flip.
      setCells((prev) => {
        const next = new Set(prev);
        if (currentlyOn) next.delete(key);
        else next.add(key);
        return next;
      });
      setPending((prev) => new Set(prev).add(key));

      try {
        const res = currentlyOn
          ? await fetch(`/api/admin/cdc/exam-topic-map?exam=${examId}&topic=${topicId}`, { method: 'DELETE' })
          : await fetch('/api/admin/cdc/exam-topic-map', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ exam_training_type_id: examId, topic_id: topicId }),
            });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? 'Save failed');
      } catch (e: any) {
        // Revert the single failed cell.
        setCells((prev) => {
          const next = new Set(prev);
          if (currentlyOn) next.add(key);
          else next.delete(key);
          return next;
        });
        toast.error(e?.message ?? 'Save failed');
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [cells, pending],
  );

  const breadcrumbs = [
    { label: 'CDC', href: '/cdc' },
    { label: 'Admin', href: '/cdc/admin' },
    { label: 'Exam Topic Map', href: '/cdc/admin/exam-topic-map' },
  ];

  return (
    <ContentLayout title="Exam Topic Map">
      <PageBreadcrumb items={breadcrumbs} />

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ListTree className="w-6 h-6 text-primary" />
            Exam Topic Map
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Map each government-exam type to the syllabus topics it covers. Toggle a cell to add or
            remove a mapping. Shared topics that span several exams are what let one coaching cohort
            serve multiple exams — the{' '}
            <Link href="/cdc/govt-readiness" className="text-primary underline underline-offset-2">
              cohort-overlap view
            </Link>{' '}
            computes its shared-vs-domain split from exactly these mappings.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/cdc/admin/exam-syllabus-topics">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Syllabus topics
          </Link>
        </Button>
      </div>

      {authLoading || isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{error instanceof Error ? error.message : 'Something went wrong.'}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : !data || data.exams.length === 0 ? (
        <Alert>
          <AlertTitle>No government-exam types yet</AlertTitle>
          <AlertDescription>
            Add government-exam training types (with an exam-family tag) under{' '}
            <Link href="/cdc/admin/training-types" className="text-primary underline underline-offset-2">
              Training Types
            </Link>{' '}
            first, then return here to map their syllabus topics.
          </AlertDescription>
        </Alert>
      ) : data.topics.length === 0 ? (
        <Alert>
          <AlertTitle>No syllabus topics yet</AlertTitle>
          <AlertDescription>
            Add syllabus topics under{' '}
            <Link href="/cdc/admin/exam-syllabus-topics" className="text-primary underline underline-offset-2">
              Exam Syllabus Topics
            </Link>{' '}
            first, then map them to exams here.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-3 font-medium sticky left-0 bg-muted/30 z-10">Topic</th>
                  {data.exams.map((ex) => (
                    <th key={ex.id} className="px-3 py-3 font-medium text-center whitespace-nowrap text-xs">
                      {ex.display_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.topics.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium sticky left-0 bg-background z-10">
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
                      const key = cellKey(ex.id, t.id);
                      const on = cells.has(key);
                      const busy = pending.has(key);
                      return (
                        <td key={ex.id} className="px-3 py-2 text-center">
                          <button
                            type="button"
                            aria-pressed={on}
                            aria-label={`${on ? 'Unmap' : 'Map'} ${t.display_name} for ${ex.display_name}`}
                            disabled={busy}
                            onClick={() => toggle(ex.id, t.id)}
                            className={[
                              'inline-flex h-6 w-6 items-center justify-center rounded border transition-colors',
                              on
                                ? (t.is_shared ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-amber-500 border-amber-500 text-white')
                                : 'bg-background border-muted-foreground/30 hover:border-primary/60',
                              busy ? 'opacity-50 cursor-wait' : 'cursor-pointer',
                            ].join(' ')}
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : on ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <span className="sr-only">not mapped</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </ContentLayout>
  );
}
