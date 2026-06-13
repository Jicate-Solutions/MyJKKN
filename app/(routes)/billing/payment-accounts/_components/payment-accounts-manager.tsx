'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Copy, RefreshCw, Power, PlugZap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  useRazorpayAccounts, useDeactivateRazorpayAccount, useTestRazorpayAccount,
  type RazorpayAccountSummary,
} from '@/hooks/billing/use-razorpay-accounts';
import { AccountFormDialog, feeHeadLabel } from './account-form-dialog';

function webhookUrlFor(webhookRef: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/api/webhooks/razorpay/${webhookRef}`;
}

export function PaymentAccountsManager() {
  const { can } = usePermissions();
  const canManage = can('billing.payment_accounts.manage');

  const { data: accounts, isLoading, error } = useRazorpayAccounts();
  const { institutions } = useInstitutionsWithAccess();
  const deactivate = useDeactivateRazorpayAccount();
  const test = useTestRazorpayAccount();

  const [addOpen, setAddOpen] = useState(false);
  const [rotateFor, setRotateFor] = useState<{ institutionId: string; label: string | null; feeHead: string | null } | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<RazorpayAccountSummary | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const instName = useMemo(() => {
    const map = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string) => map.get(id) ?? id;
  }, [institutions]);

  async function copyWebhook(webhookRef: string) {
    try {
      await navigator.clipboard.writeText(webhookUrlFor(webhookRef));
      toast.success('Webhook URL copied');
    } catch {
      toast.error('Could not copy — copy it manually');
    }
  }

  async function runTest(account: RazorpayAccountSummary) {
    setTestingId(account.id);
    try {
      const result = await test.mutateAsync({ institutionId: account.institutionId, feeHead: account.feeHead });
      if (result.success) {
        toast.success(`Connection OK — ${result.source === 'institution' ? 'institution account' : 'common (env) account'} · ${result.mode} mode`);
      } else {
        toast.error(`Test failed${result.status ? ` (HTTP ${result.status})` : ''}: ${result.message ?? result.error}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingId(null);
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    try {
      await deactivate.mutateAsync(deactivateTarget.id);
      toast.success('Account deactivated — this fee head falls back to the institution default / common account');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate');
    } finally {
      setDeactivateTarget(null);
    }
  }

  if (error) {
    return (
      <Card><CardContent className='py-8 text-center text-sm text-destructive'>
        Failed to load accounts: {error instanceof Error ? error.message : 'Unknown error'}
      </CardContent></Card>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-4'>
        <p className='text-muted-foreground text-sm'>
          {accounts?.length ?? 0} account{(accounts?.length ?? 0) === 1 ? '' : 's'} configured.
          Institutions without an active account use the common (env) account.
        </p>
        {canManage && (
          <Button onClick={() => { setRotateFor(null); setAddOpen(true); }}>
            <Plus className='mr-1.5 h-4 w-4' /> Add account
          </Button>
        )}
      </div>

      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Institution</TableHead>
                <TableHead>Fee head</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>MID</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Key ID</TableHead>
                <TableHead>Webhook URL</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}><Skeleton className='h-6 w-full' /></TableCell>
                  </TableRow>
                ))
              ) : !accounts || accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className='py-8 text-center text-muted-foreground text-sm'>
                    No institution accounts yet. {canManage ? 'Add one to route that institution to its own Razorpay account.' : ''}
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((a) => (
                  <TableRow key={a.id} className={a.isActive ? '' : 'opacity-60'}>
                    <TableCell className='font-medium'>{instName(a.institutionId)}</TableCell>
                    <TableCell>
                      <Badge variant={a.feeHead ? 'secondary' : 'outline'}>{feeHeadLabel(a.feeHead)}</Badge>
                    </TableCell>
                    <TableCell>{a.accountLabel || '—'}</TableCell>
                    <TableCell className='font-mono text-xs'>{a.mid || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={a.mode === 'live' ? 'default' : 'secondary'}>{a.mode}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.isActive ? 'default' : 'outline'}>{a.isActive ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    <TableCell className='font-mono text-xs'>{a.keyId}</TableCell>
                    <TableCell>
                      <Button variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs' onClick={() => copyWebhook(a.webhookRef)}>
                        <Copy className='h-3.5 w-3.5' /> Copy URL
                      </Button>
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-1'>
                        <Button variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs' disabled={testingId === a.id} onClick={() => runTest(a)}>
                          {testingId === a.id ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <PlugZap className='h-3.5 w-3.5' />} Test
                        </Button>
                        {canManage && a.isActive && (
                          <>
                            <Button variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs'
                              onClick={() => { setRotateFor({ institutionId: a.institutionId, label: a.accountLabel, feeHead: a.feeHead }); setAddOpen(true); }}>
                              <RefreshCw className='h-3.5 w-3.5' /> Rotate
                            </Button>
                            <Button variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs text-destructive' onClick={() => setDeactivateTarget(a)}>
                              <Power className='h-3.5 w-3.5' /> Deactivate
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && (
        <AccountFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          institutions={institutions.map((i) => ({ id: i.id, name: i.name }))}
          rotateFor={rotateFor}
        />
      )}

      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => { if (!o) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget && (
                <>New <strong>{feeHeadLabel(deactivateTarget.feeHead)}</strong> payments for{' '}
                <strong>{instName(deactivateTarget.institutionId)}</strong> will fall back to this institution&apos;s
                default account, then the common (env) account. Existing transactions remain verifiable (they pin
                their original account). You can add a new account anytime.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivate.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeactivate} disabled={deactivate.isPending}>
              {deactivate.isPending ? 'Deactivating…' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
