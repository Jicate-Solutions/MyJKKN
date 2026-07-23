'use client';

// Foundation — Student diagnostic view.
// Permission-guarded (foundation.students.view). Shows the student's weakness
// map, revision plans and progress. Faculty with foundation.students.manage can
// recompute mastery and (re)generate revision plans. A denial renders an
// explicit 403 (PermissionError) — never a silent redirect (CLAUDE.md #27).

import { useParams } from 'next/navigation';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useStudent } from '@/hooks/foundation/use-foundation';
import { FoundationHeader, HeaderStat } from '../../_components/foundation-header';
import { StudentDiagnostic } from '../../_components/student-diagnostic';

export default function FoundationStudentPage() {
  const params = useParams<{ id: string }>();
  const studentId = params?.id ?? '';

  const { isLoading, canAccess } = usePermissions();
  const canView = canAccess('foundation', 'students.view');
  const canManage = canAccess('foundation', 'students.manage');

  const { data: student, isLoading: studentLoading } = useStudent(
    !isLoading && canView ? studentId : null,
  );

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="You do not have access to this student's diagnostic."
          requiredPermission="foundation.students.view"
        />
      </div>
    );
  }

  const consented = !!student?.parental_consent_at;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title={
          studentLoading
            ? 'Student diagnostic'
            : student?.full_name ?? 'Student diagnostic'
        }
        subtitle="Mastery map, revision plan and progress across the exams this student is enrolled in."
        crumbs={[
          { label: 'Foundation', href: '/foundation' },
          { label: 'Console', href: '/foundation/console' },
          { label: student?.full_name ?? 'Student' },
        ]}
        actions={
          student ? (
            <div className="flex items-center gap-6">
              {student.grade && (
                <HeaderStat value={student.grade} label="Grade" />
              )}
              <div className="min-w-[96px]">
                {consented ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                    Consent on file
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400">
                    <ShieldAlert className="h-4 w-4" />
                    Consent pending
                  </span>
                )}
                {student.status && (
                  <div className="mt-1">
                    <Badge variant="secondary" className="capitalize">
                      {student.status}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          ) : undefined
        }
      />

      {!studentLoading && !student ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          This student could not be found, or is outside your access scope.
        </div>
      ) : (
        <StudentDiagnostic studentId={studentId} canManage={canManage} />
      )}
    </div>
  );
}
