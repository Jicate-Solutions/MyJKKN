'use client';

// Comprehensive read-only detail drawer for /campus-living/residents Learners
// tab. Triggered by row-click (BUG-003326). Wider audience than the Edit
// drawer — any role with `campus_living.residents.view` can open this.
//
// Layout per spec:
//   1. Drawer header — name + roll · institution + chips (hostel / year / gender)
//   2. Quick actions — Edit hostel details (warden+) + Open in Allocations
//   3. Section 1: Learner record (read-only)
//   4. Section 2: Hostel profile (read-only, from learner_hostel_profiles)
//   5. Section 3: Allocation status (current active or "Allocate" CTA)
//   6. Section 4: Recent activity — last 5 gate-passes + attendance + open vacate
//      (Leaves dropped per /assumption-thrash Round 1 #2 — no UI route yet.)
//
// Mobile: Sheet renders full-screen via `w-full` (no sm: max-width). Desktop:
// max-w-2xl. shadcn Sheet handles ESC + overlay close + back-gesture.

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useLearnerDetailBundle } from '@/hooks/campus-living/use-learner-hostelites';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Pencil,
  ArrowRight,
  Calendar,
  ClipboardList,
  DoorOpen,
  AlertCircle,
} from 'lucide-react';
import type {
  LearnerGatePassSummary,
  LearnerAttendanceSummary,
  LearnerVacateRequestSummary,
} from '@/types/campus-living';

interface Props {
  learnerId: string | null;
  onClose: () => void;
  onEdit?: () => void; // opens existing edit drawer (warden+ only)
  canEdit?: boolean;
}

function fullName(first: string | null, last: string | null): string {
  const parts = [first, last].filter(Boolean).map((s) => s!.trim());
  return parts.join(' ') || '(unnamed)';
}

function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatRupees(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

export function LearnerDetailDrawer({ learnerId, onClose, onEdit, canEdit }: Props) {
  const open = !!learnerId;
  const router = useRouter();
  const { institutions } = useInstitutionsWithAccess();
  const { permissions, isSuperAdmin } = usePermissions();
  const { data, isLoading, error } = useLearnerDetailBundle(learnerId);

  const canEditResolved = canEdit ?? (isSuperAdmin || !!permissions?.['campus_living.residents.edit']);

  const institutionName = useMemo(() => {
    if (!data?.learner.institution_id) return '—';
    const match = institutions.find((i: { id: string; name: string }) => i.id === data.learner.institution_id);
    return match?.name ?? '—';
  }, [data, institutions]);

  function handleOpenChange(next: boolean) {
    if (!next) onClose();
  }

  function navigateToAllocations() {
    if (!data?.learner) return;
    if (data.currentAllocation) {
      router.push(`/campus-living/allocations`);
    } else {
      router.push(`/campus-living/allocations/new?learner=${data.learner.id}`);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} modal={false}>
      <SheetContent className='w-full sm:max-w-2xl overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>
            {data ? fullName(data.learner.first_name, data.learner.last_name) : 'Learner details'}
          </SheetTitle>
          <SheetDescription>
            {data ? (
              <span className='text-xs'>
                <span className='font-mono'>{data.learner.roll_number ?? '—'}</span>
                {' · '}
                {institutionName}
              </span>
            ) : (
              'Read-only view. Edit lives behind the pencil icon (warden+).'
            )}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className='mt-12 flex flex-col items-center gap-3 text-muted-foreground'>
            <Loader2 className='h-6 w-6 animate-spin' />
            <span className='text-sm'>Loading learner details…</span>
          </div>
        )}

        {error && (
          <div className='mt-8 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
            <div className='flex items-center gap-2 font-medium'>
              <AlertCircle className='h-4 w-4' />
              Failed to load learner.
            </div>
            <p className='mt-1 text-xs text-destructive/80'>
              {(error as Error).message}
            </p>
          </div>
        )}

        {data && (
          <div className='mt-6 space-y-6'>
            {/* Status chips */}
            <div className='flex flex-wrap gap-2'>
              {data.learner.hostel_type && (
                <Badge variant={data.learner.hostel_type === 'AC HOSTEL' ? 'default' : 'secondary'}>
                  {data.learner.hostel_type === 'AC HOSTEL' ? 'AC Hostel' : 'Non-AC Hostel'}
                </Badge>
              )}
              {data.learner.year_of_study !== null && data.learner.year_of_study !== undefined && (
                <Badge variant='outline'>Year {data.learner.year_of_study}</Badge>
              )}
              {data.learner.gender && (
                <Badge variant='outline' className='capitalize'>
                  {data.learner.gender.toLowerCase()}
                </Badge>
              )}
              {!data.currentAllocation && (
                <Badge variant='destructive' className='text-xs'>
                  Unallocated
                </Badge>
              )}
            </div>

            {/* Quick actions */}
            <div className='flex flex-wrap gap-2'>
              {canEditResolved && onEdit && (
                <Button variant='outline' size='sm' onClick={onEdit}>
                  <Pencil className='mr-2 h-4 w-4' />
                  Edit hostel details
                </Button>
              )}
              <Button variant='outline' size='sm' onClick={navigateToAllocations}>
                <ArrowRight className='mr-2 h-4 w-4' />
                {data.currentAllocation ? 'Open in Allocations' : 'Allocate to a block'}
              </Button>
            </div>

            <Separator />

            {/* Section 1: Learner record */}
            <Section title='Learner record'>
              <KV label='Full name' value={fullName(data.learner.first_name, data.learner.last_name)} />
              <KV label='Roll number' value={dash(data.learner.roll_number)} mono />
              <KV
                label='Email'
                value={dash(data.learner.student_email ?? data.learner.college_email)}
                colSpanAll
              />
              <KV label='Father&apos;s name' value={dash(data.learner.father_name)} />
              <KV label='Mother&apos;s name' value={dash(data.learner.mother_name)} />
              <KV label='Institution' value={institutionName} />
              <KV
                label='Year of study'
                value={
                  data.learner.year_of_study !== null && data.learner.year_of_study !== undefined
                    ? `Year ${data.learner.year_of_study}`
                    : '—'
                }
              />
              <KV label='Accommodation' value={dash(data.learner.accommodation_type)} />
              <KV label='Hostel fee' value={formatRupees(data.learner.hostel_fee)} />
              <KV label='Day-scholar fee' value={formatRupees(data.learner.dayscholar_fee)} />
            </Section>

            <Separator />

            {/* Section 2: Hostel profile */}
            <Section title='Hostel profile'>
              {data.hostelProfile ? (
                <>
                  <KV label='Emergency contact' value={dash(data.hostelProfile.hostel_emergency_contact_name)} />
                  <KV label='Relationship' value={dash(data.hostelProfile.hostel_emergency_contact_relation)} />
                  <KV label='Emergency phone' value={dash(data.hostelProfile.hostel_emergency_contact_phone)} mono />
                  <KV label='Parent phone (hostel)' value={dash(data.hostelProfile.hostel_parent_phone)} mono />
                  <KV label='Medical notes' value={dash(data.hostelProfile.hostel_medical_notes)} colSpanAll />
                  <KV label='Last updated' value={formatDate(data.hostelProfile.updated_at)} />
                </>
              ) : (
                <p className='col-span-2 text-xs text-muted-foreground italic'>
                  No hostel profile yet. Wardens add emergency contacts + medical notes via the Edit drawer.
                </p>
              )}
            </Section>

            <Separator />

            {/* Section 3: Allocation status */}
            <Section title='Allocation status'>
              {data.currentAllocation ? (
                <>
                  <KV
                    label='Block'
                    value={
                      data.currentAllocation.block_name
                        ? `${data.currentAllocation.block_name}${data.currentAllocation.block_code ? ` (${data.currentAllocation.block_code})` : ''}`
                        : '—'
                    }
                  />
                  <KV label='Room' value={dash(data.currentAllocation.room_number)} />
                  <KV label='Bed' value={dash(data.currentAllocation.bed_number)} />
                  <KV label='Allocated on' value={formatDate(data.currentAllocation.allocation_date)} />
                  <KV label='Expected vacate' value={formatDate(data.currentAllocation.expected_vacate_date)} />
                  <KV label='Status' value={dash(data.currentAllocation.status)} />
                </>
              ) : (
                <div className='col-span-2 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground'>
                  <p className='mb-3'>No hostel allocation yet.</p>
                  <Button size='sm' variant='secondary' onClick={navigateToAllocations}>
                    Allocate to a block
                    <ArrowRight className='ml-2 h-4 w-4' />
                  </Button>
                </div>
              )}
            </Section>

            <Separator />

            {/* Section 4: Recent activity (3-slice — leaves dropped) */}
            <Section title='Recent activity'>
              <div className='col-span-2 space-y-4'>
                <ActivitySubsection
                  icon={<DoorOpen className='h-4 w-4' />}
                  title='Last 5 gate-passes'
                  empty='No gate-pass activity'
                  viewAllHref={`/campus-living/gate-passes?learner=${data.learner.id}`}
                >
                  {data.recentGatePasses.length > 0 && (
                    <ul className='space-y-1.5 text-xs'>
                      {data.recentGatePasses.map((gp: LearnerGatePassSummary) => (
                        <li key={gp.id} className='flex items-center justify-between gap-2'>
                          <span className='truncate text-foreground'>
                            {gp.purpose ?? gp.pass_number ?? '(no purpose)'}
                          </span>
                          <span className='flex items-center gap-2 shrink-0'>
                            <Badge variant='outline' className='text-[10px] capitalize'>
                              {gp.status}
                            </Badge>
                            <span className='text-muted-foreground'>{formatDate(gp.created_at)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </ActivitySubsection>

                <ActivitySubsection
                  icon={<Calendar className='h-4 w-4' />}
                  title='Last 5 attendance entries'
                  empty='No attendance recorded'
                  viewAllHref={`/campus-living/attendance/history?learner=${data.learner.id}`}
                >
                  {data.recentAttendance.length > 0 && (
                    <ul className='space-y-1.5 text-xs'>
                      {data.recentAttendance.map((att: LearnerAttendanceSummary) => (
                        <li key={att.id} className='flex items-center justify-between gap-2'>
                          <span className='text-foreground'>{formatDate(att.date)}</span>
                          <Badge variant='outline' className='text-[10px] capitalize'>
                            {att.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </ActivitySubsection>

                <ActivitySubsection
                  icon={<ClipboardList className='h-4 w-4' />}
                  title='Open vacate request'
                  empty='No open vacate request'
                >
                  {data.openVacateRequest && <VacateRow vac={data.openVacateRequest} />}
                </ActivitySubsection>
              </div>
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Local helpers ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className='mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
        {title}
      </h3>
      <dl className='grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2'>
        {children}
      </dl>
    </section>
  );
}

function KV({
  label,
  value,
  mono = false,
  colSpanAll = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  colSpanAll?: boolean;
}) {
  return (
    <div className={colSpanAll ? 'sm:col-span-2' : ''}>
      <dt className='text-[11px] text-muted-foreground'>{label}</dt>
      <dd className={mono ? 'font-mono text-xs' : 'text-sm'}>{value}</dd>
    </div>
  );
}

function ActivitySubsection({
  icon,
  title,
  empty,
  viewAllHref,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  viewAllHref?: string;
  children?: React.ReactNode;
}) {
  const hasContent = !!children;
  return (
    <div className='rounded-md border bg-muted/20 p-3'>
      <div className='mb-2 flex items-center justify-between'>
        <div className='flex items-center gap-2 text-xs font-medium'>
          {icon}
          {title}
        </div>
        {viewAllHref && hasContent && (
          <a
            href={viewAllHref}
            className='text-[11px] text-primary hover:underline underline-offset-2'
          >
            View all →
          </a>
        )}
      </div>
      {hasContent ? children : <p className='text-xs italic text-muted-foreground'>{empty}</p>}
    </div>
  );
}

function VacateRow({ vac }: { vac: LearnerVacateRequestSummary }) {
  return (
    <div className='flex items-start justify-between gap-3 text-xs'>
      <div>
        <div className='font-medium capitalize'>{vac.status}</div>
        {vac.reason && <div className='text-muted-foreground'>{vac.reason}</div>}
      </div>
      <div className='shrink-0 text-right text-muted-foreground'>
        <div>Effective: {formatDate(vac.effective_date)}</div>
        <div>Submitted: {formatDate(vac.created_at)}</div>
      </div>
    </div>
  );
}
