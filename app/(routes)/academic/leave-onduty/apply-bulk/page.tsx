'use client';

/**
 * Apply On-Duty for Learners (facilitator bulk application)
 *
 * A staff member holding learners.leave_onduty.apply_bulk raises On-Duty for
 * many learners of their own institution. Each learner gets an individual
 * application that follows their own department / residency approval chain.
 *
 * @route /academic/leave-onduty/apply-bulk
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, Search, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useLearnerLeaveTypes } from '@/hooks/learners/use-learner-leave-types';
import {
  useBulkFilterOptions,
  useBulkRoster,
  useCreateBulkBatch,
} from '@/hooks/academic/use-leave-onduty-bulk';
import {
  BULK_MAX_LEARNERS,
  type BulkCreateResult,
  type BulkPeriodType,
  type BulkRosterLearner,
} from '@/lib/services/academic/leave-onduty-bulk-service';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ALL = 'all';

const fullName = (l: BulkRosterLearner) => `${l.first_name} ${l.last_name ?? ''}`.trim();

export default function LeaveOndutyApplyBulkPage() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const canApply = can('learners.leave_onduty.apply_bulk');
  const institutionId = profile?.institution_id ?? null;

  useEffect(() => {
    if (!authLoading && !permissionsLoading && !canApply) router.replace('/');
  }, [authLoading, permissionsLoading, canApply, router]);

  // ---- form state ----
  const [title, setTitle] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [periodType, setPeriodType] = useState<BulkPeriodType>('fullday');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);

  // ---- roster / selection state ----
  const [departmentId, setDepartmentId] = useState(ALL);
  const [semesterId, setSemesterId] = useState(ALL);
  const [sectionId, setSectionId] = useState(ALL);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, BulkRosterLearner>>(new Map());
  const [result, setResult] = useState<BulkCreateResult | null>(null);
  const [submitted, setSubmitted] = useState<Map<string, BulkRosterLearner>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: leaveTypes } = useLearnerLeaveTypes({ category: 'onduty', is_active: true });
  const { data: options } = useBulkFilterOptions(institutionId);
  const { data: roster, isLoading: rosterLoading, error: rosterError } = useBulkRoster(institutionId, {
    departmentId: departmentId === ALL ? undefined : departmentId,
    semesterId: semesterId === ALL ? undefined : semesterId,
    sectionId: sectionId === ALL ? undefined : sectionId,
    search: debouncedSearch,
  });
  const createBatch = useCreateBulkBatch();

  const selectedType = leaveTypes?.find((t) => t.id === leaveTypeId) ?? null;
  const semesterOptions = (options?.semesters ?? []).filter(
    (s) => departmentId === ALL || s.department_id === departmentId
  );
  const sectionOptions = (options?.sections ?? []).filter(
    (s) =>
      (departmentId === ALL || s.department_id === departmentId) &&
      (semesterId === ALL || s.semester_id === semesterId)
  );
  const deptName = useMemo(
    () => new Map((options?.departments ?? []).map((d) => [d.id, d.name])),
    [options]
  );
  const sectionName = useMemo(
    () => new Map((options?.sections ?? []).map((s) => [s.id, s.name])),
    [options]
  );

  const rows = roster ?? [];
  const allShownSelected = rows.length > 0 && rows.every((l) => selected.has(l.id));

  const toggle = (l: BulkRosterLearner) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(l.id)) next.delete(l.id);
      else next.set(l.id, l);
      return next;
    });

  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (allShownSelected) rows.forEach((l) => next.delete(l.id));
      else rows.forEach((l) => next.set(l.id, l));
      return next;
    });

  const handleSubmit = () => {
    if (!institutionId) return;
    if (!title.trim()) return void toast.error('Please give the event a name.');
    if (!leaveTypeId) return void toast.error('Please choose an On-Duty type.');
    if (!startDate || !endDate) return void toast.error('Please choose the dates.');
    if (endDate < startDate) return void toast.error('End date cannot be before start date.');
    if (!reason.trim()) return void toast.error('Please provide a reason.');
    if (selected.size === 0) return void toast.error('Select at least one learner.');
    if (selected.size > BULK_MAX_LEARNERS)
      return void toast.error(`Select at most ${BULK_MAX_LEARNERS} learners per batch.`);
    if (selectedType?.requires_attachment && !attachment)
      return void toast.error('This type requires a supporting document.');

    setSubmitted(new Map(selected));
    createBatch.mutate(
      {
        institutionId,
        leaveTypeId,
        title: title.trim(),
        startDate,
        endDate,
        periodType,
        reason: reason.trim(),
        attachment,
        learners: Array.from(selected.values()),
      },
      {
        onSuccess: (res) => {
          setResult(res);
          if (res.created > 0) setSelected(new Map());
        },
      }
    );
  };

  if (authLoading || permissionsLoading) {
    return (
      <ContentLayout title="Apply On-Duty for Learners">
        <Skeleton className="h-64 w-full" />
      </ContentLayout>
    );
  }
  if (!canApply) return null;

  if (!institutionId) {
    return (
      <ContentLayout title="Apply On-Duty for Learners">
        <Alert variant="destructive">
          <AlertDescription>Your account is not linked to an institution.</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const learnerById = submitted;

  return (
    <ContentLayout title="Apply On-Duty for Learners">
      <div className="space-y-4 sm:space-y-6">
        <Breadcrumb className="hidden md:flex">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/academic/leave-onduty/approvals">Leave/OnDuty</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Apply for Learners</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Event details</CardTitle>
            <CardDescription>
              One On-Duty application is created per learner, and each follows that learner&apos;s own
              approval chain. Learners from your institution only.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bulk-title">Event name *</Label>
              <Input
                id="bulk-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Inter-college Sports Meet"
              />
            </div>
            <div className="space-y-2">
              <Label>On-Duty type *</Label>
              <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {(leaveTypes ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration *</Label>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as BulkPeriodType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fullday">Full day</SelectItem>
                  {(selectedType?.allow_half_day ?? true) && (
                    <>
                      <SelectItem value="forenoon">Forenoon</SelectItem>
                      <SelectItem value="afternoon">Afternoon</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-start">Start date *</Label>
              <Input
                id="bulk-start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-end">End date *</Label>
              <Input
                id="bulk-end"
                type="date"
                min={startDate || undefined}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bulk-reason">Reason *</Label>
              <Textarea
                id="bulk-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bulk-file">
                Supporting document{selectedType?.requires_attachment ? ' *' : ' (optional)'}
              </Label>
              <Input
                id="bulk-file"
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Select learners</CardTitle>
            <CardDescription>
              Filter, search and tick learners. Selections are kept while you change filters.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Select
                value={departmentId}
                onValueChange={(v) => {
                  setDepartmentId(v);
                  setSemesterId(ALL);
                  setSectionId(ALL);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All departments</SelectItem>
                  {(options?.departments ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={semesterId}
                onValueChange={(v) => {
                  setSemesterId(v);
                  setSectionId(ALL);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Semester" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All semesters</SelectItem>
                  {semesterOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sections</SelectItem>
                  {sectionOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Name, roll or register no."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{selected.size} selected</Badge>
              {selected.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>
                  Clear selection
                </Button>
              )}
              {rows.length > 0 && (
                <span className="text-muted-foreground ml-auto">
                  {rows.length} shown{rows.length >= 500 ? ' (limit reached — narrow the filters)' : ''}
                </span>
              )}
            </div>

            {rosterError && (
              <Alert variant="destructive">
                <AlertDescription>{(rosterError as Error).message}</AlertDescription>
              </Alert>
            )}

            <div className="border rounded-md max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr className="text-left">
                    <th className="p-2 w-10">
                      <Checkbox
                        checked={allShownSelected}
                        onCheckedChange={toggleAllShown}
                        aria-label="Select all shown"
                      />
                    </th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Roll / Register</th>
                    <th className="p-2 hidden sm:table-cell">Department</th>
                    <th className="p-2 hidden sm:table-cell">Section</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterLoading && (
                    <tr>
                      <td colSpan={5} className="p-4">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  )}
                  {!rosterLoading && rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">
                        No learners match.
                      </td>
                    </tr>
                  )}
                  {rows.map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => toggle(l)}>
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l)} />
                      </td>
                      <td className="p-2 font-medium">{fullName(l)}</td>
                      <td className="p-2">{l.roll_number || l.register_number || '—'}</td>
                      <td className="p-2 hidden sm:table-cell">
                        {(l.department_id && deptName.get(l.department_id)) || '—'}
                      </td>
                      <td className="p-2 hidden sm:table-cell">
                        {(l.section_id && sectionName.get(l.section_id)) || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/academic/leave-onduty/approvals')}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createBatch.isPending}>
            {createBatch.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit for {selected.size} learner{selected.size === 1 ? '' : 's'}
          </Button>
        </div>
      </div>

      <Dialog open={!!result} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Batch submitted</DialogTitle>
            <DialogDescription>
              {result?.created ?? 0} application(s) created, {result?.skipped ?? 0} skipped.
            </DialogDescription>
          </DialogHeader>
          {result && result.skipped > 0 && (
            <div className="space-y-1 text-sm">
              <p className="font-medium">Skipped</p>
              {result.results
                .filter((r) => r.status === 'skipped')
                .map((r) => (
                  <div key={r.learner_id} className="flex items-start gap-2 border rounded-md p-2">
                    <X className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                    <div>
                      <div className="font-medium">
                        {learnerById.get(r.learner_id) ? fullName(learnerById.get(r.learner_id)!) : r.learner_id}
                      </div>
                      <div className="text-muted-foreground">{r.reason}</div>
                    </div>
                  </div>
                ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setResult(null)}>
              Add more
            </Button>
            <Button onClick={() => router.push('/academic/leave-onduty/approvals')}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
