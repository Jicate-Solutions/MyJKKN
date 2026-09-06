'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, FilePlus2, Search, Filter, X, Copy, RefreshCw, Power, PlugZap, KeyRound, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
import { AccountDetailsDialog } from './account-details-dialog';

const ALL = '__all__';
const NULL_HEAD = '__default__';
// Filter bucket for GLOBAL accounts (institution_id NULL).
const GLOBAL = '__global__';
const GLOBAL_LABEL = 'All Institutions (Global)';

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
  const [detailsTarget, setDetailsTarget] = useState<RazorpayAccountSummary | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [fInstitution, setFInstitution] = useState(ALL);
  const [fFeeHead, setFFeeHead] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fMode, setFMode] = useState(ALL);

  const instName = useMemo(() => {
    const map = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string | null) => (id == null ? GLOBAL_LABEL : map.get(id) ?? id);
  }, [institutions]);

  const counts = useMemo(() => {
    const c = { active: 0, draft: 0, inactive: 0 };
    for (const a of accounts ?? []) c[a.status]++;
    return c;
  }, [accounts]);

  const institutionOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of accounts ?? []) {
      const key = a.institutionId ?? GLOBAL;
      if (!seen.has(key)) seen.set(key, instName(a.institutionId));
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [accounts, instName]);

  const feeHeadOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of accounts ?? []) set.add(a.feeHead ?? NULL_HEAD);
    return [...set].sort();
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (accounts ?? []).filter((a) => {
      if (fInstitution !== ALL && (a.institutionId ?? GLOBAL) !== fInstitution) return false;
      if (fFeeHead !== ALL && (a.feeHead ?? NULL_HEAD) !== fFeeHead) return false;
      if (fStatus !== ALL && a.status !== fStatus) return false;
      if (fMode !== ALL && a.mode !== fMode) return false;
      if (q) {
        const hay = [a.accountLabel, a.mid, a.tid, a.dbaName, a.keyId, instName(a.institutionId)]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accounts, search, fInstitution, fFeeHead, fStatus, fMode, instName]);

  const activeFilterCount =
    (fInstitution !== ALL ? 1 : 0) + (fFeeHead !== ALL ? 1 : 0) +
    (fStatus !== ALL ? 1 : 0) + (fMode !== ALL ? 1 : 0) + (search.trim() ? 1 : 0);

  function clearFilters() {
    setSearch(''); setFInstitution(ALL); setFFeeHead(ALL); setFStatus(ALL); setFMode(ALL);
  }

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
          {counts.active} active · {counts.draft} draft · {counts.inactive} inactive
          {activeFilterCount > 0 ? ` · showing ${filtered.length} of ${accounts?.length ?? 0}` : ''}.
          Drafts and unconfigured institutions use the common (env) account until activated.
        </p>
        <div className='flex flex-wrap gap-2'>
          <Button variant={showFilters || activeFilterCount ? 'secondary' : 'outline'} onClick={() => setShowFilters((s) => !s)}>
            <Filter className='mr-1.5 h-4 w-4' /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </Button>
          {canManage && (
            <>
              <Button variant='outline' onClick={() => setDialog({ mode: 'draft' })}>
                <FilePlus2 className='mr-1.5 h-4 w-4' /> Add draft
              </Button>
              <Button onClick={() => setDialog({ mode: 'add' })}>
                <Plus className='mr-1.5 h-4 w-4' /> Add account
              </Button>
            </>
          )}
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardContent className='flex flex-wrap items-end gap-3 p-4'>
            <div className='min-w-[200px] flex-1 space-y-1.5'>
              <label className='text-muted-foreground text-xs'>Search</label>
              <div className='relative'>
                <Search className='text-muted-foreground absolute left-2 top-2.5 h-4 w-4' />
                <Input className='pl-8' placeholder='Label, MID, TID, DBA, Key ID…' value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className='space-y-1.5'>
              <label className='text-muted-foreground text-xs'>Institution</label>
              <Select value={fInstitution} onValueChange={setFInstitution}>
                <SelectTrigger className='w-[200px]'><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All institutions</SelectItem>
                  {institutionOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <label className='text-muted-foreground text-xs'>Fee head</label>
              <Select value={fFeeHead} onValueChange={setFFeeHead}>
                <SelectTrigger className='w-[170px]'><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All fee heads</SelectItem>
                  {feeHeadOptions.map((h) => (<SelectItem key={h} value={h}>{feeHeadLabel(h === NULL_HEAD ? null : h)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <label className='text-muted-foreground text-xs'>Status</label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className='w-[140px]'><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value='active'>Active</SelectItem>
                  <SelectItem value='draft'>Draft</SelectItem>
                  <SelectItem value='inactive'>Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <label className='text-muted-foreground text-xs'>Mode</label>
              <Select value={fMode} onValueChange={setFMode}>
                <SelectTrigger className='w-[120px]'><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All modes</SelectItem>
                  <SelectItem value='live'>Live</SelectItem>
                  <SelectItem value='test'>Test</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {activeFilterCount > 0 && (
              <Button variant='ghost' onClick={clearFilters}><X className='mr-1.5 h-4 w-4' /> Clear</Button>
            )}
          </CardContent>
        </Card>
      )}

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
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className='py-8 text-center text-muted-foreground text-sm'>
                    No accounts match the filters.{' '}
                    <button type='button' className='text-primary underline underline-offset-2' onClick={clearFilters}>Clear filters</button>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => {
                  const badge = STATUS_BADGE[a.status];
                  return (
                    <TableRow key={a.id} className={a.status === 'inactive' ? 'opacity-60' : ''}>
                      <TableCell className='font-medium'>
                        <button
                          type='button'
                          className='text-left underline-offset-2 hover:text-primary hover:underline'
                          onClick={() => setDetailsTarget(a)}
                          title='View details'
                        >
                          {instName(a.institutionId)}
                        </button>
                      </TableCell>
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

      <AccountDetailsDialog
        open={!!detailsTarget}
        onOpenChange={(o) => { if (!o) setDetailsTarget(null); }}
        account={detailsTarget}
        institutionName={detailsTarget ? instName(detailsTarget.institutionId) : ''}
      />

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
