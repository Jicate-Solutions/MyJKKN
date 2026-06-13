'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, FilePlus2, Copy, RefreshCw, Power, PlugZap, KeyRound, Pencil, Trash2, Loader2 } from 'lucide-react';
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
  useRazorpayAccounts, useDeactivateRazorpayAccount, useTestRazorpayAccount, useDeleteRazorpayAccount,
  type RazorpayAccountSummary,
} from '@/hooks/billing/use-razorpay-accounts';
import { AccountFormDialog, feeHeadLabel, type AccountDialogTarget } from './account-form-dialog';

function webhookUrlFor(webhookRef: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/api/webhooks/razorpay/${webhookRef}`;
}

const STATUS_BADGE: Record<RazorpayAccountSummary['status'], { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  draft: { label: 'Draft — needs keys', variant: 'secondary' },
  inactive: { label: 'Inactive', variant: 'outline' },
};

export function PaymentAccountsManager() {
  const { can } = usePermissions();
  const canManage = can('billing.payment_accounts.manage');

  const { data: accounts, isLoading, error } = useRazorpayAccounts();
  const { institutions } = useInstitutionsWithAccess();
  const deactivate = useDeactivateRazorpayAccount();
  const test = useTestRazorpayAccount();
  const del = useDeleteRazorpayAccount();

  const [dialog, setDialog] = useState<AccountDialogTarget | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<RazorpayAccountSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RazorpayAccountSummary | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const instName = useMemo(() => {
    const map = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string) => map.get(id) ?? id;
  }, [institutions]);

  const counts = useMemo(() => {
    const c = { active: 0, draft: 0, inactive: 0 };
    for (const a of accounts ?? []) c[a.status]++;
    return c;
  }, [accounts]);

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

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      toast.success('Account deleted');
      setDeleteTarget(null);
    } catch (err) {
      // Server blocks deletion of accounts that have transactions — surface it.
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
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
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <p className='text-muted-foreground text-sm'>
          {counts.active} active · {counts.draft} draft · {counts.inactive} inactive.
          Drafts and unconfigured institutions use the common (env) account until activated.
        </p>
        {canManage && (
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => setDialog({ mode: 'draft' })}>
              <FilePlus2 className='mr-1.5 h-4 w-4' /> Add draft
            </Button>
            <Button onClick={() => setDialog({ mode: 'add' })}>
              <Plus className='mr-1.5 h-4 w-4' /> Add account
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Institution</TableHead>
                <TableHead>Fee head</TableHead>
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
                    <TableCell colSpan={8}><Skeleton className='h-6 w-full' /></TableCell>
                  </TableRow>
                ))
              ) : !accounts || accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className='py-8 text-center text-muted-foreground text-sm'>
                    No accounts yet. {canManage ? 'Add a draft to stage an institution’s MID, or add an account directly with keys.' : ''}
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((a) => {
                  const badge = STATUS_BADGE[a.status];
                  return (
                    <TableRow key={a.id} className={a.status === 'inactive' ? 'opacity-60' : ''}>
                      <TableCell className='font-medium'>{instName(a.institutionId)}</TableCell>
                      <TableCell>
                        <Badge variant={a.feeHead ? 'secondary' : 'outline'}>{feeHeadLabel(a.feeHead)}</Badge>
                      </TableCell>
                      <TableCell className='font-mono text-xs'>{a.mid || '—'}</TableCell>
                      <TableCell><Badge variant={a.mode === 'live' ? 'default' : 'secondary'}>{a.mode}</Badge></TableCell>
                      <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                      <TableCell className='font-mono text-xs'>{a.keyId || '—'}</TableCell>
                      <TableCell>
                        {a.webhookRef ? (
                          <Button variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs' onClick={() => copyWebhook(a.webhookRef!)}>
                            <Copy className='h-3.5 w-3.5' /> Copy URL
                          </Button>
                        ) : (
                          <span className='text-muted-foreground text-xs'>—</span>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='flex items-center justify-end gap-1'>
                          {canManage && a.status === 'draft' && (
                            <Button variant='default' size='sm' className='h-7 gap-1 px-2 text-xs'
                              onClick={() => setDialog({ mode: 'activate', account: a })}>
                              <KeyRound className='h-3.5 w-3.5' /> Activate
                            </Button>
                          )}
                          {a.status !== 'draft' && (
                            <Button variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs' disabled={testingId === a.id} onClick={() => runTest(a)}>
                              {testingId === a.id ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <PlugZap className='h-3.5 w-3.5' />} Test
                            </Button>
                          )}
                          {canManage && (
                            <Button variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs'
                              onClick={() => setDialog({ mode: 'edit', account: a })}>
                              <Pencil className='h-3.5 w-3.5' /> Edit
                            </Button>
                          )}
                          {canManage && a.status === 'active' && (
                            <>
                              <Button variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs'
                                onClick={() => setDialog({ mode: 'rotate', account: a })}>
                                <RefreshCw className='h-3.5 w-3.5' /> Rotate
                              </Button>
                              <Button variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs text-destructive' onClick={() => setDeactivateTarget(a)}>
                                <Power className='h-3.5 w-3.5' /> Deactivate
                              </Button>
                            </>
                          )}
                          {canManage && (
                            <Button variant='ghost' size='sm' className='h-7 gap-1 px-2 text-xs text-destructive' onClick={() => setDeleteTarget(a)}>
                              <Trash2 className='h-3.5 w-3.5' /> Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && (
        <AccountFormDialog
          open={!!dialog}
          onOpenChange={(o) => { if (!o) setDialog(null); }}
          institutions={institutions.map((i) => ({ id: i.id, name: i.name }))}
          target={dialog ?? { mode: 'add' }}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>Permanently remove the <strong>{feeHeadLabel(deleteTarget.feeHead)}</strong> account for{' '}
                <strong>{instName(deleteTarget.institutionId)}</strong>
                {deleteTarget.status === 'draft' ? ' (draft).' : '.'} This can&apos;t be undone. An account that
                already has payment transactions can&apos;t be deleted — deactivate it instead.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={del.isPending}>
              {del.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
