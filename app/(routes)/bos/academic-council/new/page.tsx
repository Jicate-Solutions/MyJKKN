'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Users, CalendarPlus, Loader2, Plus, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { AcAddMemberDialog } from '@/app/(routes)/bos/academic-council/_components/ac-add-member-dialog';

import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useCreateBosMeeting } from '@/hooks/bos/use-bos-meetings';
import {
  useBosMembersByComposition,
  useRemoveBosMember,
  bosMemberKeys,
} from '@/hooks/bos/use-bos-members';
import {
  bosMemberTypeLabel,
  isBosChairmanRow,
  type BosComposition,
  type BosMember,
  type BosMemberType,
  type CreateBosMeetingDto,
} from '@/types/bos';

// CAS-deduped institution option from /api/bos/institutions — Aided + Self
// collapse into ONE row (id = primary MyJKKN UUID). Same source the composition
// form uses, so the AC picker matches it exactly.
interface BosInstitutionOption {
  id: string;
  name: string;
  institution_code: string;
  myjkkn_institution_ids: string[];
}

// Default academic year in "YYYY-YY" form. The Indian academic year rolls over
// mid-year (≈ June), so months ≥ June belong to year → year+1.
function defaultAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 5 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export default function NewAcademicCouncilMeetingPage() {
  return (
    <PermissionGuard module='academic.bos-academic-council' action='manage'>
      <NewAcademicCouncilMeeting />
    </PermissionGuard>
  );
}

function NewAcademicCouncilMeeting() {
  const router = useRouter();
  const scope = useBosBoardScope();
  const createMeeting = useCreateBosMeeting();

  // Super-admin picks the institution; a principal's is taken from their scope.
  // Source: /api/bos/institutions — CAS-deduped (Aided + Self as one entry),
  // the same endpoint the composition form uses.
  const { data: institutions = [] } = useQuery<BosInstitutionOption[]>({
    queryKey: ['bos', 'institutions'],
    queryFn: async () => {
      const r = await fetch('/api/bos/institutions');
      if (!r.ok) return [];
      return r.json();
    },
    enabled: scope.isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const [pickedInstitution, setPickedInstitution] = useState('');
  const institutionsId = scope.isSuperAdmin
    ? pickedInstitution || undefined
    : scope.institutionsId ?? undefined;

  // Academic year — sourced from the academic_years table (same as the BoS
  // meeting form). Empty until the table resolves; auto-selected below.
  const [academicYear, setAcademicYear] = useState('');
  const { data: academicYearsResp } = useAcademicYears(institutionsId);
  const academicYears = academicYearsResp?.data ?? [];

  // Auto-select the newest academic year once the table loads (rows come back
  // ordered newest-first). Only fills an empty field, never overrides a choice.
  useEffect(() => {
    if (academicYear) return;
    if (academicYears.length > 0) {
      setAcademicYear(academicYears[0].academic_year_name);
    }
  }, [academicYears, academicYear]);

  const queryClient = useQueryClient();

  // Step 1 result: the AC body + its (post-snapshot) roster.
  const [council, setCouncil] = useState<{
    composition: BosComposition;
    members: BosMember[];
    snapshotted: number;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  // Live roster — same React Query cache the composition page uses, so the
  // AddMemberDialog (useAddBosMember) and delete (useRemoveBosMember) mutations
  // reflect instantly here. Seeded from the prepare response below.
  const councilCompositionId = council?.composition.id;
  const { data: liveMembers } = useBosMembersByComposition(councilCompositionId);
  const members = liveMembers ?? council?.members ?? [];
  const removeMember = useRemoveBosMember();

  // Step 2 fields.
  const [meetingNumber, setMeetingNumber] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [venue, setVenue] = useState('');
  const [agenda, setAgenda] = useState('');

  const institutionOptions = useMemo(
    () => institutions.map((i) => ({ value: i.id, label: `${i.name} (${i.institution_code})` })),
    [institutions],
  );

  // Academic-year options — from the academic_years table. Falls back to a
  // generated range only if the table has no rows for this institution, so the
  // dropdown is never empty. The current value is always kept selectable.
  const academicYearOptions = useMemo(() => {
    const fromTable = academicYears.map((ay) => ({
      value: ay.academic_year_name,
      label: ay.academic_year_name,
    }));
    const opts =
      fromTable.length > 0
        ? fromTable
        : (() => {
            const currentStart = parseInt(defaultAcademicYear().slice(0, 4), 10);
            const gen: { value: string; label: string }[] = [];
            for (let start = currentStart + 1; start >= currentStart - 4; start--) {
              const y = `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
              gen.push({ value: y, label: y });
            }
            return gen;
          })();
    if (academicYear && !opts.some((o) => o.value === academicYear)) {
      opts.unshift({ value: academicYear, label: academicYear });
    }
    return opts;
  }, [academicYears, academicYear]);

  const handlePrepare = async () => {
    if (!institutionsId) {
      toast.error('Select an institution first.');
      return;
    }
    if (!academicYear.trim()) {
      toast.error('Enter the academic year.');
      return;
    }
    setPreparing(true);
    try {
      const res = await fetch('/api/bos/academic-council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutions_id: institutionsId, academic_year: academicYear.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to prepare council');
      setCouncil(json);
      // Seed the members cache so the live list renders the snapshot immediately
      // (before/without the follow-up GET), and so add/remove mutations have a
      // baseline to mutate.
      queryClient.setQueryData(bosMemberKeys.byComposition(json.composition.id), json.members);
      // Suggest the next meeting number for this council (per-composition
      // sequence). Best-effort — falls back to 1 if the count query fails.
      try {
        const mres = await fetch(
          `/api/bos/meetings?compositionId=${json.composition.id}&meetingType=academic_council&limit=100`,
        );
        const mjson = await mres.json();
        const rows = (mjson?.data ?? []) as { meeting_number?: number }[];
        const maxNum = rows.reduce((mx, r) => Math.max(mx, Number(r.meeting_number) || 0), 0);
        setMeetingNumber(maxNum + 1);
      } catch {
        setMeetingNumber(1);
      }
      toast.success(
        json.snapshotted > 0
          ? `Council ready — ${json.snapshotted} chairman(s) added.`
          : 'Council ready.',
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPreparing(false);
    }
  };

  const handleSchedule = async () => {
    if (!council || !institutionsId) return;
    try {
      // board_id is null for an Academic Council meeting — the shared meetings
      // route accepts that for meeting_type 'academic_council'.
      const payload = {
        institutions_id: institutionsId,
        composition_id: council.composition.id,
        board_id: null,
        meeting_type: 'academic_council',
        meeting_number: meetingNumber === '' ? undefined : Number(meetingNumber),
        academic_year: academicYear.trim(),
        meeting_title: title.trim() || `Academic Council Meeting ${academicYear.trim()}`,
        scheduled_date: scheduledDate || undefined,
        scheduled_time: scheduledTime || undefined,
        venue: venue.trim() || undefined,
        agenda_text: agenda.trim() || undefined,
      } as unknown as CreateBosMeetingDto;

      const created = await createMeeting.mutateAsync(payload);
      toast.success('Academic Council meeting scheduled.');
      router.push(`/bos/meetings/${created.id}`);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to schedule meeting');
    }
  };

  return (
    <div className='w-full max-w-5xl mx-auto space-y-6 overflow-x-hidden'>
      <PageHeader
        title='New Academic Council Meeting'
        description='Prepare the council roster, then schedule the meeting.'
      >
        <Button variant='outline' size='sm' onClick={() => router.push('/bos/academic-council')}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back
        </Button>
      </PageHeader>

      {/* ── Step 1: Prepare the council body ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>1 · Council & Academic Year</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            {scope.isSuperAdmin && (
              <div className='space-y-2'>
                <Label>
                  Institution <span className='text-destructive'>*</span>
                </Label>
                <SearchableSelect
                  value={pickedInstitution}
                  onValueChange={(v) => {
                    setPickedInstitution(v);
                    setCouncil(null);
                  }}
                  options={institutionOptions}
                  placeholder='Select institution'
                  searchPlaceholder='Search institution…'
                  className='w-full'
                />
              </div>
            )}

            <div className='space-y-2'>
              <Label>
                Academic Year <span className='text-destructive'>*</span>
              </Label>
              <SearchableSelect
                value={academicYear}
                onValueChange={(v) => {
                  setAcademicYear(v);
                  setCouncil(null);
                }}
                options={academicYearOptions}
                placeholder='Select academic year'
                searchPlaceholder='Search year…'
                className='w-full'
              />
            </div>
          </div>

          <Button onClick={handlePrepare} disabled={preparing || !institutionsId}>
            {preparing ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Users className='mr-2 h-4 w-4' />
            )}
            {council ? 'Refresh Chairmen' : 'Prepare Council'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Council roster (add member like a composition) ───────────────── */}
      {council && (
        <Card>
          <CardHeader className='flex flex-row items-center justify-between gap-3 space-y-0'>
            <CardTitle className='text-base'>
              Council Members{' '}
              <span className='text-sm font-normal text-muted-foreground'>({members.length})</span>
            </CardTitle>
            <Button size='sm' variant='outline' onClick={() => setShowAddMember(true)}>
              <Plus className='mr-2 h-4 w-4' />
              Add Member
            </Button>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                No members yet. Board of Studies chairmen are added automatically when found —
                use “Add Member” to include the Principal, Deans, or external experts.
              </p>
            ) : (
              <ul className='divide-y'>
                {members.map((m) => (
                  <li key={m.id} className='flex items-center justify-between gap-3 py-2'>
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium'>{m.display_name}</p>
                      {m.display_designation && (
                        <p className='truncate text-xs text-muted-foreground'>
                          {m.display_designation}
                        </p>
                      )}
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                      <Badge
                        variant={isBosChairmanRow(m) ? 'default' : 'secondary'}
                      >
                        {m.member_type_rec?.name ?? bosMemberTypeLabel(m.member_type)}
                      </Badge>
                      <Button
                        size='icon'
                        variant='ghost'
                        className='h-7 w-7 text-muted-foreground hover:text-destructive'
                        title='Remove member'
                        disabled={m.id.startsWith('optimistic-')}
                        onClick={() =>
                          removeMember.mutate(
                            { id: m.id, compositionId: council.composition.id },
                            { onError: (e) => toast.error((e as Error).message || 'Failed to remove') },
                          )
                        }
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* AddMemberDialog — the exact composition-page component. Member Type
          select + staff/expert picker; posts via useAddBosMember to
          /api/bos/members (AC-branched to authorize the principal). */}
      {council && institutionsId && (
        <AcAddMemberDialog
          open={showAddMember}
          onClose={() => setShowAddMember(false)}
          compositionId={council.composition.id}
          institutionsId={institutionsId}
          existingMembers={members.map((m) => ({
            staff_id: m.staff_id ?? null,
            expert_id: m.expert_id ?? null,
            member_type: m.member_type,
          }))}
        />
      )}

      {/* ── Step 2: Schedule the meeting ─────────────────────────────────── */}
      {council && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>2 · Meeting Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label>
                  Meeting Number <span className='text-destructive'>*</span>
                </Label>
                <Input
                  type='number'
                  min={1}
                  value={meetingNumber}
                  onChange={(e) =>
                    setMeetingNumber(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder='1'
                />
                <p className='text-xs text-muted-foreground'>Auto-suggested; adjustable.</p>
              </div>
              <div className='space-y-2'>
                <Label>Meeting Type</Label>
                <Input value='Academic Council' readOnly disabled />
              </div>
            </div>
            <div className='space-y-2'>
              <Label>Meeting Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Academic Council Meeting ${academicYear.trim()}`}
              />
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label>Date</Label>
                <Input
                  type='date'
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
              <div className='space-y-2'>
                <Label>Time</Label>
                <Input
                  type='time'
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </div>
            <div className='space-y-2'>
              <Label>Venue</Label>
              <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder='Council Hall' />
            </div>
            <div className='space-y-2'>
              <Label>Agenda</Label>
              <Textarea
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder='Ratification of Board of Studies recommendations, regulation changes, …'
                rows={4}
              />
            </div>

            <Button onClick={handleSchedule} disabled={createMeeting.isPending}>
              {createMeeting.isPending ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <CalendarPlus className='mr-2 h-4 w-4' />
              )}
              Schedule Meeting
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
