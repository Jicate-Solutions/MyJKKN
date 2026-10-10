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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ArrowLeft,
  ClipboardCheck,
  FilterX,
  Loader2,
  Lock,
  Plus,
  Search,
  ThumbsUp,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useCdcDrive } from '@/hooks/cdc/use-cdc-drives';
import {
  useCdcDriveParticipants,
  useChangeCdcParticipants,
  useFinalizeCdcParticipants,
} from '@/hooks/cdc/use-cdc-drive-day';
import { DriveStatusBadge } from '../../_components/drive-status-badge';
import { TablePager, usePager } from '../../_components/table-pager';
import { Pill, TONE, initials, type Tone } from '../../_components/status-pill';

const BUCKET_LABEL = { willing: 'Willing', not_willing: 'Not willing', pending: 'Pending' } as const;

const BUCKET_TONE: Record<keyof typeof BUCKET_LABEL, Tone> = { willing: 'emerald', not_willing: 'slate', pending: 'amber' };

const BUCKET_TABS = [
  { key: 'all', label: 'All' },
  { key: 'selected', label: 'Ticked' },
  { key: 'willing', label: 'Willing' },
  { key: 'not_willing', label: 'Not willing' },
  { key: 'pending', label: 'Pending' },
] as const;

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

  const tickedVisible = visible.filter((r) => selected.has(r.learner_id)).length;
  const editable = canManage && editableStage;
  const stats: Array<{ label: string; value: number; icon: typeof Users; tone: Tone; filter?: typeof bucket }> = data
    ? [
        { label: 'Eligible', value: data.counts.audience, icon: Users, tone: 'slate', filter: 'all' },
        { label: 'Willing', value: data.counts.willing, icon: ThumbsUp, tone: 'emerald', filter: 'willing' },
        {
          label: finalized ? 'Participants' : 'Ticked',
          value: finalized && !dirty ? data.counts.participants : selected.size,
          icon: UserCheck,
          tone: 'violet',
          filter: 'selected',
        },
        { label: 'Added by CDC', value: data.counts.added, icon: UserPlus, tone: 'amber' },
        { label: 'Removed', value: data.counts.removed, icon: UserMinus, tone: 'rose' },
      ]
    : [];

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

      <div className="mt-6 space-y-5">
        {/* ── Page header ── */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button asChild variant="outline" size="icon" className="mt-0.5 h-9 w-9 shrink-0 rounded-full shadow-sm" title="Back to Drive">
              <Link href={`/cdc/drives/${id}`} aria-label="Back to Drive">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{drive?.title ?? 'Drive'}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {drive ? <DriveStatusBadge status={drive.status} /> : null}
                {finalized ? (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" /> Finalized {new Date(data!.finalized_at!).toLocaleString()}
                  </span>
                ) : (
                  <span>Not finalized yet</span>
                )}
                {dirty ? <Pill tone="amber">Unsaved changes</Pill> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {finalized ? (
              <Button asChild variant="outline" className="shadow-sm">
                <Link href={`/cdc/drives/${id}/attendance`}>
                  <ClipboardCheck className="h-4 w-4 mr-2" /> Attendance
                </Link>
              </Button>
            ) : null}
            {editable ? (
              <Button className="shadow-sm" onClick={handleFinalize} disabled={finalize.isPending || selected.size === 0 || (finalized && !dirty)}>
                {finalize.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                {finalized ? 'Save participant list' : `Finalize ${selected.size} participant${selected.size === 1 ? '' : 's'}`}
              </Button>
            ) : null}
          </div>
        </div>

        {/* ── Score cards. The first three also filter the list. ── */}
        {data ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {stats.map((st) => {
              const Icon = st.icon;
              const active = !!st.filter && bucket === st.filter;
              const body = (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{st.label}</span>
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset', TONE[st.tone])}>
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-2 text-3xl font-semibold leading-none tracking-tight tabular-nums">{st.value}</p>
                </>
              );
              const base = 'rounded-xl border bg-card p-4 text-left shadow-sm transition';
              return st.filter ? (
                <button
                  key={st.label}
                  type="button"
                  onClick={() => setBucket(st.filter!)}
                  aria-pressed={active}
                  className={cn(base, 'hover:border-primary/40 hover:shadow', active && 'border-primary ring-1 ring-primary')}
                >
                  {body}
                </button>
              ) : (
                <div key={st.label} className={base}>{body}</div>
              );
            })}
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

        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader className="space-y-4 border-b bg-muted/20 pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  Eligible learners
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                    {visible.length === rows.length ? rows.length : `${visible.length} of ${rows.length}`}
                  </span>
                  {tickedVisible > 0 ? <Pill tone="violet">{tickedVisible} ticked</Pill> : null}
                </CardTitle>
                <CardDescription>From the drive&apos;s institutions, programs and semesters. Nothing is entered by hand.</CardDescription>
              </div>
              <div className="relative w-full lg:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="bg-background pl-9" placeholder="Search name / register no" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              {/* Willingness / ticked — segmented control */}
              <div className="inline-flex w-full shrink-0 overflow-x-auto rounded-lg bg-muted p-1 xl:w-auto" role="tablist" aria-label="Show">
                {BUCKET_TABS.map((t) => {
                  const active = bucket === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setBucket(t.key)}
                      className={cn(
                        'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
                        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Institution -> Program -> Semester */}
              <div className="grid flex-1 gap-2 sm:grid-cols-3">
                <Select
                  value={institution}
                  onValueChange={(v) => {
                    setInstitution(v);
                    setProgram('all');
                    setSemester('all');
                  }}
                >
                  <SelectTrigger className={cn('bg-background', institution !== 'all' && 'border-primary/60')}><SelectValue placeholder="Institution" /></SelectTrigger>
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
                  <SelectTrigger className={cn('bg-background', program !== 'all' && 'border-primary/60')}><SelectValue placeholder="Program" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All programs</SelectItem>
                    {programOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className={cn('bg-background', semester !== 'all' && 'border-primary/60')}><SelectValue placeholder="Semester" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All semesters</SelectItem>
                    {semesterOptions.map((o) => (
                      <SelectItem key={o} value={String(o)}>Semester {o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                disabled={!filtersActive}
                onClick={() => {
                  setInstitution('all');
                  setProgram('all');
                  setSemester('all');
                  setBucket('all');
                  setSearch('');
                }}
              >
                <FilterX className="mr-1.5 h-4 w-4" /> Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading learners…
              </div>
            ) : error ? (
              <p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load'}</p>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-12 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </span>
                <p className="text-sm font-medium">No learners match</p>
                <p className="text-xs text-muted-foreground">
                  {filtersActive ? 'Try clearing the search or filters.' : 'This drive has no eligible learners yet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 [&>th]:h-10 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide">
                      <TableHead className="w-10">
                        {editable ? (
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
                    {pager.pageRows.map((r) => {
                      const on = selected.has(r.learner_id);
                      return (
                        <TableRow
                          key={r.learner_id}
                          // Clicking anywhere on the row ticks its checkbox.
                          className={cn('transition-colors', on && 'bg-primary/5 hover:bg-primary/10', editable && 'cursor-pointer')}
                          onClick={editable ? () => toggle(r.learner_id) : undefined}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {editable ? <Checkbox checked={on} onCheckedChange={() => toggle(r.learner_id)} aria-label={`Select ${r.learner_name ?? 'learner'}`} /> : null}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                  on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                )}
                              >
                                {initials(r.learner_name)}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate font-medium">{r.learner_name ?? '—'}</div>
                                <div className="font-mono text-xs text-muted-foreground">{r.register_number ?? ''}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{r.institution_name ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">
                              {[r.program_name, r.department_name].filter(Boolean).join(' · ')}
                            </div>
                          </TableCell>
                          <TableCell>
                            {r.semester_label ? (
                              <span className="whitespace-nowrap rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{r.semester_label}</span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell><Pill tone={BUCKET_TONE[r.bucket]}>{BUCKET_LABEL[r.bucket]}</Pill></TableCell>
                          <TableCell className="text-right tabular-nums">{r.cgpa != null ? Number(r.cgpa).toFixed(2) : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.arrears_count ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {r.is_participant ? (
                              <div className="flex items-center gap-2">
                                <Pill tone={r.participant_source === 'added' ? 'violet' : 'emerald'}>
                                  {r.participant_source === 'added' ? 'Added by CDC' : 'Participant'}
                                </Pill>
                                {canManage && finalized && editableStage ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    disabled={change.isPending}
                                    onClick={() => handleSingle('remove', r.learner_id)}
                                  >
                                    <X className="mr-1 h-3.5 w-3.5" /> Remove
                                  </Button>
                                ) : null}
                              </div>
                            ) : finalized ? (
                              <div className="flex items-center gap-2">
                                {r.participant_status === 'removed' ? (
                                  <Pill tone="rose">Removed</Pill>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Not included</span>
                                )}
                                {editable ? (
                                  <Button variant="outline" size="sm" className="h-7 px-2" disabled={change.isPending} onClick={() => handleSingle('add', r.learner_id)}>
                                    <Plus className="mr-1 h-3.5 w-3.5" /> Add
                                  </Button>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {visible.length > 0 ? (
              <div className="border-t bg-muted/20">
                <TablePager pager={pager} />
                {editable ? (
                  <p className="px-4 pb-3 text-xs text-muted-foreground">
                    Click a row to tick it. The header checkbox ticks everything the filters show, on every page. Ticks on other pages are kept.
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
