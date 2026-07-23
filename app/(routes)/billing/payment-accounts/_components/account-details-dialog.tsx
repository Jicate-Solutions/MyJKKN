'use client';

import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { feeHeadLabel } from './account-form-dialog';
import type { RazorpayAccountSummary } from '@/hooks/billing/use-razorpay-accounts';

const STATUS_LABEL: Record<RazorpayAccountSummary['status'], string> = {
  active: 'Active',
  draft: 'Draft — needs keys',
  inactive: 'Inactive',
};

interface AccountDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: RazorpayAccountSummary | null;
  institutionName: string;
}

function DetailRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className='flex items-start justify-between gap-4 border-b py-2 last:border-0'>
      <span className='text-muted-foreground shrink-0 text-sm'>{label}</span>
      <span className={`text-right text-sm ${mono ? 'break-all font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

export function AccountDetailsDialog({ open, onOpenChange, account, institutionName }: AccountDetailsDialogProps) {
  if (!account) return null;

  const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const webhookUrl = account.webhookRef ? `${base}/api/webhooks/razorpay/${account.webhookRef}` : null;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed — copy it manually');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[90dvh] flex-col w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] sm:max-w-lg'>
        <DialogHeader className='shrink-0'>
          <DialogTitle>{institutionName}</DialogTitle>
          <DialogDescription>Razorpay account details — no secrets are shown.</DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 overflow-y-auto px-1'>
          <DetailRow label='Status' value={<Badge variant={account.status === 'active' ? 'default' : account.status === 'draft' ? 'secondary' : 'outline'}>{STATUS_LABEL[account.status]}</Badge>} />
          <DetailRow label='Fee head' value={feeHeadLabel(account.feeHead)} />
          <DetailRow label='Label' value={account.accountLabel || '—'} />
          <DetailRow label='Mode' value={<Badge variant={account.mode === 'live' ? 'default' : 'secondary'}>{account.mode}</Badge>} />
          <DetailRow label='MID' value={account.mid || '—'} mono />
          <DetailRow label='TID' value={account.tid || '—'} mono />
          <DetailRow label='DBA name' value={account.dbaName || '—'} />
          <DetailRow label='Key ID' value={account.keyId || '— (draft, no keys yet)'} mono />
          <DetailRow
            label='Webhook URL'
            value={
              webhookUrl ? (
                <button
                  type='button'
                  className='inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline'
                  onClick={() => copy(webhookUrl)}
                >
                  <Copy className='h-3 w-3' /> Copy URL
                </button>
              ) : (
                '— (generated on activation)'
              )
            }
          />
          <DetailRow label='Created' value={account.createdAt ? new Date(account.createdAt).toLocaleString() : '—'} />
        </div>

        <DialogFooter className='shrink-0'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
