'use client';

// Vacate request form, shared by the two entry points:
//   - /campus-living/my-hostel/vacate-request            (learner, own allocation)
//   - /campus-living/vacate-requests/new?allocation=<id> (warden / hostel office on behalf)
//
// 3 steps: reason -> documents -> review + submit. Nothing here decides whether
// the request may be approved; every gate is re-checked in the database. The
// bill summary on the review step is a heads-up for the requester only.
//
// Layout: one column on phones (resident summary on top, actions stacked
// full-width), two columns from lg (form + sticky "what happens next" panel).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import { HostelVacateRequestService } from '@/lib/services/campus-living/hostel-vacate-request-service';
import {
  useVacateRequest,
  useCreateVacateDraft,
  useSubmitVacateDraft,
  useVacateBillStatus,
} from '@/hooks/campus-living/use-hostel-vacate';
import { DocumentUploader } from './document-uploader';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { VACATE_REASONS, VACATE_REASON_LABELS, VACATE_STATUS_LABELS } from '@/types/hostel-vacate';
import type { VacateReason, VacateRequestStatus } from '@/types/hostel-vacate';

/** Statuses that count as an open request (mirrors hvr_one_open_per_allocation). */
const OPEN_STATUSES: VacateRequestStatus[] = [
  'draft', 'pending_dues', 'pending_principal', 'pending_warden', 'pending_mess', 'pending_cao', 'pending_fine',
];

const formatInr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;
const todayIso = () => new Date().toISOString().split('T')[0]!;

const STEPS = [
  { n: 1, label: 'Reason' },
  { n: 2, label: 'Documents' },
  { n: 3, label: 'Review' },
] as const;

/** What happens after submit — mirrors the approval chain so nobody is surprised. */
const NEXT_STEPS = [
  { title: 'Bills check', text: 'All hostel and mess bills must be paid. This is automatic.' },
  { title: 'Principal', text: 'Your institution’s Principal approves the request.' },
  { title: 'Warden', text: 'Clearance checklist and a room inspection for damage.' },
  { title: 'Mess In-charge', text: 'Mess clearance.' },
  { title: 'CAO', text: 'Final approval. Any room damage is billed as a fine.' },
  { title: 'Vacated', text: 'Once any fine is paid the bed is released and you move to Day Scholar.' },
] as const;

interface AllocationView {
  id: string;
  status?: string;
  learner?: { full_name?: string | null } | null;
  hostel_blocks?: { name?: string | null } | null;
  hostel_rooms?: { room_number?: string | null; floor?: string | number | null } | null;
  hostel_beds?: { bed_number?: string | null } | null;
}

interface VacateRequestFormProps {
  /** Set when raising on behalf of a resident; omitted = the signed-in learner's own allocation. */
  allocationId?: string;
  backHref: string;
  backLabel: string;
}

export function VacateRequestForm({ allocationId, backHref, backLabel }: VacateRequestFormProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const userId = profile?.id ?? '';
  const onBehalf = !!allocationId;

  // hostel_allocations.learner_id is a profiles.id, so the signed-in user's own
  // allocation is looked up by profile.id.
  const { data: allocationRaw, isLoading: allocLoading } = useQuery({
    queryKey: ['vacate-form-allocation', allocationId ?? `own:${userId}`],
    queryFn: async () => {
      if (allocationId) return HostelAllocationService.getAllocation(allocationId);
      const rows = await HostelAllocationService.getAllocationByLearner(userId, true);
      return (rows ?? [])[0] ?? null;
    },
    enabled: onBehalf || !!userId,
  });
  const allocation = (allocationRaw ?? null) as unknown as AllocationView | null;
  const residentName = allocation?.learner?.full_name ?? null;

  // One open request per allocation. A leftover draft is resumed (not created
  // again — that was a 23505); a request already in the approval chain is shown
  // instead of a form.
  const { data: existing, isLoading: existingLoading } = useQuery({
    queryKey: ['vacate-form-existing', allocation?.id],
    queryFn: async () => {
      const res = await HostelVacateRequestService.getRequests(undefined, { allocation_id: allocation!.id });
      return res.data.find((r) => OPEN_STATUSES.includes(r.status)) ?? null;
    },
    enabled: !!allocation?.id,
  });

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [reasonType, setReasonType] = useState<VacateReason | ''>('');
  const [reasonText, setReasonText] = useState('');
  const [requestedDate, setRequestedDate] = useState<string>(todayIso());
  const [medicalNotes, setMedicalNotes] = useState('');

  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (resumed || !existing || existing.status !== 'draft') return;
    setResumed(true);
    setDraftId(existing.id);
    setReasonType(existing.reason_type);
    setReasonText(existing.reason_text);
    setRequestedDate(
      existing.requested_vacate_date >= todayIso() ? existing.requested_vacate_date : todayIso(),
    );
    setMedicalNotes(existing.medical_notes ?? '');
  }, [existing, resumed]);

  const createMut = useCreateVacateDraft();
  const submitMut = useSubmitVacateDraft();

  const isMedical = reasonType === 'medical';

  const { data: draftRequest, refetch: refetchDraft } = useVacateRequest(draftId ?? '');
  const { data: bills } = useVacateBillStatus(draftId ?? '', step === 3);

  const step1Valid = !!reasonType && reasonText.trim().length >= 10 && !!requestedDate;
  const step2Valid =
    !isMedical ||
    (draftRequest?.documents ?? []).some((d) => d.document_type === 'medical_certificate');

  async function handleStep1Next() {
    if (!step1Valid || !allocation) return;
    if (!draftId) {
      try {
        const created = await createMut.mutateAsync({
          allocation_id: allocation.id,
          reason_type: reasonType as VacateReason,
          reason_text: reasonText,
          requested_vacate_date: requestedDate,
          medical_notes: isMedical ? medicalNotes || null : null,
        });
        setDraftId(created.id);
      } catch {
        return; // the hook already toasted the reason; stay on this step
      }
    }
    setStep(2);
  }

  async function handleSubmit() {
    if (!draftId) return;
    try {
      await submitMut.mutateAsync(draftId);
    } catch {
      return; // the hook already toasted the reason
    }
    router.push(`/campus-living/vacate-requests/${draftId}`);
  }

  useEffect(() => {
    if (step === 2 && draftId) refetchDraft();
  }, [step, draftId, refetchDraft]);

  const title = onBehalf ? 'Raise Vacate Request' : 'Request Vacate';

  if (allocLoading || (!!allocation && existingLoading)) {
    return (
      <ContentLayout title={title}>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  if (!allocation || allocation.status !== 'active') {
    return (
      <ContentLayout title={title}>
        <Card>
          <CardContent className='p-6 sm:p-8 text-center space-y-3'>
            <p>
              {onBehalf
                ? 'This allocation is not active, so it cannot be vacated.'
                : "You don't have an active hostel allocation to vacate."}
            </p>
            <Button asChild variant='outline'>
              <Link href={backHref}>{backLabel}</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (existing && existing.status !== 'draft') {
    return (
      <ContentLayout title={title}>
        <Card>
          <CardContent className='p-6 sm:p-8 text-center space-y-3'>
            <p className='font-medium'>A vacate request is already open for this room.</p>
            <p className='text-sm text-muted-foreground'>
              Current status: {VACATE_STATUS_LABELS[existing.status] ?? existing.status}
            </p>
            <div className='flex flex-col gap-2 sm:flex-row sm:justify-center'>
              <Button asChild className='h-11 sm:h-10'>
                <Link href={`/campus-living/vacate-requests/${existing.id}`}>View request</Link>
              </Button>
              <Button asChild variant='outline' className='h-11 sm:h-10'>
                <Link href={backHref}>{backLabel}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const room = allocation.hostel_rooms;
  const roomLine = [
    allocation.hostel_blocks?.name,
    room?.room_number && `Room ${room.room_number}`,
    allocation.hostel_beds?.bed_number && `Bed ${allocation.hostel_beds.bed_number}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ContentLayout title={title}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: backLabel, href: backHref },
          { label: title },
        ]}
      />

      <div className='mt-4 space-y-5 sm:space-y-6'>
        {/* Header */}
        <div className='flex items-start gap-3'>
          <Button asChild variant='ghost' size='icon' className='shrink-0 -ml-2 sm:ml-0'>
            <Link href={backHref} aria-label={`Back to ${backLabel}`}>
              <ArrowLeft className='h-4 w-4' />
            </Link>
          </Button>
          <div className='min-w-0'>
            <h1 className='text-xl sm:text-2xl font-bold leading-tight'>{title}</h1>
            <p className='text-sm text-muted-foreground'>
              {onBehalf && residentName ? `For ${residentName} · ` : ''}
              Step {step} of 3{resumed ? ' · continuing your saved draft' : ''}
            </p>
          </div>
        </div>

        {/* Stepper */}
        <ol className='flex items-start' aria-label='Progress'>
          {STEPS.map((s, i) => {
            const done = step > s.n;
            const current = step === s.n;
            return (
              <li key={s.n} className={cn('flex items-start', i < STEPS.length - 1 && 'flex-1')}>
                <div className='flex flex-col items-center gap-1.5 w-16 sm:w-auto sm:flex-row sm:gap-2'>
                  <span
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
                      done && 'bg-green-600 text-white',
                      current && 'bg-primary text-primary-foreground ring-4 ring-primary/15',
                      !done && !current && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {done ? <Check className='h-4 w-4' /> : s.n}
                  </span>
                  <span
                    className={cn(
                      'text-xs sm:text-sm text-center',
                      current ? 'font-semibold' : 'text-muted-foreground',
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span
                    className={cn(
                      'mt-4 h-0.5 flex-1 mx-1 sm:mx-3 rounded-full',
                      done ? 'bg-green-600' : 'bg-border',
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>

        <div className='grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start'>
          {/* ── Main column ───────────────────────────────────────────── */}
          <div className='space-y-5 min-w-0'>
            {/* Where you stay now */}
            <Card className='bg-muted/40'>
              <CardContent className='p-4 flex items-center gap-3'>
                <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
                  <BedDouble className='h-5 w-5' />
                </span>
                <div className='min-w-0'>
                  <p className='text-xs uppercase tracking-wide text-muted-foreground'>
                    {onBehalf ? 'Current allocation' : 'Your current room'}
                  </p>
                  <p className='text-sm font-medium break-words'>{roomLine || 'Hostel allocation'}</p>
                </div>
              </CardContent>
            </Card>

            {step === 1 && (
              <Card>
                <CardHeader className='p-4 sm:p-6'>
                  <CardTitle className='text-lg'>Reason for vacating</CardTitle>
                  <CardDescription>Why the hostel is being vacated, and from when.</CardDescription>
                </CardHeader>
                <CardContent className='p-4 pt-0 sm:p-6 sm:pt-0 space-y-5'>
                  <div className='space-y-2'>
                    <Label>
                      Reason <span className='text-destructive'>*</span>
                    </Label>
                    <div className='grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3' role='radiogroup' aria-label='Reason'>
                      {VACATE_REASONS.map((r) => {
                        const selected = reasonType === r;
                        return (
                          <button
                            key={r}
                            type='button'
                            role='radio'
                            aria-checked={selected}
                            onClick={() => setReasonType(r)}
                            className={cn(
                              'flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              selected
                                ? 'border-primary bg-primary/5 font-medium text-primary'
                                : 'hover:bg-accent',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                              )}
                            >
                              {selected && <Check className='h-3 w-3' />}
                            </span>
                            <span className='leading-snug'>{VACATE_REASON_LABELS[r]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <Label htmlFor='reason-text'>
                      Describe the reason <span className='text-destructive'>*</span>
                    </Label>
                    <Textarea
                      id='reason-text'
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value.slice(0, 1000))}
                      rows={5}
                      className='text-base sm:text-sm'
                      placeholder='Give some context (at least 10 characters). The approvers will read this.'
                    />
                    <div className='flex justify-between text-xs'>
                      <span
                        className={cn(
                          reasonText.trim().length > 0 && reasonText.trim().length < 10
                            ? 'text-amber-700'
                            : 'text-muted-foreground',
                        )}
                      >
                        {reasonText.trim().length < 10
                          ? `${10 - reasonText.trim().length} more character(s) needed`
                          : 'Looks good'}
                      </span>
                      <span className='text-muted-foreground'>{reasonText.length} / 1000</span>
                    </div>
                  </div>

                  <div className='space-y-2 sm:max-w-xs'>
                    <Label htmlFor='requested-date'>
                      Requested vacate date <span className='text-destructive'>*</span>
                    </Label>
                    <div className='relative'>
                      <CalendarDays className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                      <Input
                        id='requested-date'
                        type='date'
                        value={requestedDate}
                        onChange={(e) => setRequestedDate(e.target.value)}
                        min={todayIso()}
                        className='pl-9 h-11 text-base sm:text-sm'
                      />
                    </div>
                  </div>

                  {isMedical && (
                    <div className='space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3'>
                      <Label htmlFor='medical-notes'>Medical notes (optional)</Label>
                      <Textarea
                        id='medical-notes'
                        value={medicalNotes}
                        onChange={(e) => setMedicalNotes(e.target.value)}
                        rows={3}
                        className='bg-background text-base sm:text-sm'
                        placeholder='Anything else the approvers should know.'
                      />
                      <p className='text-xs text-amber-800'>
                        A <strong>medical certificate</strong> is required in the next step.
                      </p>
                    </div>
                  )}

                  <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
                    <Button
                      onClick={handleStep1Next}
                      disabled={!step1Valid || createMut.isPending}
                      className='h-11 w-full sm:h-10 sm:w-auto'
                    >
                      {createMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                      Next: Documents
                      <ArrowRight className='ml-2 h-4 w-4' />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 2 && (
              <Card>
                <CardHeader className='p-4 sm:p-6'>
                  <CardTitle className='text-lg'>Supporting documents</CardTitle>
                  <CardDescription>
                    Up to 3 files (PDF / JPG / PNG, max 5 MB each).
                    {isMedical ? ' A medical certificate is required.' : ' Optional.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className='p-4 pt-0 sm:p-6 sm:pt-0 space-y-5'>
                  {draftId && (
                    <DocumentUploader
                      vacateRequestId={draftId}
                      documents={draftRequest?.documents ?? []}
                      requireMedicalCert={isMedical}
                    />
                  )}
                  <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-between'>
                    <Button variant='outline' onClick={() => setStep(1)} className='h-11 w-full sm:h-10 sm:w-auto'>
                      <ArrowLeft className='mr-2 h-4 w-4' />
                      Back
                    </Button>
                    <Button onClick={() => setStep(3)} disabled={!step2Valid} className='h-11 w-full sm:h-10 sm:w-auto'>
                      Next: Review
                      <ArrowRight className='ml-2 h-4 w-4' />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 3 && (
              <Card>
                <CardHeader className='p-4 sm:p-6'>
                  <CardTitle className='text-lg'>Review &amp; submit</CardTitle>
                  <CardDescription>
                    Check the details. You can cancel the request until it is approved.
                  </CardDescription>
                </CardHeader>
                <CardContent className='p-4 pt-0 sm:p-6 sm:pt-0 space-y-5'>
                  <div className='divide-y rounded-md border'>
                    <ReviewRow label='Reason' onEdit={() => setStep(1)}>
                      <Badge variant='outline'>{reasonType ? VACATE_REASON_LABELS[reasonType] : ''}</Badge>
                    </ReviewRow>
                    <ReviewRow label='Description' onEdit={() => setStep(1)}>
                      <p className='text-sm whitespace-pre-wrap break-words'>{reasonText}</p>
                    </ReviewRow>
                    <ReviewRow label='Vacate date' onEdit={() => setStep(1)}>
                      <span className='text-sm'>{requestedDate}</span>
                    </ReviewRow>
                    <ReviewRow label='Documents' onEdit={() => setStep(2)}>
                      <span className='inline-flex items-center gap-1.5 text-sm'>
                        <FileText className='h-4 w-4 text-muted-foreground' />
                        {(draftRequest?.documents ?? []).length} attached
                      </span>
                    </ReviewRow>
                    {isMedical && medicalNotes && (
                      <ReviewRow label='Medical notes' onEdit={() => setStep(1)}>
                        <p className='text-sm whitespace-pre-wrap break-words'>{medicalNotes}</p>
                      </ReviewRow>
                    )}
                  </div>

                  {bills && bills.total_outstanding > 0 ? (
                    <div className='rounded-md border border-amber-200 bg-amber-50 p-3 text-sm space-y-1'>
                      <p className='flex items-start gap-1.5 font-medium text-amber-900'>
                        <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                        {formatInr(bills.total_outstanding)} unpaid across {bills.unpaid_count} hostel / mess bill(s)
                      </p>
                      <p className='text-xs text-amber-900'>
                        You can still submit. The request waits at the bills step and moves on to the Principal
                        automatically once every hostel and mess bill is paid.
                      </p>
                    </div>
                  ) : (
                    bills && (
                      <div className='flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900'>
                        <CheckCircle2 className='h-4 w-4 shrink-0' />
                        All hostel and mess bills are cleared. The request goes straight to the Principal.
                      </div>
                    )
                  )}

                  <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-between'>
                    <Button variant='outline' onClick={() => setStep(2)} className='h-11 w-full sm:h-10 sm:w-auto'>
                      <ArrowLeft className='mr-2 h-4 w-4' />
                      Back
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitMut.isPending} className='h-11 w-full sm:h-10 sm:w-auto'>
                      {submitMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                      Submit request
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── What happens next ─────────────────────────────────────── */}
          <Card className='lg:sticky lg:top-4'>
            <CardHeader className='p-4 sm:p-6 pb-2 sm:pb-3'>
              <CardTitle className='text-base flex items-center gap-2'>
                <Building2 className='h-4 w-4' />
                What happens next
              </CardTitle>
            </CardHeader>
            <CardContent className='p-4 pt-0 sm:p-6 sm:pt-0'>
              <ol className='space-y-3'>
                {NEXT_STEPS.map((s, i) => (
                  <li key={s.title} className='flex gap-3'>
                    <span className='mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium'>
                      {i + 1}
                    </span>
                    <div className='min-w-0'>
                      <p className='text-sm font-medium leading-tight'>{s.title}</p>
                      <p className='text-xs text-muted-foreground'>{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className='mt-4 border-t pt-3 text-xs text-muted-foreground'>
                Your bed is held as <em>pending vacate</em> while the request is open.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}

function ReviewRow({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className='flex items-start justify-between gap-3 p-3'>
      <div className='min-w-0 space-y-1'>
        <span className='text-[11px] uppercase tracking-wide text-muted-foreground'>{label}</span>
        <div>{children}</div>
      </div>
      <Button type='button' variant='ghost' size='sm' className='shrink-0 h-8 px-2' onClick={onEdit}>
        <Pencil className='mr-1 h-3.5 w-3.5' />
        Edit
      </Button>
    </div>
  );
}
