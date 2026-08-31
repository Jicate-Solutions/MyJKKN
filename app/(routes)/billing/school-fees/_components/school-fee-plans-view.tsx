'use client';

// school-fee-plans-view.tsx
//
// One row per CLASS, not per plan. A school's question is "which classes still
// need a 2026-27 fee?", and a plan-shaped list answers the opposite question —
// classes with no plan simply wouldn't appear, which is exactly the row you
// need to see before generating bills.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Info, Pencil, Plus, MoreHorizontal, CheckCircle2, Archive, Trash2, GitBranch, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { usePermissions } from '@/hooks/use-permissions';
import { useSchoolYearSelection } from '@/hooks/school-fees/use-school-year-selection';
import {
  useSchoolClasses,
  useSchoolFeePlans,
  useSchoolFeePlansForYear,
} from '@/hooks/school-fees/use-school-fee-plans';
import { useSchoolTermCalendars } from '@/hooks/school-fees/use-school-term-calendars';

import { SchoolYearPicker } from './school-year-picker';
import { CloneYearDialog } from './clone-year-dialog';
import type { SchoolFeePlan, SchoolFeePlanStatus } from '@/types/school-fees';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const STATUS_VARIANT: Record<SchoolFeePlanStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  draft: 'secondary',
  archived: 'outline',
};

export function SchoolFeePlansView() {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('school_fees', 'manage');
  const canActivate = isSuperAdmin || canAccess('school_fees', 'activate');

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

  const { classes, loading: loadingClasses } = useSchoolClasses(institutionId || undefined);
  const { plans, totals, loading: loadingPlans, cloneYear } = useSchoolFeePlansForYear(
    institutionId || undefined,
    academicYearId || undefined,
  );
  const { hasCalendar } = useSchoolTermCalendars(
    institutionId || undefined,
    academicYearId || undefined,
  );

  const { activatePlan, archivePlan, deletePlan, createNextVersion } = useSchoolFeePlans();

  const [pendingDelete, setPendingDelete] = useState<SchoolFeePlan | null>(null);

  // Only the newest non-archived plan per class is shown; older versions stay
  // reachable from the plan detail page. Showing every version here would make
  // a 12-class school render 30+ rows after one round of edits.
  const planByClass = useMemo(() => {
    const map = new Map<string, SchoolFeePlan>();
    for (const plan of plans) {
      if (plan.status === 'archived') continue;
      const current = map.get(plan.program_id);
      if (!current || plan.version > current.version) map.set(plan.program_id, plan);
    }
    return map;
  }, [plans]);

  const withoutPlan = useMemo(
    () => classes.filter((c) => !planByClass.has(c.id)).length,
    [classes, planByClass],
  );

  const loading = loadingClasses || loadingPlans;

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
        actions={
          ready && canManage ? (
            <CloneYearDialog
              years={yearOptions}
              targetAcademicYearId={academicYearId}
              onClone={(fromId) => cloneYear(fromId, academicYearId)}
            />
          ) : null
        }
      />

      {!ready ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Choose a school and academic year</AlertTitle>
          <AlertDescription>
            Fee plans are set per class per year. Pick a school and year to see which classes still
            need one.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {!hasCalendar ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>No term calendar for this year</AlertTitle>
              <AlertDescription>
                Plans can be built now, but generation needs due dates.{' '}
                <Link
                  href="/billing/school-fees/term-calendar"
                  className="underline underline-offset-2"
                >
                  Set the term calendar
                </Link>{' '}
                before raising any bills.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Fee plans by class
                  <Badge variant="secondary">
                    {planByClass.size}/{classes.length} set
                  </Badge>
                  {withoutPlan > 0 ? (
                    <Badge variant="outline">{withoutPlan} without a plan</Badge>
                  ) : null}
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : classes.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>This school has no classes</AlertTitle>
                  <AlertDescription>
                    Fee plans are keyed to a class. Add classes for this school before creating
                    plans.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px]">Class</TableHead>
                        <TableHead className="min-w-[120px]">Status</TableHead>
                        <TableHead className="w-[90px]">Version</TableHead>
                        <TableHead className="text-right min-w-[140px]">Year total</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classes.map((klass) => {
                        const plan = planByClass.get(klass.id);
                        const total = plan ? (totals[plan.id] ?? 0) : null;

                        return (
                          <TableRow key={klass.id}>
                            <TableCell className="font-medium">{klass.program_name}</TableCell>

                            <TableCell>
                              {plan ? (
                                <span className="flex items-center gap-1.5">
                                  <Badge variant={STATUS_VARIANT[plan.status]}>{plan.status}</Badge>
                                  {plan.locked_at ? (
                                    <Lock
                                      className="h-3.5 w-3.5 text-muted-foreground"
                                      aria-label="Locked — bills generated"
                                    />
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">No plan</span>
                              )}
                            </TableCell>

                            <TableCell className="tabular-nums">
                              {plan ? `v${plan.version}` : '—'}
                            </TableCell>

                            <TableCell className="text-right tabular-nums">
                              {total === null ? '—' : `₹${inr.format(total)}`}
                            </TableCell>

                            <TableCell>
                              {!plan ? (
                                canManage ? (
                                  <Button asChild variant="ghost" size="icon" aria-label={`Create plan for ${klass.program_name}`}>
                                    <Link
                                      href={`/billing/school-fees/new?institution=${institutionId}&year=${academicYearId}&program=${klass.id}`}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Link>
                                  </Button>
                                ) : null
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" aria-label={`Actions for ${klass.program_name}`}>
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                      <Link href={`/billing/school-fees/${plan.id}`}>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        {plan.locked_at ? 'View grid' : 'Edit grid'}
                                      </Link>
                                    </DropdownMenuItem>

                                    {canActivate && plan.status === 'draft' ? (
                                      <DropdownMenuItem onClick={() => activatePlan(plan.id)}>
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Activate
                                      </DropdownMenuItem>
                                    ) : null}

                                    {canActivate && plan.locked_at ? (
                                      <DropdownMenuItem onClick={() => createNextVersion(plan.id)}>
                                        <GitBranch className="h-4 w-4 mr-2" />
                                        New version
                                      </DropdownMenuItem>
                                    ) : null}

                                    {canManage && plan.status === 'active' ? (
                                      <DropdownMenuItem onClick={() => archivePlan(plan.id)}>
                                        <Archive className="h-4 w-4 mr-2" />
                                        Archive
                                      </DropdownMenuItem>
                                    ) : null}

                                    {canManage && !plan.locked_at ? (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => setPendingDelete(plan)}
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Delete
                                        </DropdownMenuItem>
                                      </>
                                    ) : null}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this fee plan?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} and its entire fee grid will be removed. This cannot be undone.
              Plans that have already generated bills cannot be deleted — archive those instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingDelete) await deletePlan(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
