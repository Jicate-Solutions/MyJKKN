'use client';

import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { Pencil, IndianRupee, Download } from 'lucide-react';
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
import { SearchableSelect } from '@/components/ui/searchable-select';

import { BosTaDaClaim, BosClaimStatus } from '@/types/bos';
import {
  useBosTaDaClaims,
  useUpdateBosTaDaClaim,
} from '@/hooks/bos/use-bos-ta-da';
import { useBosMeetings } from '@/hooks/bos/use-bos-meetings';
import { useBosBoards } from '@/hooks/bos/use-bos-boards';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { useBosInstitutionScope } from '@/hooks/bos/use-bos-institution-scope';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { usePermissions } from '@/hooks/use-permissions';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import {
  generateBosClaimPDF,
  amountToWords,
  type BosClaimPDFData,
} from '@/lib/utils/internal-marks/internal-marks-pdf';
import { logger } from '@/lib/utils/enhanced-logger';
import { InstitutionPicker } from '../_components/institution-picker';

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

// ── Edit Claim Dialog ─────────────────────────────────────────────────────────
//
// Slim post-create editor. Auto-generated claims have honorarium + travel
// already computed from the SOP rates; this dialog only lets staff capture
// payout metadata (NEFT details, status transitions, bill / payment refs).
// Amount columns are intentionally not editable here — overrides go through
// PUT /api/bos/ta-da/[id] directly if absolutely needed.

interface EditClaimDialogProps {
  open: boolean;
  onClose: () => void;
  claim: BosTaDaClaim;
}

function EditClaimDialog({ open, onClose, claim }: EditClaimDialogProps) {
  const updateClaim = useUpdateBosTaDaClaim();

  // NEFT/bank details are still stored as JSON in `notes` — pre-rollout
  // convention from before there were dedicated payout columns. Keeping the
  // JSON shape here to avoid a further schema change; if/when bank columns
  // are added, swap the parse/serialize for direct field reads.
  const extra = useMemo(() => parseExtraNotes(claim.notes), [claim.notes]);

  const [bankName, setBankName] = useState(String(extra.bank_name ?? ''));
  const [branchName, setBranchName] = useState(String(extra.branch_name ?? ''));
  const [accountNumber, setAccountNumber] = useState(String(extra.account_number ?? ''));
  const [ifscCode, setIfscCode] = useState(String(extra.ifsc_code ?? ''));
  const [panNumber, setPanNumber] = useState(String(extra.pan_number ?? ''));
  const [claimStatus, setClaimStatus] = useState<BosClaimStatus>(claim.claim_status);
  const [billNumber, setBillNumber] = useState(claim.bill_number ?? '');
  const [paymentDate, setPaymentDate] = useState(claim.payment_date ?? '');
  const [paymentReference, setPaymentReference] = useState(claim.payment_reference ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const notesPayload = JSON.stringify({
        bank_name: bankName || null,
        branch_name: branchName || null,
        account_number: accountNumber || null,
        ifsc_code: ifscCode || null,
        pan_number: panNumber || null,
      });
      await updateClaim.mutateAsync({
        id: claim.id,
        data: {
          claim_status: claimStatus,
          bill_number: billNumber || undefined,
          payment_date: paymentDate || undefined,
          payment_reference: paymentReference || undefined,
          notes: notesPayload,
        },
      });
      toast.success('Claim updated');
      onClose();
    } catch (err) {
      logger.error('academic/bos', 'Failed to update TA/DA claim', err);
      toast.error((err as Error).message || 'Failed to update claim');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>Edit TA/DA Claim</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4 max-h-[72vh] overflow-y-auto pr-1'>

          {/* ── Computed amounts (read-only) ── */}
          <div className='rounded-md bg-muted/50 px-3 py-2.5 text-sm space-y-1'>
            <div className='flex justify-between text-xs text-muted-foreground'>
              <span>Honorarium</span>
              <span>₹ {(claim.honorarium_amount ?? 0).toFixed(2)}</span>
            </div>
            <div className='flex justify-between text-xs text-muted-foreground'>
              <span>TA (round-trip)</span>
              <span>₹ {(claim.travel_amount ?? 0).toFixed(2)}</span>
            </div>
            {(claim.other_amount ?? 0) > 0 && (
              <div className='flex justify-between text-xs text-muted-foreground'>
                <span>Other</span>
                <span>₹ {(claim.other_amount ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div className='flex justify-between text-sm font-semibold border-t pt-1 mt-1'>
              <span>Total</span>
              <span>₹ {(claim.total_amount ?? 0).toFixed(2)}</span>
            </div>
            <p className='text-xs text-muted-foreground italic pt-0.5'>
              {amountToWords(claim.total_amount ?? 0)}
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

          {/* ── Payment / status ── */}
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
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label>Payment Date</Label>
              <Input
                type='date'
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label>Payment Reference</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder='UTR / NEFT ref'
              />
            </div>
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose} disabled={updateClaim.isPending}>
              Cancel
            </Button>
            <Button type='submit' disabled={updateClaim.isPending}>
              {updateClaim.isPending ? 'Saving…' : 'Save Changes'}
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
  boardLabel,
  meetingDate,
}: {
  claim: BosTaDaClaim;
  canEdit: boolean;
  boardLabel?: string;
  /**
   * ISO date string (YYYY-MM-DD) of when the meeting actually occurred,
   * preferring actual_date over scheduled_date. Falls back to the claim's
   * created_at if the meeting has neither — that's a degenerate case (the
   * meeting status flow normally guarantees actual_date by the time
   * attendance is taken).
   */
  meetingDate?: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { data: institutionCtx } = useInstitutionContext();

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const header = getInstitutionHeader(institutionCtx?.name);
      const [logoImage, rightLogoImage] = await Promise.all([
        toBase64('/logo.png'),
        toBase64(header.rightLogoImage),
      ]);

      const extra = parseExtraNotes(claim.notes);
      const honorarium = claim.honorarium_amount ?? 0;
      const taAmount = claim.travel_amount ?? 0;
      const total = claim.total_amount ?? honorarium + taAmount + (claim.other_amount ?? 0);

      const expert = claim.expert as
        | { title?: string; name: string; designation?: string; institution_name?: string; contact_no?: string; email?: string }
        | null
        | undefined;
      const member = claim.member as
        | {
            display_name?: string;
            display_designation?: string;
            display_institution?: string;
            member_type?: string;
            contact_no?: string;
            email?: string;
            staff?: { phone?: string };
          }
        | null
        | undefined;

      const pdfData: BosClaimPDFData = {
        institution_name: header.institution_name,
        institution_address: header.institution_address,
        institution_accreditation: header.institution_accreditation,
        logoImage,
        rightLogoImage,
        bos_subject: boardLabel ?? '',
        // Prefer the meeting's own date over the claim row's created_at.
        // claim.created_at is when the auto-generation ran (typically the day
        // attendance was taken — useful for audit, but not what the printed
        // claim form should display).
        claim_date: format(new Date(meetingDate ?? claim.created_at), 'dd/MM/yyyy'),
        member_name: expert
          ? `${expert.title ? `${expert.title} ` : ''}${expert.name}`
          : member?.display_name ?? '—',
        designation: expert?.designation ?? member?.display_designation,
        college_address: expert?.institution_name ?? member?.display_institution,
        position_in_bos: member?.member_type
          ? member.member_type.replace(/_/g, ' ')
          : undefined,
        mobile: expert?.contact_no ?? member?.contact_no ?? member?.staff?.phone,
        email: expert?.email ?? member?.email,
        honorarium,
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

  const expert = claim.expert as { title?: string; name?: string } | null | undefined;
  const expertName = expert?.name
    ? `${expert.title ? `${expert.title} ` : ''}${expert.name}`
    : null;
  const memberName = (claim.member as { display_name?: string } | null | undefined)?.display_name ?? '—';
  const displayName = expertName ?? memberName;

  return (
    <>
      <div className='flex items-center gap-3 rounded-lg border p-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <p className='text-sm font-medium'>{displayName}</p>
            {expertName && (
              <span className='text-xs text-muted-foreground'>({memberName})</span>
            )}
            <Badge variant={CLAIM_STATUS_VARIANTS[claim.claim_status]} className='text-xs'>
              {CLAIM_STATUS_LABELS[claim.claim_status]}
            </Badge>
          </div>
          <div className='flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap'>
            <span>Honorarium ₹{(claim.honorarium_amount ?? 0).toFixed(2)}</span>
            {(claim.travel_amount ?? 0) > 0 && (
              <span>TA ₹{(claim.travel_amount ?? 0).toFixed(2)}</span>
            )}
            <span className='flex items-center gap-0.5 font-medium text-foreground'>
              <IndianRupee className='h-3 w-3' />
              {(claim.total_amount ?? 0).toFixed(2)}
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
            <Button
              variant='ghost' size='icon' className='h-7 w-7'
              onClick={() => setEditOpen(true)}
              title='Edit payment details'
            >
              <Pencil className='h-3.5 w-3.5' />
            </Button>
          )}
        </div>
      </div>
      {editOpen && (
        <EditClaimDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          claim={claim}
        />
      )}
    </>
  );
}

// ── TA/DA Page ────────────────────────────────────────────────────────────────

export default function TaDaPage() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const boardScope = useBosBoardScope();

  // Membership-driven edit gate. Memory `BoS Membership Is Authorization` —
  // role-perm grants for `bos.ta_da.edit` drift out of sync with composition
  // membership; gate on memberOf instead. Server enforces via
  // guardCompositionWrite on the PUT.
  const isBoardMember = !boardScope.isLoading && boardScope.memberOf.size > 0;
  const canEdit = isSuperAdmin || boardScope.isPrincipal || isBoardMember;

  const [filterStatus, setFilterStatus] = useState<BosClaimStatus | 'all'>('all');

  // Institution → board → meeting → search filter chain. Mirrors /bos/courses
  // pattern but with an extra meeting hop for the TA/DA page since claims are
  // meeting-scoped (one claim per member per meeting).
  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const [boardId, setBoardId] = useState<string>('');
  const [meetingId, setMeetingId] = useState<string>('');
  const [search, setSearch] = useState('');

  // Auto-select for non-super-admin once profile resolves.
  useEffect(() => {
    if (isSuperAdmin) return;
    if (institutionId) return;
    if (!profile?.institution_id) return;
    setInstitutionId(profile.institution_id);
  }, [isSuperAdmin, profile?.institution_id, institutionId]);

  // Reset board + meeting filters when institution changes — board IDs are
  // institution-scoped so a stale boardId would produce an empty list, and
  // meeting cascades from board so it must reset too.
  useEffect(() => {
    setBoardId('');
    setMeetingId('');
  }, [institutionId]);

  // Reset meeting when board changes — meetings are board-scoped via their
  // parent composition, so a meetingId from a different board would silently
  // produce an empty claim list.
  useEffect(() => {
    setMeetingId('');
  }, [boardId]);

  const { data: boards = [], isLoading: boardsLoading } = useBosBoards(
    isSuperAdmin ? institutionId : undefined,
  );

  const instScope = useBosInstitutionScope(institutionId);
  const institutionsIds = useMemo(
    () => (instScope.ids.length > 0 ? instScope.ids : undefined),
    [instScope.ids],
  );

  const { data: claims = [], isLoading } = useBosTaDaClaims({
    institutionsIds,
    boardId: boardId || undefined,
    meetingId: meetingId || undefined,
    claimStatus: filterStatus === 'all' ? undefined : filterStatus,
    enabled: institutionId
      ? !instScope.isLoading && !!institutionsIds
      : isSuperAdmin,
  });

  const filteredClaims = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return claims;
    return claims.filter((c) => {
      const memberName = ((c.member as { display_name?: string } | null | undefined)?.display_name ?? '').toLowerCase();
      const e = c.expert as { title?: string; name?: string } | null | undefined;
      const expertName = e
        ? `${e.title ?? ''} ${e.name ?? ''}`.toLowerCase()
        : '';
      return memberName.includes(q) || expertName.includes(q);
    });
  }, [claims, search]);

  // Meetings map — used to resolve {board_type} - {board_name} for the PDF subject line
  const { data: meetingsData } = useBosMeetings({ limit: 100, sortOrder: 'desc' });
  const meetingsMap = useMemo(
    () => Object.fromEntries((meetingsData?.data ?? []).map((m) => [m.id, m])),
    [meetingsData],
  );

  // Meetings visible in the cascading dropdown — narrowed by the selected
  // board AND (when scoped) the selected institution. Filtering client-side
  // because useBosMeetings already pre-fetches the user's accessible
  // meetings; spinning up a new server query per board change would just
  // re-fetch the same dataset.
  const boardMeetings = useMemo(() => {
    const all = meetingsData?.data ?? [];
    return all.filter((m) => {
      if (boardId && m.board_id !== boardId) return false;
      if (institutionsIds && !institutionsIds.includes(m.institutions_id)) return false;
      return true;
    });
  }, [meetingsData, boardId, institutionsIds]);

  const totalPending = filteredClaims
    .filter((c) => c.claim_status === 'submitted' || c.claim_status === 'approved')
    .reduce((sum, c) => sum + (c.total_amount ?? 0), 0);

  return (
    <div className='space-y-6'>
      <PageHeader
        title='TA/DA Claims'
        description='Auto-generated when an attendee is marked present. Honorarium and TA are computed from the institution-wide BoS SOP — edit only payment details and status.'
      />

      {/* Filter row — institution → board → meeting → search.
          Meeting cascades from board: dropdown is disabled until a board is
          chosen, and resets when the board changes. Grid widens by one
          column for the extra control. */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${
          isSuperAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        }`}
      >
        {isSuperAdmin && (
          <InstitutionPicker
            value={institutionId}
            onChange={setInstitutionId}
            showAllOption
            hideLabel
            className='w-full'
          />
        )}
        <SearchableSelect
          value={boardId}
          onValueChange={setBoardId}
          options={[
            { value: '', label: 'All boards' },
            ...boards.map((b) => ({
              value: b.id,
              label: b.display_name
                ? `${b.board_code} — ${b.display_name}`
                : `${b.board_code} — ${b.board_name}`,
            })),
          ]}
          loading={boardsLoading}
          disabled={isSuperAdmin && !institutionId}
          placeholder='All boards'
          searchPlaceholder='Search board…'
          className='w-full'
        />
        <SearchableSelect
          value={meetingId}
          onValueChange={setMeetingId}
          options={[
            { value: '', label: 'All meetings' },
            ...boardMeetings.map((m) => {
              const dateStr = m.actual_date ?? m.scheduled_date;
              const formatted = dateStr ? format(new Date(dateStr), 'dd MMM yyyy') : null;
              const title = m.meeting_title ?? `Meeting ${m.meeting_number}`;
              const label = [title, m.academic_year, formatted].filter(Boolean).join(' · ');
              return { value: m.id, label };
            }),
          ]}
          disabled={!boardId}
          placeholder={boardId ? 'All meetings' : 'Select a board first'}
          searchPlaceholder='Search meeting…'
          className='w-full'
        />
        <Input
          placeholder='Search expert or member name…'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='w-full'
        />
      </div>

      {/* Summary cards */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        {(['all', 'draft', 'submitted', 'approved'] as const).map((s) => {
          const count =
            s === 'all'
              ? filteredClaims.length
              : filteredClaims.filter((c) => c.claim_status === s).length;
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
              ({filteredClaims.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='space-y-2'>
              {[1, 2, 3].map((i) => <Skeleton key={i} className='h-16 w-full' />)}
            </div>
          ) : filteredClaims.length === 0 ? (
            <div className='text-center py-8 text-sm text-muted-foreground'>
              No TA/DA claims found. Claims are generated automatically when an
              attendee is marked present on a meeting.
            </div>
          ) : (
            <div className='space-y-2'>
              {filteredClaims.map((claim) => {
                const m = meetingsMap[claim.meeting_id];
                const boardName = m?.board?.board_name?.trim();
                const boardType = m?.board_type?.trim();
                const boardLabel =
                  boardType && boardName
                    ? `${boardType} - ${boardName}`
                    : boardName ?? m?.meeting_title;
                // Prefer actual_date (when meeting was completed) over
                // scheduled_date (when it was planned). Both are ISO yyyy-mm-dd.
                const meetingDate = m?.actual_date ?? m?.scheduled_date;
                return (
                  <ClaimRow
                    key={claim.id}
                    claim={claim}
                    canEdit={canEdit}
                    boardLabel={boardLabel}
                    meetingDate={meetingDate}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
