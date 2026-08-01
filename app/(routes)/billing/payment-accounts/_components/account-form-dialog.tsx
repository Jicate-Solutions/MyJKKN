'use client';

import { useEffect, useState } from 'react';
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
import {
  useUpsertRazorpayAccount, useCreateRazorpayDraft, useActivateRazorpayAccount, useUpdateRazorpayAccount,
  type RazorpayAccountSummary,
} from '@/hooks/billing/use-razorpay-accounts';
import { IMS_POS_FEE_HEAD } from '@/lib/services/payments/fee-heads';

interface InstitutionOption {
  id: string;
  name: string;
}

// Routing slot. '__default__' = the institution's general account (fee_head NULL).
const DEFAULT_HEAD = '__default__';
// Institution selector sentinel: a GLOBAL account (institution_id NULL) serves its fee
// head for every institution (e.g. one transport MID group-wide).
const GLOBAL = '__global__';
const FEE_HEAD_OPTIONS: { value: string; label: string }[] = [
  { value: DEFAULT_HEAD, label: 'Default — all other fees' },
  { value: 'transport', label: 'Transport / Bus Fee' },
  // Counter sales in the IMS point-of-sale — not a fee head, but the vault routes
  // on this column and store takings must resolve to their own account row. The
  // value comes from the payments layer so the slot the admin picks here and the
  // slot the POS service asks for cannot drift apart.
  { value: IMS_POS_FEE_HEAD, label: 'Store / Counter Sales' },
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

export type AccountDialogTarget =
  | { mode: 'add' }                                       // create a new ACTIVE account (with keys)
  | { mode: 'draft' }                                     // create a DRAFT (no keys)
  | { mode: 'edit'; account: RazorpayAccountSummary }     // edit metadata (no keys)
  | { mode: 'rotate'; account: RazorpayAccountSummary }   // new keys for an active slot (old row kept)
  | { mode: 'activate'; account: RazorpayAccountSummary }; // add keys to a draft (in place)

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutions: InstitutionOption[];
  target: AccountDialogTarget;
}

const TITLES: Record<AccountDialogTarget['mode'], string> = {
  add: 'Add Razorpay account',
  draft: 'Add draft account',
  edit: 'Edit account',
  rotate: 'Rotate Razorpay account',
  activate: 'Activate account — add keys',
};

export function AccountFormDialog({ open, onOpenChange, institutions, target }: AccountFormDialogProps) {
  const upsert = useUpsertRazorpayAccount();
  const createDraft = useCreateRazorpayDraft();
  const activate = useActivateRazorpayAccount();
  const updateMeta = useUpdateRazorpayAccount();

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

  // Seed fields when opening in edit mode; clear for create modes.
  useEffect(() => {
    if (!open) return;
    if (target.mode === 'edit') {
      const a = target.account;
      setInstitutionId(a.institutionId ?? GLOBAL);
      setFeeHead(a.feeHead ?? DEFAULT_HEAD);
      setLabel(a.accountLabel ?? '');
      setMode(a.mode);
      setMid(a.mid ?? '');
      setTid(a.tid ?? '');
      setDbaName(a.dbaName ?? '');
      setKeyId(''); setKeySecret(''); setWebhookSecret('');
    } else if (target.mode === 'add' || target.mode === 'draft') {
      reset();
    } else {
      // rotate / activate — only keys are collected
      setKeyId(''); setKeySecret(''); setWebhookSecret(''); setMode('live');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target]);

  const summaryAcct = target.mode === 'rotate' || target.mode === 'activate' ? target.account : null;
  const showMetaForm = target.mode === 'add' || target.mode === 'draft' || target.mode === 'edit';
  const slotDisabled = target.mode === 'edit' && target.account.status !== 'draft';
  const needsKeys = target.mode === 'add' || target.mode === 'rotate' || target.mode === 'activate';
  const pending = upsert.isPending || createDraft.isPending || activate.isPending || updateMeta.isPending;

  async function handleSubmit() {
    if (pending) return;
    if (showMetaForm && !institutionId) {
      toast.error('Select an institution (or “All Institutions (Global)”).');
      return;
    }
    // GLOBAL sentinel -> null institution. A global account must target a fee head.
    const instParam = institutionId === GLOBAL ? null : institutionId;
    const head = feeHead === DEFAULT_HEAD ? null : feeHead;
    if (showMetaForm && !slotDisabled && instParam === null && head === null) {
      toast.error('A global account must target a specific fee head (not “Default”).');
      return;
    }
    if (needsKeys && (!keyId.trim() || !keySecret.trim() || !webhookSecret.trim())) {
      toast.error('Key ID, Key Secret and Webhook Secret are all required.');
      return;
    }
    try {
      let webhookRef: string | null = null;

      if (target.mode === 'draft') {
        await createDraft.mutateAsync({
          institutionId: instParam,
          feeHead: head,
          label: label.trim() || undefined,
          mid: mid.trim() || null,
          tid: tid.trim() || null,
          dbaName: dbaName.trim() || null,
          mode,
        });
        toast.success('Draft saved. Add keys later to activate it.');
      } else if (target.mode === 'edit') {
        await updateMeta.mutateAsync({
          accountId: target.account.id,
          label: label.trim() || null,
          mid: mid.trim() || null,
          tid: tid.trim() || null,
          dbaName: dbaName.trim() || null,
          mode,
          institutionId: instParam,
          feeHead: head,
          changeSlot: target.account.status === 'draft',
        });
        toast.success('Account updated.');
      } else if (target.mode === 'activate') {
        const r = await activate.mutateAsync({
          accountId: target.account.id,
          keyId: keyId.trim(),
          keySecret: keySecret.trim(),
          webhookSecret: webhookSecret.trim(),
        });
        webhookRef = r.webhookRef;
      } else {
        // 'add' or 'rotate' — create a fresh active row (rotate keeps the old one).
        // For rotate, keep the existing row's slot (institution may be null = global).
        const r = await upsert.mutateAsync({
          institutionId: summaryAcct ? (summaryAcct.institutionId ?? null) : instParam,
          feeHead: summaryAcct ? (summaryAcct.feeHead ?? null) : head,
          keyId: keyId.trim(),
          keySecret: keySecret.trim(),
          webhookSecret: webhookSecret.trim(),
          label: (summaryAcct?.accountLabel ?? label.trim()) || undefined,
          mid: summaryAcct?.mid ?? (mid.trim() || null),
          tid: summaryAcct?.tid ?? (tid.trim() || null),
          dbaName: summaryAcct?.dbaName ?? (dbaName.trim() || null),
          mode,
        });
        webhookRef = r.webhookRef;
      }

      if (webhookRef) {
        const url = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/api/webhooks/razorpay/${webhookRef}`;
        toast.success('Account active. Configure this webhook URL in the Razorpay dashboard:', {
          description: url,
          duration: 12000,
        });
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save account');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className='flex max-h-[90dvh] flex-col w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] sm:max-w-lg'>
        <DialogHeader className='shrink-0'>
          <DialogTitle>{TITLES[target.mode]}</DialogTitle>
          <DialogDescription>
            {target.mode === 'draft'
              ? 'Stage the institution → MID mapping now. The account stays inert (the institution uses the common account) until you add keys to activate it.'
              : target.mode === 'edit'
                ? slotDisabled
                  ? 'Edit this account’s label and reconciliation details. Institution and fee head are locked for a live account (changing them would re-route money).'
                  : 'Edit this draft’s institution, fee head, label and reconciliation details.'
                : target.mode === 'activate'
                  ? 'Add this account’s keys to activate it. Credentials are encrypted at rest and never shown again.'
                  : target.mode === 'rotate'
                    ? 'Replace the active keys for this slot. The previous account is kept (deactivated) so in-flight payments still verify.'
                    : 'Credentials are encrypted at rest. The Key Secret and Webhook Secret are never shown again after saving.'}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-1'>
          {summaryAcct && (
            <div className='rounded-md border bg-muted/40 p-3 text-sm'>
              <div className='grid grid-cols-3 gap-2'>
                <div><span className='text-muted-foreground text-xs'>Fee head</span><div>{feeHeadLabel(summaryAcct.feeHead)}</div></div>
                <div><span className='text-muted-foreground text-xs'>Label</span><div>{summaryAcct.accountLabel || '—'}</div></div>
                <div><span className='text-muted-foreground text-xs'>MID</span><div className='font-mono text-xs'>{summaryAcct.mid || '—'}</div></div>
              </div>
            </div>
          )}

          {showMetaForm && (
            <>
              <div className='space-y-1.5'>
                <Label htmlFor='institution'>Institution</Label>
                <Select value={institutionId} onValueChange={setInstitutionId} disabled={slotDisabled}>
                  <SelectTrigger id='institution'><SelectValue placeholder='Select institution' /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLOBAL}>🌐 All Institutions (Global)</SelectItem>
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!slotDisabled && institutionId === GLOBAL && (
                  <p className='text-muted-foreground text-xs'>
                    This MID settles the selected fee head for <strong>every</strong> institution (e.g. one
                    transport account group-wide). Pick a specific fee head below.
                  </p>
                )}
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='feeHead'>Fee head</Label>
                <Select value={feeHead} onValueChange={setFeeHead} disabled={slotDisabled}>
                  <SelectTrigger id='feeHead'><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FEE_HEAD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!slotDisabled && (
                  <p className='text-muted-foreground text-xs'>
                    Which fee this MID settles. &quot;Default&quot; catches every fee without its own account.
                  </p>
                )}
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='label'>Label (optional)</Label>
                <Input id='label' value={label} onChange={(e) => setLabel(e.target.value)} placeholder='e.g. JKKN Dental — University Fee' />
              </div>

              <div className='space-y-1.5'>
                <Label>HDFC reconciliation (optional)</Label>
                <div className='grid grid-cols-2 gap-3'>
                  <Input value={mid} onChange={(e) => setMid(e.target.value)} placeholder='MID' autoComplete='off' />
                  <Input value={tid} onChange={(e) => setTid(e.target.value)} placeholder='TID' autoComplete='off' />
                </div>
                <Input value={dbaName} onChange={(e) => setDbaName(e.target.value)} placeholder='DBA name (as in the HDFC live kit)' autoComplete='off' />
              </div>

              {!needsKeys && (
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
              )}
            </>
          )}

          {needsKeys && (
            <>
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
            </>
          )}
        </div>

        <DialogFooter className='shrink-0'>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending
              ? 'Saving…'
              : target.mode === 'draft'
                ? 'Save draft'
                : target.mode === 'edit'
                  ? 'Save changes'
                  : target.mode === 'activate'
                    ? 'Activate'
                    : target.mode === 'rotate'
                      ? 'Rotate keys'
                      : 'Save account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
