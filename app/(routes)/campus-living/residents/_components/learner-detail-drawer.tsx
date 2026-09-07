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
//   6. Section 4: Billing details — itemized bills across all academic years
//      (campus_living_get_hostelite_bills RPC), with a billed/paid/outstanding
//      roll-up. Added 2026-06-09.
//   7. Section 5: Recent activity — last 5 gate-passes + leaves + attendance +
//      open vacate. (Leaves added 2026-05-15 once /campus-living/leave UI route
//      shipped; was deferred in PR #822 per /assumption-thrash Round 1 #2.)
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
  CalendarOff,
  ClipboardList,
  DoorOpen,
  AlertCircle,
  Receipt,
} from 'lucide-react';
import type {
  LearnerGatePassSummary,
  LearnerAttendanceSummary,
  LearnerVacateRequestSummary,
  LearnerLeaveSummary,
  LearnerBillItem,
} from '@/types/campus-living';

interface Props {
  learnerId: string | null;
  onClose: () => void;
  onEdit?: () => void; // opens existing edit drawer (warden+ only)
  canEdit?: boolean;
  /** Open the inline room-allocation dialog for this (unallocated) learner.
   *  When provided, the "Allocate to a block" CTA uses it instead of the old
   *  /allocations/new wizard (which ignores the learner + has a broken submit). */
  onAllocate?: () => void;
  /** Placement readiness for an UNPLACED learner, from
   *  fn_hostel_unallocated_candidates (supplied by the Allocations table).
   *
   *  The categories here are what the allocation RULES resolve, which is not
   *  the same thing as `v_learner_hostelites.hostel_category_name` — that is
   *  what the learner's own profile stores. Measured on 2026-09-02 the two
   *  disagreed for 14 of the 61 unplaced learners: 10 whose profile says
   *  Deluxe / Deluxe Plus while the rules resolve Classic, and 4 whose profile
   *  is blank while the rules resolve a category fine. Showing only the profile
   *  value told an admin a learner was getting a room they will not get, so
   *  when this prop is present the resolved value leads and a disagreeing
   *  profile value is called out rather than hidden.
   *
   *  `blockers` arrives already humanised (missing_items, else the bill-state
   *  label) so the drawer and the table's "Why not allocated" column cannot
   *  drift apart. */
  placement?: {
    readiness: 'ready' | 'incomplete';
    resolvedRoomCategory: string | null;
    resolvedMessCategory: string | null;
    blockers: string[];
  } | null;
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

export function LearnerDetailDrawer({
  learnerId,
  onClose,
  onEdit,
  canEdit,
  onAllocate,
  placement,
}: Props) {
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

  // Roll-up of the itemized bills (all academic years). Paid = billed −
  // outstanding (each bill already carries balance_amount).
  const billSummary = useMemo(() => {
    const bills = data?.bills ?? [];
    const billed = bills.reduce((s, b) => s + (b.final_amount ?? 0), 0);
    const outstanding = bills.reduce((s, b) => s + (b.balance_amount ?? 0), 0);
    return { count: bills.length, billed, outstanding, paid: billed - outstanding };
  }, [data]);

  function handleOpenChange(next: boolean) {
    if (!next) onClose();
  }

  function navigateToAllocations() {
    if (!data?.learner) return;
    if (data.currentAllocation) {
      router.push(`/campus-living/allocations`);
    } else if (onAllocate) {
      // Open the inline allocate dialog (pre-selected learner, occupancy panel,
      // working RPC) instead of the old wizard.
      onAllocate();
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
              {/* Room / mess category. Without `placement` these come off the
                  learner's profile (v_learner_hostelites) exactly as before.
                  With it — i.e. an unplaced learner opened from the Allocations
                  table — the rule-resolved category leads instead, because that
                  is what allocation will actually give them. See the Props doc. */}
              {placement ? (
                <>
                  <CategoryKV
                    label='Room category'
                    resolved={placement.resolvedRoomCategory}
                    stored={data.learner.hostel_category_name}
                  />
                  <CategoryKV
                    label='Mess category'
                    resolved={placement.resolvedMessCategory}
                    stored={data.learner.mess_category_name}
                  />
                </>
              ) : (
                <>
                  <KV label='Room category' value={dash(data.learner.hostel_category_name)} />
                  <KV label='Mess category' value={dash(data.learner.mess_category_name)} />
                </>
              )}

              {/* Readiness — the same verdict and blocking reasons the
                  Allocations table shows, so opening a row never contradicts
                  the row it was opened from. */}
              {placement && (
                <div className='sm:col-span-2 rounded-md border p-3'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='text-[11px] text-muted-foreground'>Readiness</span>
                    {placement.readiness === 'ready' ? (
                      <Badge className='gap-1 border-green-200 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'>
                        Ready to allocate
                      </Badge>
                    ) : (
                      <Badge
                        variant='outline'
                        className='gap-1 border-amber-300 text-amber-700 dark:text-amber-400'
                      >
                        Incomplete
                      </Badge>
                    )}
                  </div>
                  {placement.readiness === 'ready' ? (
                    <p className='mt-2 text-xs text-green-700 dark:text-green-400'>
                      All conditions met — a bed can be assigned now.
                    </p>
                  ) : placement.blockers.length > 0 ? (
                    <div className='mt-2 flex flex-wrap gap-1'>
                      {placement.blockers.map((b) => (
                        <Badge
                          key={b}
                          variant='outline'
                          className='border-amber-300 text-[10px] text-amber-700 dark:text-amber-400'
                        >
                          {b}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className='mt-2 text-xs text-muted-foreground'>
                      Blocked, but no specific reason was reported.
                    </p>
                  )}
                </div>
              )}
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

            {/* Section 4: Billing details (itemized bills — all academic years) */}
            <Section title='Billing details'>
              <div className='col-span-2 space-y-3'>
                {/* Summary chips */}
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                  <BillStat label='Billed' value={formatRupees(billSummary.billed)} />
                  <BillStat label='Paid' value={formatRupees(billSummary.paid)} tone='paid' />
                  <BillStat label='Outstanding' value={formatRupees(billSummary.outstanding)} tone={billSummary.outstanding > 0 ? 'due' : 'paid'} />
                  <BillStat label='Bills' value={String(billSummary.count)} />
                </div>

                {/* Itemized list */}
                {data.bills.length > 0 ? (
                  <ul className='divide-y rounded-md border'>
                    {data.bills.map((b: LearnerBillItem) => (
                      <BillRow key={b.id} bill={b} />
                    ))}
                  </ul>
                ) : (
                  <div className='flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                    <Receipt className='h-4 w-4' />
                    No bills generated for this learner yet.
                  </div>
                )}
              </div>
            </Section>

            <Separator />

            {/* Section 5: Recent activity (4-slice — leaves added 2026-05-15) */}
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
                  icon={<CalendarOff className='h-4 w-4' />}
                  title='Last 5 leave requests'
                  empty='No leave activity'
                  viewAllHref={`/campus-living/leave?learner=${data.learner.id}`}
                >
                  {data.recentLeaves.length > 0 && (
                    <ul className='space-y-1.5 text-xs'>
                      {data.recentLeaves.map((lv: LearnerLeaveSummary) => (
                        <li key={lv.id} className='flex items-center justify-between gap-2'>
                          <span className='truncate text-foreground'>
                            {lv.reason ?? lv.leave_type ?? '(no reason)'}
                          </span>
                          <span className='flex items-center gap-2 shrink-0'>
                            <Badge variant='outline' className='text-[10px] capitalize'>
                              {lv.status.replace(/_/g, ' ')}
                            </Badge>
                            <span className='text-muted-foreground'>{formatDate(lv.from_date)}</span>
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

// Room/mess category for an UNPLACED learner: lead with what allocation will
// actually resolve, and surface the profile's own value when it disagrees
// rather than silently picking one of the two. A learner whose profile says
// Deluxe but who resolves to Classic is a downgrade the admin needs to see
// BEFORE assigning the bed, not after.
function CategoryKV({
  label,
  resolved,
  stored,
}: {
  label: string;
  resolved: string | null;
  stored: string | null;
}) {
  const mismatch = !!resolved && !!stored && resolved !== stored;
  return (
    <div>
      <dt className='text-[11px] text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{resolved ?? stored ?? '—'}</dd>
      {mismatch && (
        <p className='mt-0.5 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400'>
          <AlertCircle className='mt-px h-3 w-3 shrink-0' />
          <span>
            Profile says {stored} — allocation resolves {resolved}
          </span>
        </p>
      )}
      {!resolved && stored && (
        <p className='mt-0.5 text-[11px] text-muted-foreground'>
          From the profile; no rule resolved one yet
        </p>
      )}
    </div>
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

// ─── Billing helpers ──────────────────────────────────────────────────

function BillStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'paid' | 'due';
}) {
  const valueCls =
    tone === 'paid' ? 'text-green-700' : tone === 'due' ? 'text-red-700' : 'text-foreground';
  return (
    <div className='rounded-md border bg-muted/20 px-3 py-2'>
      <div className='text-[11px] text-muted-foreground'>{label}</div>
      <div className={`font-mono text-sm font-medium ${valueCls}`}>{value}</div>
    </div>
  );
}

// Maps billing_student_bills.status → label + badge classes. Cancelled/superseded
// are filtered out server-side, so only the live states reach here.
function billStatusBadge(status: string | null): { label: string; cls: string } {
  switch (status) {
    case 'paid':
      return { label: 'Paid', cls: 'bg-green-100 text-green-800 hover:bg-green-100' };
    case 'partially_paid':
      return { label: 'Partial', cls: 'bg-amber-100 text-amber-800 hover:bg-amber-100' };
    case 'overdue':
      return { label: 'Overdue', cls: 'bg-red-100 text-red-800 hover:bg-red-100' };
    case 'unpaid':
      return { label: 'Unpaid', cls: 'bg-slate-100 text-slate-700 hover:bg-slate-100' };
    default:
      return { label: status ? status.replace(/_/g, ' ') : '—', cls: '' };
  }
}

function BillRow({ bill }: { bill: LearnerBillItem }) {
  const badge = billStatusBadge(bill.status);
  // Prefer the explicit description; fall back to the category (bill_description
  // is null for auto-generated academic/hostel bills).
  const title = bill.bill_description?.trim() || bill.category_name || 'Bill';
  // Period: the bill's academic year if tagged, else the year-of-study it applies
  // to (academic tuition bills carry applies_year_of_study, not academic_year_id).
  const period =
    bill.academic_year_name?.trim() ||
    (bill.applies_year_of_study != null ? `Year ${bill.applies_year_of_study}` : null);

  return (
    <li className='flex items-start justify-between gap-3 px-3 py-2'>
      <div className='min-w-0'>
        <div className='truncate text-sm font-medium'>{title}</div>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground'>
          {period && <span>{period}</span>}
          {bill.due_date && <span>· Due {formatDate(bill.due_date)}</span>}
          {bill.balance_amount != null && bill.balance_amount > 0 && (
            <span>· Bal {formatRupees(bill.balance_amount)}</span>
          )}
        </div>
      </div>
      <div className='flex shrink-0 flex-col items-end gap-1'>
        <span className='font-mono text-sm font-medium'>{formatRupees(bill.final_amount)}</span>
        <Badge className={`w-fit border-transparent text-[10px] ${badge.cls}`}>
          {badge.label}
        </Badge>
      </div>
    </li>
  );
}
