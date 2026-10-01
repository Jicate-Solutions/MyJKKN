'use client';

/**
 * /cdc/drives/[id]/participants — finalize the participant list.
 *
 * The list is the drive's own audience (institution + program + semester) with
 * each learner's willingness answer. Everyone who said Willing is pre-ticked;
 * CDC unticks or adds anyone from the audience, then finalizes. The finalized
 * list is the attendance roster — no learner is ever typed in by hand.
 */

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ClipboardCheck, Loader2, Lock, Search, UserCheck, Users } from 'lucide-react';
import { useCdcDrive } from '@/hooks/cdc/use-cdc-drives';
import {
  useCdcDriveParticipants,
  useChangeCdcParticipants,
  useFinalizeCdcParticipants,
} from '@/hooks/cdc/use-cdc-drive-day';
import { DriveStatusBadge } from '../../_components/drive-status-badge';
import { TablePager, usePager } from '../../_components/table-pager';

const BUCKET_LABEL = { willing: 'Willing', not_willing: 'Not willing', pending: 'Pending' } as const;
const BUCKET_VARIANT = { willing: 'default', not_willing: 'outline', pending: 'secondary' } as const;

export default function CdcDriveParticipantsPage(props: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="cdc.drives" action="view">
      <Content {...props} />
    </PermissionGuard>
  );
}

function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: detail } = useCdcDrive(id);
  const { data, isLoading, error } = useCdcDriveParticipants(id);
  const finalize = useFinalizeCdcParticipants(id);
  const change = useChangeCdcParticipants(id);

  const [bucket, setBucket] = useState<'all' | 'willing' | 'not_willing' | 'pending' | 'selected'>('all');
  const [search, setSearch] = useState('');
  const [institution, setInstitution] = useState('all');
  const [program, setProgram] = useState('all');
  const [semester, setSemester] = useState('all');
  // null = follow the server's proposal; a Set once the admin touches anything.
  const [ticked, setTicked] = useState<Set<string> | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const proposal = useMemo(() => new Set(rows.filter((r) => r.proposed).map((r) => r.learner_id)), [rows]);
  const selected = ticked ?? proposal;
  const finalized = !!data?.finalized_at;
  const canManage = !!data?.access.canManage;
  const drive = detail?.data;
  const editableStage = !!drive && ['willingness_open', 'eligibility_locked', 'attendance_day'].includes(drive.status);

  // Cascade: institution narrows programs, institution + program narrow semesters.
  const institutionOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (r.institution_id) m.set(r.institution_id, r.institution_name ?? r.institution_id);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const programOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (!r.program_id) return;
      if (institution !== 'all' && r.institution_id !== institution) return;
      m.set(r.program_id, r.program_name ?? 'Unnamed program');
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, institution]);
  const semesterOptions = useMemo(() => {
    const s = new Set<number>();
    rows.forEach((r) => {
      if (r.semester_order == null) return;
      if (institution !== 'all' && r.institution_id !== institution) return;
      if (program !== 'all' && r.program_id !== program) return;
      s.add(r.semester_order);
    });
    return Array.from(s).sort((a, b) => a - b);
  }, [rows, institution, program]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (bucket === 'selected' ? !selected.has(r.learner_id) : bucket !== 'all' && r.bucket !== bucket) return false;
      if (institution !== 'all' && r.institution_id !== institution) return false;
      if (program !== 'all' && r.program_id !== program) return false;
      if (semester !== 'all' && String(r.semester_order ?? '') !== semester) return false;
      if (!q) return true;
      return [r.learner_name, r.register_number, r.department_name, r.institution_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, bucket, search, selected, institution, program, semester]);
  const filtersActive = institution !== 'all' || program !== 'all' || semester !== 'all' || bucket !== 'all' || !!search.trim();

  const dirty = useMemo(() => {
    if (!ticked) return false;
    if (ticked.size !== proposal.size) return true;
    for (const v of ticked) if (!proposal.has(v)) return true;
    return false;
  }, [ticked, proposal]);

  function toggle(learnerId: string) {
    const next = new Set(selected);
    if (next.has(learnerId)) next.delete(learnerId);
    else next.add(learnerId);
    setTicked(next);
  }
  function setAllVisible(on: boolean) {
    const next = new Set(selected);
    visible.forEach((r) => (on ? next.add(r.learner_id) : next.delete(r.learner_id)));
    setTicked(next);
  }

  async function handleFinalize() {
    try {
      const res = await finalize.mutateAsync(Array.from(selected));
      setTicked(null);
      toast.success(
        `${res.participants} participant${res.participants === 1 ? '' : 's'} finalized` +
          (res.notified ? ` · ${res.notified} notified` : '') +
          (res.status_changed ? ' · drive moved to Participants Finalized' : '')
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not finalize');
    }
  }

  async function handleSingle(action: 'add' | 'remove', learnerId: string) {
    try {
      const res = await change.mutateAsync({ action, learner_ids: [learnerId] });
      setTicked(null);
      toast.success(action === 'add' ? `Added${res.notified ? ' and notified' : ''}` : 'Removed from participants');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  const allVisibleOn = visible.length > 0 && visible.every((r) => selected.has(r.learner_id));
  const pager = usePager(visible, 50);

  return (
    <ContentLayout title="Participants">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/cdc/drives">Drives</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href={`/cdc/drives/${id}`}>{drive?.title ?? 'Drive'}</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Participants</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              {drive?.title ?? 'Drive'}
            </h1>
            <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
              {drive ? <DriveStatusBadge status={drive.status} /> : null}
              {finalized ? (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> Finalized {new Date(data!.finalized_at!).toLocaleString()}
                </span>
              ) : (
                <span>Not finalized yet</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {finalized ? (
              <Button asChild variant="outline">
                <Link href={`/cdc/drives/${id}/attendance`}>
                  <ClipboardCheck className="h-4 w-4 mr-2" /> Attendance
                </Link>
              </Button>
            ) : null}
            {canManage && editableStage ? (
              <Button onClick={handleFinalize} disabled={finalize.isPending || selected.size === 0 || (finalized && !dirty)}>
                {finalize.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                {finalized ? 'Save participant list' : `Finalize ${selected.size} participant${selected.size === 1 ? '' : 's'}`}
              </Button>
            ) : null}
          </div>
        </div>

        {data ? (
          <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
            {[
              ['Eligible', data.counts.audience],
              ['Willing', data.counts.willing],
              [finalized ? 'Participants' : 'Ticked', finalized && !dirty ? data.counts.participants : selected.size],
              ['Added by CDC', data.counts.added],
              ['Removed', data.counts.removed],
            ].map(([label, n]) => (
              <div key={String(label)} className="rounded-md border p-3">
                <p className="text-2xl font-semibold leading-none">{n}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>
        ) : null}

        {!finalized && drive?.status === 'willingness_open' && canManage ? (
          <Alert>
            <Users className="h-4 w-4" />
            <AlertTitle>Finalizing closes willingness</AlertTitle>
            <AlertDescription>
              Everyone who answered Willing is ticked. Untick or add learners, then finalize. The drive moves to
              Participants Finalized, learner responses freeze, and only the finalized learners are told they are
              shortlisted. You can still add or remove a learner afterwards.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">Eligible learners</CardTitle>
                <CardDescription>From the drive&apos;s institutions, programs and semesters. Nothing is entered by hand.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={bucket} onValueChange={(v) => setBucket(v as typeof bucket)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All learners</SelectItem>
                    <SelectItem value="selected">Ticked / participants</SelectItem>
                    <SelectItem value="willing">Willing</SelectItem>
                    <SelectItem value="not_willing">Not willing</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 w-60" placeholder="Search name / register no" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                value={institution}
                onValueChange={(v) => {
                  setInstitution(v);
                  setProgram('all');
                  setSemester('all');
                }}
              >
                <SelectTrigger><SelectValue placeholder="Institution" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All institutions</SelectItem>
                  {institutionOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={program}
                onValueChange={(v) => {
                  setProgram(v);
                  setSemester('all');
                }}
              >
                <SelectTrigger><SelectValue placeholder="Program" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programs</SelectItem>
                  {programOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={semester} onValueChange={setSemester}>
                <SelectTrigger><SelectValue placeholder="Semester" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All semesters</SelectItem>
                  {semesterOptions.map((o) => (
                    <SelectItem key={o} value={String(o)}>Semester {o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Showing {visible.length} of {rows.length}
                  {visible.length > 0 ? ` · ${visible.filter((r) => selected.has(r.learner_id)).length} ticked` : ''}
                </span>
                {filtersActive ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => {
                      setInstitution('all');
                      setProgram('all');
                      setSemester('all');
                      setBucket('all');
                      setSearch('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading learners…</p>
            ) : error ? (
              <p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load'}</p>
            ) : visible.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No learners match.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        {canManage && editableStage ? (
                          <Checkbox checked={allVisibleOn} onCheckedChange={(v) => setAllVisible(v === true)} aria-label="Select all shown" />
                        ) : null}
                      </TableHead>
                      <TableHead>Learner</TableHead>
                      <TableHead>Institution / Program</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead>Willingness</TableHead>
                      <TableHead className="text-right">CGPA</TableHead>
                      <TableHead className="text-right">Arrears</TableHead>
                      <TableHead>Participant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pager.pageRows.map((r) => (
                      <TableRow key={r.learner_id} className={selected.has(r.learner_id) ? 'bg-primary/5' : undefined}>
                        <TableCell>
                          {canManage && editableStage ? (
                            <Checkbox checked={selected.has(r.learner_id)} onCheckedChange={() => toggle(r.learner_id)} />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.learner_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.register_number ?? ''}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{r.institution_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">
                            {[r.program_name, r.department_name].filter(Boolean).join(' · ')}
                          </div>
                        </TableCell>
                        <TableCell>{r.semester_label ?? '—'}</TableCell>
                        <TableCell><Badge variant={BUCKET_VARIANT[r.bucket]}>{BUCKET_LABEL[r.bucket]}</Badge></TableCell>
                        <TableCell className="text-right">{r.cgpa != null ? Number(r.cgpa).toFixed(2) : '—'}</TableCell>
                        <TableCell className="text-right">{r.arrears_count ?? '—'}</TableCell>
                        <TableCell>
                          {r.is_participant ? (
                            <div className="flex items-center gap-2">
                              <Badge>{r.participant_source === 'added' ? 'Added by CDC' : 'Participant'}</Badge>
                              {canManage && finalized && editableStage ? (
                                <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" disabled={change.isPending} onClick={() => handleSingle('remove', r.learner_id)}>
                                  Remove
                                </Button>
                              ) : null}
                            </div>
                          ) : finalized ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{r.participant_status === 'removed' ? 'Removed' : 'Not included'}</span>
                              {canManage && editableStage ? (
                                <Button variant="ghost" size="sm" className="h-7" disabled={change.isPending} onClick={() => handleSingle('add', r.learner_id)}>
                                  Add
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {visible.length > 0 ? (
              <>
                <TablePager pager={pager} />
                <p className="px-4 pb-3 text-xs text-muted-foreground">
                  The header checkbox ticks everything the filters show, on every page. Ticks on other pages are kept.
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
