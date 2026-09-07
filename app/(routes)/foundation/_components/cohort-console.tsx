'use client';

// Foundation — Faculty console body. Left rail lists the resource person's
// active cohorts (exam · term · headcount); the right panel opens the selected
// cohort's roster plus the two authoring entry points (author question / build
// assessment) and the cohort's assessment list.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpenCheck,
  GraduationCap,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth-provider';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAssessments,
  useCohorts,
  useRoster,
  useSetCohortResourcePerson,
} from '@/hooks/foundation/use-foundation';
import type { FoundationCohort } from '@/lib/services/foundation/foundation-service';
import { ItemAuthorDialog } from './item-author-dialog';
import { EnrollLearnerDialog } from './enroll-learner-dialog';
import { AssessmentBuilderDialog } from './assessment-builder-dialog';
import { ItemReviewPanel } from './item-review-panel';

const KIND_STYLES: Record<string, string> = {
  diagnostic: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  practice:
    'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
  mock: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
};

export function CohortConsole() {
  const { data: cohorts, isLoading, isError } = useCohorts();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select the first cohort once loaded.
  useEffect(() => {
    if (!selectedId && cohorts && cohorts.length > 0) {
      setSelectedId(cohorts[0].id);
    }
  }, [cohorts, selectedId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        Could not load cohorts. Refresh to try again.
      </div>
    );
  }

  if (!cohorts || cohorts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <GraduationCap className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <h3 className="mt-3 text-sm font-semibold text-foreground">
          No active cohorts
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Cohorts you lead as a resource person will appear here once they are
          created for your school.
        </p>
      </div>
    );
  }

  const selected = cohorts.find((c) => c.id === selectedId) ?? cohorts[0];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-2">
        {cohorts.map((c) => (
          <CohortCard
            key={c.id}
            cohort={c}
            active={c.id === selected.id}
            onSelect={() => setSelectedId(c.id)}
          />
        ))}
      </aside>

      <section className="min-w-0">
        <CohortDetail cohort={selected} />
      </section>
    </div>
  );
}

function CohortCard({
  cohort,
  active,
  onSelect,
}: {
  cohort: FoundationCohort;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-4 text-left transition-all',
        active
          ? 'border-[#0b6d41] bg-[#0b6d41]/[0.04] shadow-sm ring-1 ring-[#0b6d41]/20'
          : 'border-border hover:border-[#0b6d41]/40 hover:bg-muted/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-tight text-foreground">
          {cohort.exam_definition?.display_name ?? 'Exam'}
        </span>
        {cohort.exam_definition?.level && (
          <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
            {cohort.exam_definition.level}
          </Badge>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        {cohort.term && <span>{cohort.term}</span>}
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          <span className="font-mono tabular-nums">
            {cohort.enrolled_count ?? 0}
          </span>
        </span>
      </div>
    </button>
  );
}

function CohortDetail({ cohort }: { cohort: FoundationCohort }) {
  const { canAccess } = usePermissions();
  const canAuthorItems = canAccess('foundation', 'items.manage');
  const canBuildAssessments = canAccess('foundation', 'assessments.manage');
  const canManageStudents = canAccess('foundation', 'students.manage');
  const canManageCohorts = canAccess('foundation', 'cohorts.manage');
  const examId = cohort.exam_definition_id;
  const examName = cohort.exam_definition?.display_name;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {examName ?? 'Exam'}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {cohort.term && <span>{cohort.term}</span>}
            {cohort.resource_person?.full_name && (
              <span className="flex items-center gap-1">
                <GraduationCap className="h-3 w-3" />
                {cohort.resource_person.full_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span className="font-mono tabular-nums">
                {cohort.enrolled_count ?? 0}
              </span>{' '}
              enrolled
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {canAuthorItems && (
            <ItemAuthorDialog examDefinitionId={examId} examName={examName} />
          )}
          {canBuildAssessments && (
            <AssessmentBuilderDialog
              cohortId={cohort.id}
              examDefinitionId={examId}
              examName={examName}
            />
          )}
          {canManageStudents && <EnrollLearnerDialog cohort={cohort} />}
        </div>
      </div>

      {!cohort.resource_person_id && canManageCohorts && (
        <UnassignedCohortNotice cohort={cohort} />
      )}
      <AssessmentStrip cohortId={cohort.id} />
      <ItemReviewPanel examDefinitionId={examId} />
      <RosterTable cohort={cohort} canManageStudents={canManageStudents} />
    </div>
  );
}

/**
 * A cohort with no resource person is invisible to the people meant to run it.
 * /api/foundation/practice/facilitate scopes its query to
 * `resource_person_id = the caller`, so a NULL here means the cohort exists,
 * is active, has a school and an exam — and can be opened by nobody. This says
 * so plainly and offers the one-click fix, rather than leaving an empty screen
 * that looks like there is simply no work to do.
 */
function UnassignedCohortNotice({ cohort }: { cohort: FoundationCohort }) {
  const { profile } = useAuth();
  const setResourcePerson = useSetCohortResourcePerson();

  async function claim() {
    if (!profile?.id) return;
    try {
      await setResourcePerson.mutateAsync({
        cohortId: cohort.id,
        resourcePersonId: profile.id,
      });
      toast.success('You are now the resource person for this cohort');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not assign the resource person');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <div>
          <p className="font-medium text-amber-900 dark:text-amber-200">
            This cohort has no resource person
          </p>
          <p className="text-amber-800/90 dark:text-amber-300/90">
            Nobody can open it from the facilitation screen until one is
            assigned — that screen only ever shows a person their own cohorts.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={claim}
        disabled={!profile?.id || setResourcePerson.isPending}
      >
        {setResourcePerson.isPending && (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        )}
        Assign me
      </Button>
    </div>
  );
}

function AssessmentStrip({ cohortId }: { cohortId: string }) {
  const { data: assessments, isLoading } = useAssessments(cohortId);

  if (isLoading) return <Skeleton className="h-20 w-full rounded-xl" />;
  if (!assessments || assessments.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <BookOpenCheck className="h-3.5 w-3.5" />
        Assessments
      </h3>
      <div className="flex flex-wrap gap-2">
        {assessments.map((a) => (
          <div
            key={a.id}
            className="flex max-w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                KIND_STYLES[a.kind] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {a.kind}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {a.title}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {a.item_count ?? 0} Q
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RosterTable({
  cohort,
  canManageStudents,
}: {
  cohort: FoundationCohort;
  canManageStudents: boolean;
}) {
  const { data: roster, isLoading } = useRoster(cohort.id);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  if (!roster || roster.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <p>No learners enrolled in this cohort yet.</p>
        {canManageStudents && <EnrollLearnerDialog cohort={cohort} />}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Student</TableHead>
            <TableHead className="w-20">Grade</TableHead>
            <TableHead className="w-28">Consent</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-16 text-right">Diagnostic</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roster.map((entry) => {
            const s = entry.student;
            if (!s) return null;
            const consented = !!s.parental_consent_at;
            return (
              <TableRow key={entry.enrollment_id}>
                <TableCell className="font-medium text-foreground">
                  {s.full_name ?? 'Unnamed student'}
                </TableCell>
                <TableCell className="font-mono text-sm tabular-nums text-muted-foreground">
                  {s.grade ?? '—'}
                </TableCell>
                <TableCell>
                  {consented ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      On file
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Pending
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {entry.status ?? s.status ?? 'active'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/foundation/students/${s.id}`}
                    className="inline-flex items-center gap-0.5 text-sm font-medium text-[#0b6d41] hover:underline"
                    aria-label={`Open diagnostic for ${s.full_name ?? 'student'}`}
                  >
                    Open
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
