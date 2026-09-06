'use client';

// concessions-view.tsx
//
// Scheme catalogue on the left of the workflow, per-year assignments on the
// right. Selecting a scheme loads who currently holds it for the chosen year —
// which is the question an auditor actually asks ("how many staff wards, and
// what do they cost us?"), and the one an ad-hoc per-learner amount cannot
// answer without text-matching a reason field.

import { useMemo, useState } from 'react';
import { Info, Plus, Pencil, Trash2, UserPlus, UserMinus, Percent, IndianRupee } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  useSchoolFeeConcessionAssignments,
  useSchoolFeeConcessionSchemes,
} from '@/hooks/school-fees/use-school-fee-concessions';

import { SchoolYearPicker } from '../../_components/school-year-picker';
import { SchemeFormDialog } from './scheme-form-dialog';
import { AssignLearnersDialog } from './assign-learners-dialog';
import type { SchoolFeeConcessionScheme } from '@/types/school-fees';

export function ConcessionsView() {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('school_fees', 'concession');

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

  const { schemes, loading, createScheme, updateScheme, deleteScheme } =
    useSchoolFeeConcessionSchemes({ institution_id: institutionId || undefined });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SchoolFeeConcessionScheme | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SchoolFeeConcessionScheme | null>(null);

  const selected = useMemo(
    () => schemes.find((s) => s.id === selectedId) ?? null,
    [schemes, selectedId],
  );

  const {
    schemeAssignments,
    loading: loadingAssignments,
    assignBulk,
    unassign,
  } = useSchoolFeeConcessionAssignments({
    schemeId: selected?.id,
    academicYearId: academicYearId || undefined,
  });

  const alreadyAssigned = useMemo(
    () => new Set(schemeAssignments.map((a) => a.learner_id)),
    [schemeAssignments],
  );

  const yearName =
    yearOptions.find((y) => y.id === academicYearId)?.academic_year_name ?? 'this year';

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
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              New scheme
            </Button>
          ) : null
        }
      />

      {!ready ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Choose a school and academic year</AlertTitle>
          <AlertDescription>
            Schemes belong to a school; assignments are scoped to one academic year so a concession
            never rolls forward silently.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ---------------------------------------------------------- */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Concession schemes
                <Badge variant="secondary">{schemes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : schemes.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No schemes yet</AlertTitle>
                  <AlertDescription>
                    Create the discounts this school offers — Staff Ward, Sibling, RTE, Merit — then
                    assign learners to them.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px]">Scheme</TableHead>
                        <TableHead className="min-w-[110px]">Discount</TableHead>
                        <TableHead className="min-w-[110px]">Covers</TableHead>
                        <TableHead className="w-[100px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schemes.map((s) => (
                        <TableRow
                          key={s.id}
                          className={`cursor-pointer ${selectedId === s.id ? 'bg-muted/60' : ''}`}
                          onClick={() => setSelectedId(s.id)}
                        >
                          <TableCell>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {s.code}
                              {!s.is_active ? ' · inactive' : ''}
                            </div>
                          </TableCell>

                          <TableCell>
                            <span className="flex items-center gap-1 tabular-nums">
                              {s.mode === 'percent' ? (
                                <>
                                  <Percent className="h-3.5 w-3.5" />
                                  {Number(s.value)}
                                </>
                              ) : (
                                <>
                                  <IndianRupee className="h-3.5 w-3.5" />
                                  {Number(s.value)}
                                </>
                              )}
                            </span>
                          </TableCell>

                          <TableCell>
                            {s.applies_to_all_heads ? (
                              <Badge variant="outline">All heads</Badge>
                            ) : (
                              <Badge variant="outline">
                                {(s.head_ids ?? []).length} head
                                {(s.head_ids ?? []).length === 1 ? '' : 's'}
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {canManage ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Edit ${s.name}`}
                                  onClick={() => {
                                    setEditing(s);
                                    setFormOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Delete ${s.name}`}
                                  onClick={() => setPendingDelete(s)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---------------------------------------------------------- */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Learners
                  {selected ? <Badge variant="secondary">{schemeAssignments.length}</Badge> : null}
                </CardTitle>
                {selected && canManage ? (
                  <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    Assign learners
                  </Button>
                ) : null}
              </div>
            </CardHeader>

            <CardContent>
              {!selected ? (
                <p className="text-sm text-muted-foreground">
                  Select a scheme to see who holds it in {yearName}.
                </p>
              ) : loadingAssignments ? (
                <Skeleton className="h-40 w-full" />
              ) : schemeAssignments.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Nobody assigned for {yearName}</AlertTitle>
                  <AlertDescription>
                    Assignments do not carry over from previous years — that is deliberate, so a
                    waiver is re-confirmed annually.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border overflow-x-auto max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[120px]">Roll no.</TableHead>
                        <TableHead className="min-w-[160px]">Learner</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schemeAssignments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="tabular-nums">
                            {a.learner?.roll_number ?? '—'}
                          </TableCell>
                          <TableCell className="font-medium">
                            {`${a.learner?.first_name ?? ''} ${a.learner?.last_name ?? ''}`.trim() ||
                              '—'}
                          </TableCell>
                          <TableCell>
                            {canManage ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Remove concession"
                                onClick={() => unassign(a.id)}
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <SchemeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        institutionId={institutionId}
        scheme={editing}
        saving={loading}
        onSubmit={async (values) => {
          if (editing) await updateScheme(editing.id, values);
          else await createScheme(values);
        }}
      />

      <AssignLearnersDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        scheme={selected}
        institutionId={institutionId}
        academicYearId={academicYearId}
        yearName={yearName}
        alreadyAssigned={alreadyAssigned}
        saving={loadingAssignments}
        onAssign={async (learnerIds) => {
          if (selected) await assignBulk(selected.id, academicYearId, learnerIds);
        }}
      />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{pendingDelete?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              A scheme with learners assigned cannot be deleted — deactivate it instead, so the
              record of who was discounted and why survives.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingDelete) await deleteScheme(pendingDelete.id);
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
