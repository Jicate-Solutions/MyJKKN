'use client';

// term-calendar-view.tsx
//
// School + academic year pickers over the term calendar editor.
//
// The institution list is restricted to entity_type='school' inside
// useSchoolYearSelection. That filter is the module's whole boundary:
// school_term_calendars has no column saying "schools only", so a college
// institution chosen here would silently create a school calendar nobody can
// reach.

import { Info } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

import { usePermissions } from '@/hooks/use-permissions';
import { useSchoolYearSelection } from '@/hooks/school-fees/use-school-year-selection';
import { useSchoolTermCalendars } from '@/hooks/school-fees/use-school-term-calendars';

import { SchoolYearPicker } from '../../_components/school-year-picker';
import { TermCalendarForm } from './term-calendar-form';
import { TermCalendarCloneDialog } from './term-calendar-clone-dialog';

export function TermCalendarView() {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEdit = isSuperAdmin || canAccess('school_fees', 'manage');

  const {
    institutions,
    institutionId,
    setInstitutionChoice,
    yearOptions,
    academicYearId,
    setYearChoice,
    loadingInstitutions,
    loadingYears,
    ready,
  } = useSchoolYearSelection();

  const {
    terms,
    hasCalendar,
    loading: loadingCalendar,
    saveTerms,
    cloneFromYear,
  } = useSchoolTermCalendars(institutionId || undefined, academicYearId || undefined);

  return (
    <div className="space-y-6">
      <SchoolYearPicker
        institutions={institutions}
        institutionId={institutionId}
        onInstitutionChange={setInstitutionChoice}
        yearOptions={yearOptions}
        academicYearId={academicYearId}
        onYearChange={setYearChoice}
        loadingInstitutions={loadingInstitutions}
        loadingYears={loadingYears}
      />

      {!ready ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Choose a school and academic year</AlertTitle>
          <AlertDescription>
            Term due dates are set once per school per year, and every class fee plan in that year
            inherits them.
          </AlertDescription>
        </Alert>
      ) : loadingCalendar ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                Term calendar
                {hasCalendar ? (
                  <Badge variant="secondary">
                    {terms.length} term{terms.length === 1 ? '' : 's'}
                  </Badge>
                ) : (
                  <Badge variant="outline">Not set</Badge>
                )}
              </CardTitle>

              {canEdit ? (
                <TermCalendarCloneDialog
                  years={yearOptions}
                  targetAcademicYearId={academicYearId}
                  onClone={(fromId, shiftDays) => cloneFromYear(fromId, academicYearId, shiftDays)}
                />
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {!hasCalendar ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>No calendar defined for this year</AlertTitle>
                <AlertDescription>
                  Fee generation copies these dates onto every bill it raises. Until they are set,
                  bills for this year would have no due date and no fine could ever apply.
                </AlertDescription>
              </Alert>
            ) : null}

            <TermCalendarForm
              key={`${institutionId}:${academicYearId}`}
              institutionId={institutionId}
              academicYearId={academicYearId}
              existing={terms}
              saving={loadingCalendar}
              canEdit={canEdit}
              onSave={(rows) => saveTerms(rows)}
            />

            {!canEdit ? (
              <p className="text-xs text-muted-foreground">
                You have read-only access. Editing the term calendar requires the
                <code className="mx-1">school_fees.manage</code> permission.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
