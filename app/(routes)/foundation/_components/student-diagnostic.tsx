'use client';

// Foundation — Student diagnostic body. Reads the student's weakness map
// (mastery per topic, weak-first), their revision plans, and a progress summary
// from fn_fp_student_progress. Faculty with manage rights can recompute mastery
// and (re)generate a revision plan; guardians/students see the read-only view.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarClock,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  useGenerateRevisionPlan,
  useRecomputeWeakness,
  useRevisionPlans,
  useStudentExams,
  useStudentProgress,
  useTopics,
  useWeaknessMap,
} from '@/hooks/foundation/use-foundation';
import type {
  RevisionPlan,
  StudentProgress,
  WeaknessRow,
} from '@/lib/services/foundation/foundation-service';
import { MasteryMeter, bandFor, toPercent } from './mastery-meter';

interface StudentDiagnosticProps {
  studentId: string;
  /** When true, expose recompute + generate-plan actions. */
  canManage: boolean;
}

export function StudentDiagnostic({
  studentId,
  canManage,
}: StudentDiagnosticProps) {
  const { data: exams, isLoading: examsLoading } = useStudentExams(studentId);
  const [examId, setExamId] = useState<string>('');

  useEffect(() => {
    if (!examId && exams && exams.length > 0) setExamId(exams[0].id);
  }, [exams, examId]);

  if (examsLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (!exams || exams.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <Target className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <h3 className="mt-3 text-sm font-semibold text-foreground">
          Not enrolled in any exam yet
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Once this student joins a foundation cohort, their diagnostic map will
          build here from their attempts.
        </p>
      </div>
    );
  }

  const activeExam = exams.find((e) => e.id === examId) ?? exams[0];

  return (
    <div className="space-y-6">
      {exams.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Exam
          </span>
          <Select value={activeExam.id} onValueChange={setExamId}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
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
      )}

      <ProgressSummary studentId={studentId} examId={activeExam.id} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <WeaknessMap
          studentId={studentId}
          examId={activeExam.id}
          canManage={canManage}
        />
        <RevisionPlans
          studentId={studentId}
          examId={activeExam.id}
          canManage={canManage}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress summary
// ---------------------------------------------------------------------------

function ProgressSummary({
  studentId,
  examId,
}: {
  studentId: string;
  examId: string;
}) {
  const { data, isLoading } = useStudentProgress(studentId, examId);
  // The weakness map is the ground-truth attempts signal; the progress-summary
  // RPC (fn_fp_student_progress) can lag behind it. Read it here so this strip
  // never claims "no attempts" while the map below shows topics the student has
  // already attempted.
  const { data: weaknessRows, isLoading: weaknessLoading } = useWeaknessMap(
    studentId,
    examId,
  );

  if (isLoading || weaknessLoading)
    return <Skeleton className="h-24 w-full rounded-xl" />;
  const p = (data ?? {}) as StudentProgress;

  const cells: { label: string; value: string }[] = [];
  const push = (label: string, v: number | null | undefined, suffix = '') => {
    if (v !== null && v !== undefined && !Number.isNaN(v)) {
      cells.push({ label, value: `${v}${suffix}` });
    }
  };
  push('Attempts', p.attempts ?? p.assessments_taken);
  const avg = p.avg_score ?? null;
  if (avg !== null && avg !== undefined) {
    cells.push({
      label: 'Avg score',
      value: `${avg <= 1 ? Math.round(avg * 100) : Math.round(avg)}%`,
    });
  }
  const mastery = toPercent(p.mastery_avg);
  if (mastery !== null) cells.push({ label: 'Avg mastery', value: `${mastery}%` });
  push('Topics tracked', p.topics_tracked);
  push('Weak topics', p.topics_weak);

  // Fallback: if the progress RPC returned nothing usable but the weakness map
  // has rows, derive the strip from the map so it stays consistent with what the
  // student clearly has (attempts + tracked topics) instead of contradicting it.
  const rows = weaknessRows ?? [];
  if (cells.length === 0 && rows.length > 0) {
    const mapAttempts = rows.reduce((sum, r) => sum + (r.attempts_count ?? 0), 0);
    if (mapAttempts > 0) push('Attempts', mapAttempts);
    push('Topics tracked', rows.length);
  }

  // Only the genuinely-empty state (no summary AND no attempted topics) shows this.
  if (cells.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        No attempts recorded yet — the progress summary fills in as this student
        completes assessments.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-10 gap-y-4 rounded-xl border border-border bg-card p-5">
      {cells.map((c) => (
        <div key={c.label}>
          <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">
            {c.value}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weakness map — the diagnostic heart
// ---------------------------------------------------------------------------

function WeaknessMap({
  studentId,
  examId,
  canManage,
}: {
  studentId: string;
  examId: string;
  canManage: boolean;
}) {
  const { data: rows, isLoading } = useWeaknessMap(studentId, examId);
  const recompute = useRecomputeWeakness();

  async function handleRecompute() {
    try {
      await recompute.mutateAsync({ studentId, examDefinitionId: examId });
      toast.success('Mastery recomputed from latest attempts');
    } catch (err: any) {
      toast.error(err?.message ?? 'Recompute failed');
    }
  }

  const weakCount = useMemo(
    () =>
      (rows ?? []).filter((r) => bandFor(toPercent(r.mastery_score)) === 'weak')
        .length,
    [rows],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Target className="h-3.5 w-3.5" />
          Weakness map
          {rows && rows.length > 0 && weakCount > 0 && (
            <Badge variant="destructive" className="ml-1 text-[10px]">
              {weakCount} weak
            </Badge>
          )}
        </h3>
        {canManage && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRecompute}
            disabled={recompute.isPending}
            className="h-7 text-xs"
          >
            {recompute.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            Recompute
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : !rows || rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No mastery data yet. It builds from the student&apos;s attempts.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rows.map((r: WeaknessRow) => (
            <li
              key={r.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(140px,220px)] items-center gap-4 px-4 py-3"
            >
              <span className="truncate text-sm font-medium text-foreground">
                {r.topic?.display_name ?? 'Unmapped topic'}
              </span>
              <MasteryMeter
                score={r.mastery_score}
                attempts={r.attempts_count}
                compact
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revision plans
// ---------------------------------------------------------------------------

function RevisionPlans({
  studentId,
  examId,
  canManage,
}: {
  studentId: string;
  examId: string;
  canManage: boolean;
}) {
  const { data: plans, isLoading } = useRevisionPlans(studentId, examId);
  const generate = useGenerateRevisionPlan();

  async function handleGenerate() {
    try {
      await generate.mutateAsync({ studentId, examDefinitionId: examId });
      toast.success('Revision plan generated');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not generate a plan');
    }
  }

  const active = plans?.[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          Revision plan
        </h3>
        {canManage && (
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generate.isPending}
            className="h-7 bg-[#0b6d41] text-xs hover:bg-[#0a5c37]"
          >
            {generate.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            {active ? 'Regenerate' : 'Generate'}
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : !active ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No revision plan yet.
          {canManage
            ? ' Generate one from the current weakness map.'
            : ' Your resource person will generate one from your weak topics.'}
        </div>
      ) : (
        <RevisionPlanCard plan={active} />
      )}
    </div>
  );
}

function RevisionPlanCard({ plan }: { plan: RevisionPlan }) {
  // The generated plan stores topic_id (a UUID) with no display name; resolve it
  // so the plan renders as readable steps instead of a raw JSON dump.
  const { data: topics } = useTopics();
  const nameById = new Map<string, string>(
    (topics ?? []).map((t) => [t.id, t.display_name] as const),
  );
  const steps = extractSteps(plan.plan, nameById);
  const generatedAt = plan.generated_at
    ? new Date(plan.generated_at).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <div className="rounded-xl border border-[#0b6d41]/25 bg-[#0b6d41]/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        {generatedAt && (
          <span className="text-xs text-muted-foreground">
            Generated {generatedAt}
          </span>
        )}
        {plan.status && (
          <Badge variant="outline" className="capitalize">
            {plan.status}
          </Badge>
        )}
      </div>

      {steps.length > 0 ? (
        <ol className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0b6d41] font-mono text-[11px] font-bold tabular-nums text-white">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                {s.detail && (
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          {JSON.stringify(plan.plan, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * Defensive extraction of an ordered step list from an unknown plan jsonb.
 * Handles the likely shapes: { steps|items|topics: [...] } where each entry is
 * a string or an object with title/topic/name + detail/reason/description.
 */
function extractSteps(
  plan: any,
  nameById?: Map<string, string>,
): { title: string; detail?: string }[] {
  if (!plan) return [];
  const arr =
    (Array.isArray(plan) && plan) ||
    plan.steps ||
    plan.items ||
    plan.topics ||
    plan.plan ||
    null;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((entry: any) => {
      if (typeof entry === 'string') return { title: entry };
      if (entry && typeof entry === 'object') {
        // fn_fp_generate_revision_plan emits { topic_id, mastery_score,
        // attempts_count, recommended_item_ids } with NO display name — resolve
        // the topic_id to a readable name and synthesize a detail line from the
        // numeric fields, so the plan renders as steps rather than a JSON blob.
        const title =
          entry.title ??
          entry.topic ??
          entry.name ??
          entry.label ??
          (entry.topic_id
            ? (nameById?.get(entry.topic_id) ?? 'Weak topic')
            : '');
        let detail =
          entry.detail ?? entry.reason ?? entry.description ?? entry.note;
        if (
          detail == null &&
          (entry.mastery_score != null ||
            Array.isArray(entry.recommended_item_ids))
        ) {
          const bits: string[] = [];
          if (entry.mastery_score != null)
            bits.push(`${Math.round(Number(entry.mastery_score) * 100)}% mastery`);
          if (Array.isArray(entry.recommended_item_ids))
            bits.push(
              `${entry.recommended_item_ids.length} practice item${
                entry.recommended_item_ids.length === 1 ? '' : 's'
              }`,
            );
          detail = bits.join(' · ') || undefined;
        }
        if (!title && !detail) return null;
        return { title: String(title || detail), detail: title ? detail : undefined };
      }
      return null;
    })
    .filter(Boolean) as { title: string; detail?: string }[];
}
