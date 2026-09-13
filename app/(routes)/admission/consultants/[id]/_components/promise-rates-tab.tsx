'use client'

// Promises & Rates — per consultant, per academic year.
//
// The Director's rules this screen exists to make un-misreadable:
//   13 — a rate is per COURSE and per CONSULTANT, tied to what was promised
//   16 — a promise is BOTH a yearly number AND per-course numbers
//   17 — miss a promise and the consultant is still paid for every learner,
//        just at the normal amount. Nobody is ever zeroed.
//   20 — EACH PROMISE IS JUDGED ON ITS OWN. Keeping the yearly promise does
//        NOT rescue a course whose own promise was missed.
//   14 — MyJKKN applies no tax. Every amount on this screen is pre-tax.
//
// Every figure shown here is read back from the database through
// fn_resolve_consultant_course_rate — this screen never re-derives a decision,
// so what an admin reads is exactly what a payout run will do.
//
// Amount inputs start EMPTY and carry no example figure. Rupee amounts are the
// Director's to set.

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PermissionGuard } from '@/components/auth/permission-guard'
import { usePermissions } from '@/hooks/use-permissions'
import { AlertCircle, Info, Plus, Loader2, Pencil, Power } from 'lucide-react'
import {
  ConsultantCourseRateService,
  type ConsultantScopeRate,
  type UpsertConsultantScopeRateInput,
} from '@/lib/services/admission/consultant-course-rate-service'
import { ReferralRateService } from '@/lib/services/admission/referral-rate-service'

const YEARS = [2025, 2026, 2027]

/** Renders an amount, or a plain statement that none is set. Never prints 0
 *  for a missing amount — "no amount set" and "zero" are different facts. */
function amount(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return <span className="text-muted-foreground">Not set</span>
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v))
}

/** Empty string → null. An untouched amount field must stay undecided, not 0. */
function toNumberOrNull(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

interface ScopeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  consultantId: string
  institutionId: string
  academicYear: number
  /** null = adding a per-course promise; a row = editing it or the yearly one. */
  editing: ConsultantScopeRate | null
  /** Fixed scope when adding the yearly row. */
  forceYearly?: boolean
  takenProgramIds: string[]
}

function ScopeDialog({
  open, onOpenChange, consultantId, institutionId, academicYear,
  editing, forceYearly, takenProgramIds,
}: ScopeDialogProps) {
  const qc = useQueryClient()
  const [programId, setProgramId] = useState<string>('')
  const [promisedCount, setPromisedCount] = useState<string>('')
  const [promisedAmount, setPromisedAmount] = useState<string>('')
  const [baseAmount, setBaseAmount] = useState<string>('')

  const { data: programs } = useQuery({
    queryKey: ['rate-programs'],
    queryFn: () => ReferralRateService.getPrograms(),
  })

  const isYearly = forceYearly || (editing != null && editing.program_id === null)

  // Hydration MUST hang off the `open` prop, not off onOpenChange.
  //
  // This dialog has no DialogTrigger — the parent opens it with
  // setDialogOpen(true). Radix never calls onOpenChange(true) for an
  // externally-controlled `open`, so the old `if (isOpen) { ...hydrate... }`
  // branch inside handleOpenChange NEVER RAN. The consequences were both real:
  //   * Edit opened with four BLANK fields, and Save wrote promised_count,
  //     promised_amount and base_amount back as NULL — erasing the promise and
  //     both rupee amounts on that consultant's row.
  //   * programId stayed '' when editing a course row, so onSubmit's
  //     "Choose a course first" guard aborted every course edit, while the
  //     Course select is disabled when editing — so the admin could not supply
  //     what the guard demanded. The pencil on every course row was dead.
  // Resetting on close matters too: an amount typed while adding a course
  // promise used to survive and land on the YEARLY row the next time.
  //
  // NOTE FOR A LATER LANE: the sibling
  // ./commission-structure-tab.tsx has the identical latent bug in its own
  // ScopeDialog (it hydrates inside handleOpenChange and has no DialogTrigger).
  // Deliberately NOT fixed here — different lane, different PR.
  useEffect(() => {
    if (open) {
      setProgramId(editing?.program_id ?? '')
      setPromisedCount(editing?.promised_count != null ? String(editing.promised_count) : '')
      setPromisedAmount(editing?.promised_amount != null ? String(editing.promised_amount) : '')
      setBaseAmount(editing?.base_amount != null ? String(editing.base_amount) : '')
    } else {
      setProgramId('')
      setPromisedCount('')
      setPromisedAmount('')
      setBaseAmount('')
    }
  }, [open, editing])

  const save = useMutation({
    mutationFn: (input: UpsertConsultantScopeRateInput) =>
      ConsultantCourseRateService.upsertScope(input),
    onSuccess: () => {
      toast.success('Saved')
      qc.invalidateQueries({ queryKey: ['consultant-promise-rates'] })
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save'),
  })

  // ReferralRateService.getPrograms() returns EVERY programme in EVERY
  // institution. Without the institution filter an admin could attach this
  // consultant's course promise to another college's programme — and the row
  // carries this college's institution_id, so the promise and the course would
  // belong to different colleges. The row being edited is always kept in the
  // list so its course still renders in the (disabled) select.
  const availablePrograms = useMemo(() => {
    if (!programs) return []
    return programs.filter(
      (p) =>
        p.id === editing?.program_id ||
        (p.institution_id === institutionId && !takenProgramIds.includes(p.id)),
    )
  }, [programs, takenProgramIds, editing?.program_id, institutionId])

  const onSubmit = () => {
    if (!isYearly && !programId) {
      toast.error('Choose a course first')
      return
    }
    save.mutate({
      id: editing?.id,
      institution_id: institutionId,
      consultant_id: consultantId,
      academic_year: academicYear,
      program_id: isYearly ? null : programId,
      promised_count: toNumberOrNull(promisedCount),
      promised_amount: toNumberOrNull(promisedAmount),
      base_amount: toNumberOrNull(baseAmount),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isYearly ? `Yearly promise for ${academicYear}` : `Course promise for ${academicYear}`}
          </DialogTitle>
          <DialogDescription>
            {isYearly
              ? 'How many learners this consultant promised for the whole year, and the two amounts that go with it. Courses with their own promise below are judged separately.'
              : 'How many learners this consultant promised for this one course. This course is judged on its own promise — the yearly promise does not rescue it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isYearly && (
            <div className="space-y-2">
              <Label htmlFor="promise-course">Course</Label>
              <Select value={programId} onValueChange={setProgramId} disabled={!!editing}>
                <SelectTrigger id="promise-course">
                  <SelectValue placeholder="Choose a course" />
                </SelectTrigger>
                <SelectContent>
                  {availablePrograms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="promise-count">Learners promised</Label>
            <Input
              id="promise-count"
              type="number"
              min={1}
              value={promisedCount}
              onChange={(e) => setPromisedCount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if no promise was made at this level.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="promise-amount">Amount per learner when the promise is kept (pre-tax)</Label>
            <Input
              id="promise-amount"
              type="number"
              min={0}
              value={promisedAmount}
              onChange={(e) => setPromisedAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="normal-amount">Normal amount per learner (pre-tax)</Label>
            <Input
              id="normal-amount"
              type="number"
              min={0}
              value={baseAmount}
              onChange={(e) => setBaseAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Paid for every learner when the promise at this level is missed. Missing a promise never
              reduces anyone to nothing.
            </p>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              MyJKKN applies no tax to these figures. Every amount here is pre-tax; tax is handled
              outside the system. Leaving an amount blank means it has not been decided — it does
              not mean zero.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** One course row, with the decision read back from the database. */
function CourseRow({
  row, academicYear, institutionId, consultantId, canWrite, onEdit, onRetire,
}: {
  row: ConsultantScopeRate
  academicYear: number
  institutionId: string
  consultantId: string
  canWrite: boolean
  onEdit: () => void
  onRetire: () => void
}) {
  const { data: resolved, isLoading } = useQuery({
    queryKey: [
      'consultant-promise-rates', 'resolve',
      institutionId, consultantId, academicYear, row.program_id,
    ],
    queryFn: () =>
      ConsultantCourseRateService.resolve(
        academicYear, institutionId, consultantId, row.program_id as string,
      ),
    enabled: !!row.program_id && !!institutionId,
  })

  return (
    <TableRow>
      <TableCell className="font-medium">{row.program?.program_name ?? 'Unnamed course'}</TableCell>
      <TableCell>{row.promised_count ?? <span className="text-muted-foreground">No promise</span>}</TableCell>
      <TableCell>
        {isLoading ? <Skeleton className="h-4 w-8" /> : (resolved?.delivered_count ?? '—')}
      </TableCell>
      <TableCell>
        {isLoading ? <Skeleton className="h-5 w-20" /> : resolved?.promise_met == null ? (
          <Badge variant="outline">Nothing to judge</Badge>
        ) : resolved.promise_met ? (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Promise kept</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Promise missed</Badge>
        )}
      </TableCell>
      <TableCell>{amount(row.base_amount)}</TableCell>
      <TableCell>{amount(row.promised_amount)}</TableCell>
      <TableCell className="font-semibold">
        {isLoading ? <Skeleton className="h-4 w-16" /> : amount(resolved?.resolved_amount)}
      </TableCell>
      <TableCell className="max-w-[22rem] text-xs text-muted-foreground">
        {isLoading ? <Skeleton className="h-4 w-48" /> : resolved?.decision_reason}
      </TableCell>
      {canWrite && (
        <TableCell className="text-right whitespace-nowrap">
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Edit this course promise">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onRetire} aria-label="Retire this course promise">
            <Power className="h-4 w-4" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  )
}

export function PromiseRatesTab({
  consultantId,
  institutionId,
}: {
  consultantId: string
  institutionId: string
}) {
  const qc = useQueryClient()
  const { isSuperAdmin, userProfile } = usePermissions()
  const canWrite =
    isSuperAdmin ||
    ['admin', 'super_admin', 'administrator'].includes(String(userProfile?.role ?? ''))

  const [year, setYear] = useState<number>(2026)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ConsultantScopeRate | null>(null)
  const [forceYearly, setForceYearly] = useState(false)

  const { data: rows, isLoading } = useQuery({
    queryKey: ['consultant-promise-rates', institutionId, consultantId, year],
    queryFn: () =>
      ConsultantCourseRateService.listByConsultantYear(institutionId, consultantId, year),
    enabled: !!institutionId,
  })

  const yearlyRow = useMemo(() => (rows ?? []).find((r) => r.program_id === null) ?? null, [rows])
  const courseRows = useMemo(() => (rows ?? []).filter((r) => r.program_id !== null), [rows])
  const takenProgramIds = useMemo(
    () => courseRows.map((r) => r.program_id as string),
    [courseRows],
  )

  const retire = useMutation({
    mutationFn: (id: string) => ConsultantCourseRateService.deactivateScope(id),
    onSuccess: () => {
      toast.success('Retired')
      qc.invalidateQueries({ queryKey: ['consultant-promise-rates'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Could not retire'),
  })

  const openAddCourse = () => { setEditing(null); setForceYearly(false); setDialogOpen(true) }
  const openYearly = () => { setEditing(yearlyRow); setForceYearly(true); setDialogOpen(true) }

  // Guarded on admission.consultants.commissions.view, NOT the broader
  // admission.consultants.view. That is the permission the table's RESTRICTIVE
  // read policy and fn_resolve_consultant_course_rate both require, so a user
  // holding only the broader one would otherwise open this tab and be served an
  // empty table by RLS and an error by the RPC — a screen that looks broken
  // instead of one that says what is missing.
  return (
    <PermissionGuard module="admission.consultants.commissions" action="view">
      <div className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Each promise is judged on its own</AlertTitle>
          <AlertDescription className="text-sm">
            Keeping the yearly promise does <strong>not</strong> rescue a course whose own promise
            was missed. If a consultant promised 50 learners for the year and 10 for one course, and
            delivered 50 overall but only 6 on that course, then those 6 learners are paid the
            normal amount while every other course is paid the higher one. Missing a promise never
            means nobody is paid — it means the normal amount applies. Every figure below is pre-tax;
            MyJKKN applies no tax.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="promise-year">Academic year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger id="promise-year" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}–{String(y + 1).slice(2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canWrite && (
            <>
              <Button variant="outline" onClick={openYearly} disabled={!institutionId}>
                {yearlyRow ? 'Edit yearly promise' : 'Set yearly promise'}
              </Button>
              <Button onClick={openAddCourse} disabled={!institutionId}>
                <Plus className="h-4 w-4 mr-2" />
                Add a course promise
              </Button>
            </>
          )}
        </div>

        {/* institution_id is NOT NULL on the table. This consultant record has
            no institution, so the page passes an empty string down. Saving it
            would send '' into a uuid column, Postgres would raise
            22P02 invalid input syntax for type uuid: "", and the admin would
            see that raw database sentence in a toast. Say what is actually
            wrong instead, and keep the buttons out of reach. */}
        {!institutionId && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>This consultant is not linked to a college yet</AlertTitle>
            <AlertDescription className="text-sm">
              Promises and amounts are recorded against one college, so this consultant needs a
              college on their Details tab before a promise can be set here. Add it there, then
              come back.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yearly promise</CardTitle>
            <CardDescription>
              Covers every course that has no promise of its own below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !yearlyRow ? (
              <p className="text-sm text-muted-foreground">
                No yearly promise recorded for {year}–{String(year + 1).slice(2)}. Until one is set,
                courses without their own promise have no rate — which is not the same as a rate of
                nothing.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Learners promised</p>
                  <p className="text-lg font-semibold">
                    {yearlyRow.promised_count ?? <span className="text-sm font-normal text-muted-foreground">No promise</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Normal amount per learner (pre-tax)</p>
                  <p className="text-lg font-semibold">{amount(yearlyRow.base_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount if the promise is kept (pre-tax)</p>
                  <p className="text-lg font-semibold">{amount(yearlyRow.promised_amount)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Course promises</CardTitle>
            <CardDescription>
              Each course below is judged only against its own promise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : courseRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No course promises recorded for {year}–{String(year + 1).slice(2)}. Every course
                falls back to the yearly promise above.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Course</TableHead>
                      <TableHead>Promised</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>This course&apos;s promise</TableHead>
                      <TableHead>Normal (pre-tax)</TableHead>
                      <TableHead>If kept (pre-tax)</TableHead>
                      <TableHead>Pays now (pre-tax)</TableHead>
                      <TableHead>Why</TableHead>
                      {canWrite && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courseRows.map((r) => (
                      <CourseRow
                        key={r.id}
                        row={r}
                        academicYear={year}
                        institutionId={institutionId}
                        consultantId={consultantId}
                        canWrite={canWrite}
                        onEdit={() => { setEditing(r); setForceYearly(false); setDialogOpen(true) }}
                        onRetire={() => retire.mutate(r.id)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {!canWrite && (
          <p className="text-xs text-muted-foreground">
            You can read these promises but not change them. Amounts and promises are set by a
            super admin.
          </p>
        )}

        {canWrite && (
          <ScopeDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            consultantId={consultantId}
            institutionId={institutionId}
            academicYear={year}
            editing={editing}
            forceYearly={forceYearly}
            takenProgramIds={takenProgramIds}
          />
        )}
      </div>
    </PermissionGuard>
  )
}
