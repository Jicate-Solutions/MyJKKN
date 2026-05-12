'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, IndianRupee, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/hooks/use-auth';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { BosTaDaClaim, BosClaimStatus, BosMeetingAttendee } from '@/types/bos';
import {
  useBosTaDaClaims,
  useCreateBosTaDaClaim,
  useUpdateBosTaDaClaim,
  useDeleteBosTaDaClaim,
} from '@/hooks/bos/use-bos-ta-da';
import { useBosMeetings } from '@/hooks/bos/use-bos-meetings';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { usePermissions } from '@/hooks/use-permissions';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import {
  generateBosClaimPDF,
  amountToWords,
  type BosClaimPDFData,
} from '@/lib/utils/internal-marks/internal-marks-pdf';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseExtraNotes(notes?: string | null): Record<string, unknown> {
  try { return JSON.parse(notes ?? '{}') } catch { return {} }
}

async function toBase64(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { return undefined; }
}

// ── Status label & color ──────────────────────────────────────────────────────

const CLAIM_STATUS_LABELS: Record<BosClaimStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  paid: 'Paid',
};

const CLAIM_STATUS_VARIANTS: Record<
  BosClaimStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'outline',
  submitted: 'secondary',
  approved: 'default',
  paid: 'default',
};

// ── TA/DA Claim Form Dialog ───────────────────────────────────────────────────

interface TaDaFormDialogProps {
  open: boolean;
  onClose: () => void;
  institutionsId: string;
  claim?: BosTaDaClaim;
}

function TaDaFormDialog({ open, onClose, institutionsId, claim }: TaDaFormDialogProps) {
  const isEdit = !!claim;
  const createClaim = useCreateBosTaDaClaim();
  const updateClaim = useUpdateBosTaDaClaim();

  // Parse stored extra fields from notes JSON
  const extra = useMemo(() => parseExtraNotes(claim?.notes), [claim?.notes]);

  // Form state
  const [meetingId, setMeetingId] = useState(claim?.meeting_id ?? '');
  const [memberId, setMemberId] = useState(claim?.member_id ?? '');
  const [expertId, setExpertId] = useState(claim?.expert_id ?? '');
  const [travelMode, setTravelMode] = useState(claim?.travel_mode ?? '');
  const [travelFrom, setTravelFrom] = useState(claim?.travel_from ?? '');
  const [travelTo, setTravelTo] = useState(claim?.travel_to ?? '');
  const [travelAmount, setTravelAmount] = useState(String(claim?.travel_amount ?? 0));
  const [daDays, setDaDays] = useState(String(claim?.da_days ?? 1));
  const [daRate, setDaRate] = useState(String(claim?.da_rate ?? 0));
  const [otherAmount, setOtherAmount] = useState(String(claim?.other_amount ?? 0));
  const [otherDescription, setOtherDescription] = useState(claim?.other_description ?? '');
  const [remuneration, setRemuneration] = useState(String(extra.remuneration ?? 0));
  const [bankName, setBankName] = useState(String(extra.bank_name ?? ''));
  const [branchName, setBranchName] = useState(String(extra.branch_name ?? ''));
  const [accountNumber, setAccountNumber] = useState(String(extra.account_number ?? ''));
  const [ifscCode, setIfscCode] = useState(String(extra.ifsc_code ?? ''));
  const [panNumber, setPanNumber] = useState(String(extra.pan_number ?? ''));
  const [claimStatus, setClaimStatus] = useState<BosClaimStatus>(claim?.claim_status ?? 'draft');
  const [billNumber, setBillNumber] = useState(claim?.bill_number ?? '');

  // Meetings dropdown
  const { data: meetingsData } = useBosMeetings({ limit: 100, sortOrder: 'desc' });
  const meetings = meetingsData?.data ?? [];

  // Attendees cascade — only fires when a meeting is selected
  const { data: attendeesRaw = [], isLoading: attendeesLoading } = useQuery<BosMeetingAttendee[]>({
    queryKey: ['bos-ta-da-attendees', meetingId],
    queryFn: async () => {
      const res = await fetch(`/api/bos/meetings/${meetingId}/attendance`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!meetingId,
    staleTime: 60_000,
  });

  // Show all meeting attendees (external experts get TA+DA; internal members get DA only)
  const allAttendees = attendeesRaw;

  const INTERNAL_MEMBER_TYPES = new Set([
    'chairman', 'internal_member', 'hod', 'facilitator', 'principal',
  ]);

  const selectedAttendee = allAttendees.find((a) => a.member_id === memberId);
  const selectedMemberType = (selectedAttendee?.member as any)?.member_type as string | undefined;
  const isInternalMember = !!memberId && INTERNAL_MEMBER_TYPES.has(selectedMemberType ?? '');

  // Derived totals
  const daAmount = parseFloat(daDays || '0') * parseFloat(daRate || '0');
  const taAmount = parseFloat(travelAmount || '0') + daAmount + parseFloat(otherAmount || '0');
  const total = parseFloat(remuneration || '0') + taAmount;

  const isPending = createClaim.isPending || updateClaim.isPending;

  const handleMeetingChange = (id: string) => {
    setMeetingId(id);
    setMemberId('');
    setExpertId('');
  };

  const handleAttendeeChange = (attendeeMemberId: string) => {
    const attendee = allAttendees.find((a) => a.member_id === attendeeMemberId);
    if (attendee) {
      setMemberId(attendee.member_id);
      setExpertId((attendee.member as any)?.expert_id ?? '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingId || !memberId) {
      toast.error('Meeting and member are required');
      return;
    }
    try {
      const notesPayload = JSON.stringify({
        remuneration: parseFloat(remuneration) || 0,
        bank_name: bankName || null,
        branch_name: branchName || null,
        account_number: accountNumber || null,
        ifsc_code: ifscCode || null,
        pan_number: panNumber || null,
      });
      const payload = {
        institutions_id: institutionsId,
        meeting_id: meetingId,
        member_id: memberId,
        expert_id: expertId || undefined,
        travel_mode: travelMode || undefined,
        travel_from: travelFrom || undefined,
        travel_to: travelTo || undefined,
        travel_amount: parseFloat(travelAmount) || 0,
        da_days: parseFloat(daDays) || 1,
        da_rate: parseFloat(daRate) || 0,
        da_amount: daAmount,
        other_amount: parseFloat(otherAmount) || 0,
        other_description: otherDescription || undefined,
        claim_status: claimStatus,
        bill_number: billNumber || undefined,
        notes: notesPayload,
      };
      if (isEdit) {
        await updateClaim.mutateAsync({ id: claim.id, data: payload });
        toast.success('TA/DA claim updated');
      } else {
        await createClaim.mutateAsync(payload);
        toast.success('TA/DA claim created');
      }
      onClose();
    } catch (err) {
      logger.error('academic/bos', 'Failed to save TA/DA claim', err);
      toast.error((err as Error).message || 'Failed to save claim');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit TA/DA Claim' : 'New TA/DA Claim'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4 max-h-[72vh] overflow-y-auto pr-1'>

          {/* ── Meeting dropdown ── */}
          <div className='space-y-2'>
            <Label>Meeting <span className='text-destructive'>*</span></Label>
            <Select value={meetingId} onValueChange={handleMeetingChange}>
              <SelectTrigger>
                <SelectValue placeholder='Select a meeting…' />
              </SelectTrigger>
              <SelectContent>
                {meetings.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.meeting_title ?? `Meeting #${m.meeting_number}`}
                    {m.scheduled_date && ` — ${format(new Date(m.scheduled_date), 'dd MMM yyyy')}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Member dropdown (cascaded from meeting — all attendees) ── */}
          <div className='space-y-2'>
            <Label>Member <span className='text-destructive'>*</span></Label>
            {attendeesLoading ? (
              <Skeleton className='h-9 w-full' />
            ) : (
              <Select
                value={memberId}
                onValueChange={handleAttendeeChange}
                disabled={!meetingId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={meetingId ? 'Select a member…' : 'Select a meeting first'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {allAttendees.length === 0 ? (
                    <div className='px-3 py-2 text-xs text-muted-foreground'>
                      No attendees recorded for this meeting
                    </div>
                  ) : (
                    allAttendees.map((a) => (
                      <SelectItem key={a.member_id} value={a.member_id}>
                        {(a.member as any)?.display_name ?? a.member_id}
                        {(a.member as any)?.display_designation
                          ? ` — ${(a.member as any).display_designation}`
                          : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          <Separator />

          {/* ── Travel details — external experts only ── */}
          {!isInternalMember && (
            <>
              <div className='grid grid-cols-3 gap-3'>
                <div className='space-y-2'>
                  <Label>Travel Mode</Label>
                  <Input placeholder='Bus / Train / Air' value={travelMode} onChange={(e) => setTravelMode(e.target.value)} />
                </div>
                <div className='space-y-2'>
                  <Label>From</Label>
                  <Input value={travelFrom} onChange={(e) => setTravelFrom(e.target.value)} />
                </div>
                <div className='space-y-2'>
                  <Label>To</Label>
                  <Input value={travelTo} onChange={(e) => setTravelTo(e.target.value)} />
                </div>
              </div>

              <div className='grid grid-cols-3 gap-3'>
                <div className='space-y-2'>
                  <Label>Travel ₹</Label>
                  <Input type='number' min={0} value={travelAmount} onChange={(e) => setTravelAmount(e.target.value)} />
                </div>
                <div className='space-y-2'>
                  <Label>DA Days</Label>
                  <Input type='number' min={0} step={0.5} value={daDays} onChange={(e) => setDaDays(e.target.value)} />
                </div>
                <div className='space-y-2'>
                  <Label>DA Rate ₹/day</Label>
                  <Input type='number' min={0} value={daRate} onChange={(e) => setDaRate(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* ── DA only — internal members (chairman, HoD, etc.) ── */}
          {isInternalMember && (
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label>DA Days</Label>
                <Input type='number' min={0} step={0.5} value={daDays} onChange={(e) => setDaDays(e.target.value)} />
              </div>
              <div className='space-y-2'>
                <Label>DA Rate ₹/day</Label>
                <Input type='number' min={0} value={daRate} onChange={(e) => setDaRate(e.target.value)} />
              </div>
            </div>
          )}

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label>Other ₹</Label>
              <Input type='number' min={0} value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} />
            </div>
            <div className='space-y-2'>
              <Label>Other Description</Label>
              <Input value={otherDescription} onChange={(e) => setOtherDescription(e.target.value)} />
            </div>
          </div>

          {/* ── Remuneration ── */}
          <div className='space-y-2'>
            <Label>Remuneration ₹</Label>
            <Input
              type='number'
              min={0}
              value={remuneration}
              onChange={(e) => setRemuneration(e.target.value)}
              placeholder='0'
            />
          </div>

          {/* ── Amount summary ── */}
          <div className='rounded-md bg-muted/50 px-3 py-2.5 text-sm space-y-1'>
            <div className='flex justify-between text-xs text-muted-foreground'>
              <span>Remuneration</span>
              <span>₹ {(parseFloat(remuneration) || 0).toFixed(2)}</span>
            </div>
            <div className='flex justify-between text-xs text-muted-foreground'>
              <span>TA (Travel + DA + Other)</span>
              <span>₹ {taAmount.toFixed(2)}</span>
            </div>
            <div className='flex justify-between text-sm font-semibold border-t pt-1 mt-1'>
              <span>Total</span>
              <span>₹ {total.toFixed(2)}</span>
            </div>
            <p className='text-xs text-muted-foreground italic pt-0.5'>
              {amountToWords(total)}
            </p>
          </div>

          <Separator />

          {/* ── NEFT details ── */}
          <div className='space-y-3'>
            <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide'>
              NEFT Details (for bank transfer)
            </p>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label>Bank Name</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className='space-y-2'>
                <Label>Branch Name</Label>
                <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} />
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label>Account Number</Label>
                <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
              </div>
              <div className='space-y-2'>
                <Label>IFSC Code</Label>
                <Input
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  className='uppercase'
                  placeholder='SBIN0001234'
                />
              </div>
            </div>
            <div className='space-y-2'>
              <Label>PAN Number</Label>
              <Input
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                className='uppercase'
                placeholder='ABCDE1234F'
              />
            </div>
          </div>

          <Separator />

          {/* ── Status & bill ── */}
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label>Status</Label>
              <Select value={claimStatus} onValueChange={(v) => setClaimStatus(v as BosClaimStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CLAIM_STATUS_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label>Bill Number</Label>
              <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type='submit' disabled={isPending || !meetingId || !memberId}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Claim'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Claim Row ─────────────────────────────────────────────────────────────────

function ClaimRow({
  claim,
  canEdit,
  institutionsId,
  meetingTitle,
}: {
  claim: BosTaDaClaim;
  canEdit: boolean;
  institutionsId: string;
  meetingTitle?: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const deleteClaim = useDeleteBosTaDaClaim();
  const { data: institutionCtx } = useInstitutionContext();

  const handleDelete = async () => {
    if (!confirm('Delete this TA/DA claim?')) return;
    try {
      await deleteClaim.mutateAsync({ id: claim.id, meetingId: claim.meeting_id });
      toast.success('Claim deleted');
    } catch {
      toast.error('Failed to delete claim');
    }
  };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const header = getInstitutionHeader(institutionCtx?.name);
      const [logoImage, rightLogoImage] = await Promise.all([
        toBase64('/logo.png'),
        toBase64(header.rightLogoImage),
      ]);

      const extra = parseExtraNotes(claim.notes);
      const remuneration = Number(extra.remuneration ?? 0);
      const taAmount =
        (claim.travel_amount ?? 0) + (claim.da_amount ?? 0) + (claim.other_amount ?? 0);
      const total = remuneration + taAmount;

      const expert = claim.expert as any;
      const member = claim.member as any;

      const pdfData: BosClaimPDFData = {
        institution_name: header.institution_name,
        institution_address: header.institution_address,
        institution_accreditation: header.institution_accreditation,
        logoImage,
        rightLogoImage,
        bos_subject: meetingTitle ?? '',
        claim_date: format(new Date(claim.created_at), 'dd/MM/yyyy'),
        member_name: expert?.name ?? member?.display_name ?? '—',
        designation: expert?.designation ?? member?.display_designation,
        college_address: expert?.institution_name ?? member?.display_institution,
        position_in_bos: member?.member_type
          ? member.member_type.replace(/_/g, ' ')
          : undefined,
        mobile: expert?.contact_no ?? member?.contact_no ?? (member?.staff as any)?.phone,
        email: expert?.email ?? member?.email,
        remuneration,
        ta_amount: taAmount,
        total,
        bank_name: String(extra.bank_name ?? ''),
        branch_name: String(extra.branch_name ?? ''),
        account_number: String(extra.account_number ?? ''),
        ifsc_code: String(extra.ifsc_code ?? ''),
        pan_number: String(extra.pan_number ?? ''),
        neft_amount: total,
      };

      generateBosClaimPDF(pdfData);
      toast.success('Claim form PDF downloaded');
    } catch (err) {
      toast.error('Failed to generate PDF');
      logger.error('academic/bos', 'Failed to generate BOS claim PDF', err);
    } finally {
      setPdfLoading(false);
    }
  };

  const expertName = (claim.expert as any)?.name ?? '—';
  const memberName = (claim.member as any)?.display_name ?? '—';
  const extra = parseExtraNotes(claim.notes);
  const remuneration = Number(extra.remuneration ?? 0);
  const displayTotal = remuneration + (claim.total_amount ?? 0);

  return (
    <>
      <div className='flex items-center gap-3 rounded-lg border p-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <p className='text-sm font-medium'>{expertName}</p>
            <span className='text-xs text-muted-foreground'>({memberName})</span>
            <Badge variant={CLAIM_STATUS_VARIANTS[claim.claim_status]} className='text-xs'>
              {CLAIM_STATUS_LABELS[claim.claim_status]}
            </Badge>
          </div>
          <div className='flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap'>
            {claim.travel_mode && (
              <span>{claim.travel_mode}: {claim.travel_from} → {claim.travel_to}</span>
            )}
            <span className='flex items-center gap-0.5'>
              <IndianRupee className='h-3 w-3' />
              {displayTotal.toFixed(2)}
            </span>
            {claim.bill_number && <span>Bill: {claim.bill_number}</span>}
          </div>
        </div>
        <div className='flex items-center gap-1 shrink-0'>
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7'
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
            title='Download claim form PDF'
          >
            <Download className='h-3.5 w-3.5' />
          </Button>
          {canEdit && (
            <>
              <Button
                variant='ghost' size='icon' className='h-7 w-7'
                onClick={() => setEditOpen(true)}
              >
                <Pencil className='h-3.5 w-3.5' />
              </Button>
              <Button
                variant='ghost' size='icon' className='h-7 w-7 hover:text-destructive'
                onClick={handleDelete} disabled={deleteClaim.isPending}
              >
                <Trash2 className='h-3.5 w-3.5' />
              </Button>
            </>
          )}
        </div>
      </div>
      {editOpen && (
        <TaDaFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          institutionsId={institutionsId}
          claim={claim}
        />
      )}
    </>
  );
}

// ── TA/DA Page ────────────────────────────────────────────────────────────────

export default function TaDaPage() {
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEdit = isSuperAdmin || canAccess('bos.ta_da', 'create');
  const [addOpen, setAddOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<BosClaimStatus | 'all'>('all');

  const { data: claims = [], isLoading } = useBosTaDaClaims({
    institutionsId: profile?.institution_id,
    claimStatus: filterStatus === 'all' ? undefined : filterStatus,
  });

  // Meetings map — used to resolve meeting titles for the PDF subject line
  const { data: meetingsData } = useBosMeetings({ limit: 100, sortOrder: 'desc' });
  const meetingsMap = useMemo(
    () => Object.fromEntries((meetingsData?.data ?? []).map((m) => [m.id, m])),
    [meetingsData],
  );

  const institutionsId = profile?.institution_id ?? '';

  const totalPending = claims
    .filter((c) => c.claim_status === 'submitted' || c.claim_status === 'approved')
    .reduce((sum, c) => sum + (c.total_amount ?? 0), 0);

  return (
    <div className='space-y-6'>
      <PageHeader
        title='TA/DA Claims'
        description='Travel allowance and daily allowance reimbursements for external experts.'
      >
        {canEdit && (
          <Button size='sm' onClick={() => setAddOpen(true)}>
            <Plus className='mr-2 h-4 w-4' />New Claim
          </Button>
        )}
      </PageHeader>

      {/* Summary cards */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        {(['all', 'draft', 'submitted', 'approved'] as const).map((s) => {
          const count = s === 'all' ? claims.length : claims.filter((c) => c.claim_status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded-lg border p-3 text-left transition-colors ${filterStatus === s ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
            >
              <p className='text-xs text-muted-foreground capitalize'>
                {s === 'all' ? 'All Claims' : CLAIM_STATUS_LABELS[s as BosClaimStatus]}
              </p>
              <p className='text-2xl font-bold mt-1'>{count}</p>
            </button>
          );
        })}
      </div>

      {totalPending > 0 && (
        <Card>
          <CardContent className='p-4 flex items-center gap-2 text-sm'>
            <IndianRupee className='h-4 w-4 text-amber-600' />
            <span className='text-muted-foreground'>Pending disbursement:</span>
            <strong className='text-amber-700'>₹{totalPending.toFixed(2)}</strong>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>
            Claims
            <span className='ml-2 text-sm font-normal text-muted-foreground'>
              ({claims.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='space-y-2'>
              {[1, 2, 3].map((i) => <Skeleton key={i} className='h-16 w-full' />)}
            </div>
          ) : claims.length === 0 ? (
            <div className='text-center py-8 text-sm text-muted-foreground'>
              No TA/DA claims found.
              {canEdit && (
                <Button variant='link' size='sm' className='mt-1 block mx-auto' onClick={() => setAddOpen(true)}>
                  Add the first claim →
                </Button>
              )}
            </div>
          ) : (
            <div className='space-y-2'>
              {claims.map((claim) => (
                <ClaimRow
                  key={claim.id}
                  claim={claim}
                  canEdit={canEdit}
                  institutionsId={institutionsId}
                  meetingTitle={meetingsMap[claim.meeting_id]?.meeting_title}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <TaDaFormDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          institutionsId={institutionsId}
        />
      )}
    </div>
  );
}
