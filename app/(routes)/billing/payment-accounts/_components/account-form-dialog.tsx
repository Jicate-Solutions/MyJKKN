'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useUpsertRazorpayAccount } from '@/hooks/billing/use-razorpay-accounts';

interface InstitutionOption {
  id: string;
  name: string;
}

// Routing slot for an account. '__default__' = the institution's general account
// (fee_head NULL). Other values are billing_categories.kind values; 'establishment'
// is included ahead of the enum for the HDFC estab-fee MIDs.
const DEFAULT_HEAD = '__default__';
const FEE_HEAD_OPTIONS: { value: string; label: string }[] = [
  { value: DEFAULT_HEAD, label: 'Default — all other fees' },
  { value: 'transport', label: 'Transport / Bus Fee' },
  { value: 'university_fee', label: 'University Fee' },
  { value: 'establishment', label: 'Establishment Fee' },
  { value: 'hostel', label: 'Hostel Fee' },
  { value: 'mess', label: 'Mess Fee' },
  { value: 'tuition', label: 'Tuition Fee' },
  { value: 'exam', label: 'Exam Fee' },
  { value: 'application_fee', label: 'Application Fee' },
  { value: 'library', label: 'Library Fee' },
  { value: 'other', label: 'Other' },
];
export function feeHeadLabel(feeHead: string | null): string {
  if (!feeHead) return 'Default';
  return FEE_HEAD_OPTIONS.find((o) => o.value === feeHead)?.label ?? feeHead;
}

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutions: InstitutionOption[];
  /** When set, the form is in "rotate" mode for this (institution, fee-head) slot (locked pickers). */
  rotateFor?: { institutionId: string; label: string | null; feeHead: string | null } | null;
}

export function AccountFormDialog({ open, onOpenChange, institutions, rotateFor }: AccountFormDialogProps) {
  const upsert = useUpsertRazorpayAccount();

  const [institutionId, setInstitutionId] = useState('');
  const [feeHead, setFeeHead] = useState<string>(DEFAULT_HEAD);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'test' | 'live'>('live');
  const [mid, setMid] = useState('');
  const [tid, setTid] = useState('');
  const [dbaName, setDbaName] = useState('');

  const effectiveInstitutionId = rotateFor?.institutionId ?? institutionId;
  const effectiveHead = rotateFor ? (rotateFor.feeHead ?? DEFAULT_HEAD) : feeHead;

  function reset() {
    setInstitutionId('');
    setFeeHead(DEFAULT_HEAD);
    setKeyId('');
    setKeySecret('');
    setWebhookSecret('');
    setLabel('');
    setMode('live');
    setMid('');
    setTid('');
    setDbaName('');
  }

  async function handleSubmit() {
    if (upsert.isPending) return; // guard the mutateAsync↔commit race (double-submit)
    if (!effectiveInstitutionId || !keyId.trim() || !keySecret.trim() || !webhookSecret.trim()) {
      toast.error('Institution, Key ID, Key Secret and Webhook Secret are all required.');
      return;
    }
    try {
      const result = await upsert.mutateAsync({
        institutionId: effectiveInstitutionId,
        keyId: keyId.trim(),
        keySecret: keySecret.trim(),
        webhookSecret: webhookSecret.trim(),
        label: label.trim() || undefined,
        mode,
        feeHead: effectiveHead === DEFAULT_HEAD ? null : effectiveHead,
        mid: mid.trim() || null,
        tid: tid.trim() || null,
        dbaName: dbaName.trim() || null,
      });
      const url = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/api/webhooks/razorpay/${result.webhookRef}`;
      toast.success('Account saved. Configure this webhook URL in the Razorpay dashboard:', {
        description: url,
        duration: 12000,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save account');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{rotateFor ? 'Rotate Razorpay account' : 'Add Razorpay account'}</DialogTitle>
          <DialogDescription>
            {rotateFor
              ? `Replace the active keys for ${rotateFor.label || 'this institution'}. The previous account is kept (deactivated) so in-flight payments still verify.`
              : 'Credentials are encrypted at rest. The Key Secret and Webhook Secret are never shown again after saving.'}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label htmlFor='institution'>Institution</Label>
            {rotateFor ? (
              <Input value={rotateFor.label || rotateFor.institutionId} disabled />
            ) : (
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger id='institution'>
                  <SelectValue placeholder='Select institution' />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='feeHead'>Fee head</Label>
            {rotateFor ? (
              <Input value={feeHeadLabel(rotateFor.feeHead ?? null)} disabled />
            ) : (
              <Select value={feeHead} onValueChange={setFeeHead}>
                <SelectTrigger id='feeHead'><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FEE_HEAD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className='text-muted-foreground text-xs'>
              Which fee this MID settles. &quot;Default&quot; catches every fee without its own account.
              Bills route by their category to the matching head, else this institution&apos;s Default.
            </p>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='label'>Label (optional)</Label>
            <Input id='label' value={label} onChange={(e) => setLabel(e.target.value)} placeholder='e.g. JKKN Arts & Science' />
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='keyId'>Key ID</Label>
              <Input id='keyId' value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder='rzp_live_…' autoComplete='off' />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='mode'>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'test' | 'live')}>
                <SelectTrigger id='mode'><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='live'>Live</SelectItem>
                  <SelectItem value='test'>Test</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='keySecret'>Key Secret</Label>
            <Input id='keySecret' type='password' value={keySecret} onChange={(e) => setKeySecret(e.target.value)} autoComplete='new-password' />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='webhookSecret'>Webhook Secret</Label>
            <Input id='webhookSecret' type='password' value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} autoComplete='new-password' />
            <p className='text-muted-foreground text-xs'>
              Use the same string you set on this account&apos;s webhook in the Razorpay dashboard.
            </p>
          </div>

          <div className='space-y-1.5'>
            <Label>HDFC reconciliation (optional)</Label>
            <div className='grid grid-cols-2 gap-3'>
              <Input value={mid} onChange={(e) => setMid(e.target.value)} placeholder='MID' autoComplete='off' />
              <Input value={tid} onChange={(e) => setTid(e.target.value)} placeholder='TID' autoComplete='off' />
            </div>
            <Input value={dbaName} onChange={(e) => setDbaName(e.target.value)} placeholder='DBA name (as in the HDFC live kit)' autoComplete='off' />
            <p className='text-muted-foreground text-xs'>
              Reference only — for matching this account to the HDFC dashboard. Routing uses the Key ID.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={upsert.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={upsert.isPending}>
            {upsert.isPending ? 'Saving…' : rotateFor ? 'Rotate keys' : 'Save account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
