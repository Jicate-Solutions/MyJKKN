'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, IndianRupee } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { BosTaDaClaim, BosClaimStatus } from '@/types/bos';
import {
  useBosTaDaClaims,
  useCreateBosTaDaClaim,
  useUpdateBosTaDaClaim,
  useDeleteBosTaDaClaim,
} from '@/hooks/bos/use-bos-ta-da';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';

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
  const [claimStatus, setClaimStatus] = useState<BosClaimStatus>(claim?.claim_status ?? 'draft');
  const [billNumber, setBillNumber] = useState(claim?.bill_number ?? '');

  const daAmount = parseFloat(daDays || '0') * parseFloat(daRate || '0');
  const total = parseFloat(travelAmount || '0') + daAmount + parseFloat(otherAmount || '0');

  const isPending = createClaim.isPending || updateClaim.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        institutions_id: institutionsId,
        meeting_id: meetingId,
        member_id: memberId,
        expert_id: expertId,
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
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit TA/DA Claim' : 'New TA/DA Claim'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4 max-h-[60vh] overflow-y-auto pr-1'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label>Meeting ID <span className='text-destructive'>*</span></Label>
              <Input placeholder='Meeting UUID' value={meetingId} onChange={(e) => setMeetingId(e.target.value)} />
            </div>
            <div className='space-y-2'>
              <Label>Expert ID <span className='text-destructive'>*</span></Label>
              <Input placeholder='Expert UUID' value={expertId} onChange={(e) => setExpertId(e.target.value)} />
            </div>
          </div>

          <div className='space-y-2'>
            <Label>Member ID <span className='text-destructive'>*</span></Label>
            <Input placeholder='Member UUID' value={memberId} onChange={(e) => setMemberId(e.target.value)} />
          </div>

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

          <div className='rounded-md bg-muted/50 px-3 py-2 text-sm'>
            <span className='text-muted-foreground'>Total: </span>
            <strong>₹{total.toFixed(2)}</strong>
            <span className='ml-2 text-xs text-muted-foreground'>
              (Travel {travelAmount} + DA {daAmount.toFixed(2)} + Other {otherAmount})
            </span>
          </div>

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
            <Button type='button' variant='outline' onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type='submit' disabled={isPending}>
              {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Claim'}
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
}: {
  claim: BosTaDaClaim;
  canEdit: boolean;
  institutionsId: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const deleteClaim = useDeleteBosTaDaClaim();

  const handleDelete = async () => {
    if (!confirm('Delete this TA/DA claim?')) return;
    try {
      await deleteClaim.mutateAsync({ id: claim.id, meetingId: claim.meeting_id });
      toast.success('Claim deleted');
    } catch (err) {
      toast.error('Failed to delete claim');
    }
  };

  const expertName = (claim.expert as any)?.name ?? '—';
  const memberName = (claim.member as any)?.display_name ?? '—';

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
            {claim.travel_mode && <span>{claim.travel_mode}: {claim.travel_from} → {claim.travel_to}</span>}
            <span className='flex items-center gap-0.5'>
              <IndianRupee className='h-3 w-3' />
              {claim.total_amount?.toFixed(2) ?? '0.00'}
            </span>
            {claim.bill_number && <span>Bill: {claim.bill_number}</span>}
          </div>
        </div>
        {canEdit && (
          <div className='flex items-center gap-1 shrink-0'>
            <Button
              variant='ghost' size='icon' className='h-7 w-7'
              onClick={() => setEditOpen(true)}
            ><Pencil className='h-3.5 w-3.5' /></Button>
            <Button
              variant='ghost' size='icon' className='h-7 w-7 hover:text-destructive'
              onClick={handleDelete} disabled={deleteClaim.isPending}
            ><Trash2 className='h-3.5 w-3.5' /></Button>
          </div>
        )}
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

      {/* Summary */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        {(['all', 'draft', 'submitted', 'approved', 'paid'] as const).slice(0, 4).map((s) => {
          const count = s === 'all' ? claims.length : claims.filter((c) => c.claim_status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded-lg border p-3 text-left transition-colors ${filterStatus === s ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
            >
              <p className='text-xs text-muted-foreground capitalize'>{s === 'all' ? 'All Claims' : CLAIM_STATUS_LABELS[s as BosClaimStatus]}</p>
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
