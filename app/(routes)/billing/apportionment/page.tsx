'use client';

/**
 * Revenue Apportionment — accounts-only internal overlay.
 * Records how much of a BUNDLED tuition bill belongs to a revenue head
 * (Hostel/Transport/Mess Fee = existing billing_categories rows) WITHOUT
 * changing the student-facing bill. Dual-control: create → approve.
 */

import { useState } from 'react';
import Link from 'next/link';
import { PieChart, Plus, Send, Check, X, Settings2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  useRevenueHeads,
  useApportionmentWorkqueue,
  useApportionmentMutations,
} from '@/hooks/billing/use-apportionment';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

function ApportionmentInner() {
  const { canAccess } = usePermissions();
  const canCreate = canAccess('billing', 'apportionment.create');
  const canApprove = canAccess('billing', 'apportionment.approve');

  const { data: heads = [] } = useRevenueHeads();
  const { data: items = [], isLoading } = useApportionmentWorkqueue();
  const { createManual, submit, approve, reject } = useApportionmentMutations();

  const [billId, setBillId] = useState('');
  const [headId, setHeadId] = useState('');
  const [amount, setAmount] = useState('');

  const addDraft = () => {
    if (!billId || !headId || !amount) return;
    createManual.mutate({ bId: billId.trim(), categoryId: headId, amount: Number(amount) });
    setBillId('');
    setAmount('');
  };

  return (
    <ContentLayout title='Revenue Apportionment'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Apportionment', href: '/billing/apportionment' },
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1 flex items-center gap-2'>
              <PieChart className='h-6 w-6' /> Revenue Apportionment
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground max-w-2xl'>
              Internal split of a bundled bill into revenue heads. The student&apos;s bill is never
              changed — this is an accounts-only overlay. Every split needs a second person to approve.
            </p>
          </div>
          <Button variant='outline' asChild>
            <Link href='/billing/apportionment/rules'>
              <Settings2 className='mr-2 h-4 w-4' /> Default Rules
            </Link>
          </Button>
        </div>

        {/* Revenue heads (existing billing_categories) */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Revenue heads</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-wrap gap-2'>
            {heads.length === 0 && <span className='text-sm text-muted-foreground'>No heads found.</span>}
            {heads.map((h) => (
              <Badge key={h.id} variant='secondary' className='capitalize'>
                {h.category_name}
              </Badge>
            ))}
          </CardContent>
        </Card>

        {/* Add an apportionment (maker) */}
        {canCreate && (
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium flex items-center gap-2'>
                <Plus className='h-4 w-4' /> Apportion a bill
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 sm:grid-cols-4 gap-3'>
                <Input
                  placeholder='Bill ID (UUID)'
                  value={billId}
                  onChange={(e) => setBillId(e.target.value)}
                  className='sm:col-span-2'
                />
                <select
                  value={headId}
                  onChange={(e) => setHeadId(e.target.value)}
                  className='h-10 rounded-md border border-input bg-background px-3 text-sm'
                >
                  <option value=''>Select head…</option>
                  {heads.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.category_name}
                    </option>
                  ))}
                </select>
                <div className='flex gap-2'>
                  <Input
                    type='number'
                    placeholder='₹ amount'
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <Button onClick={addDraft} disabled={createManual.isPending || !billId || !headId || !amount}>
                    Add
                  </Button>
                </div>
              </div>
              <p className='text-xs text-muted-foreground mt-2'>
                Saved as a draft. The total apportioned to a bill can never exceed the bill amount.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Workqueue */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Apportionments</CardTitle>
          </CardHeader>
          <CardContent className='overflow-x-auto'>
            {isLoading ? (
              <p className='text-sm text-muted-foreground py-6'>Loading…</p>
            ) : items.length === 0 ? (
              <p className='text-sm text-muted-foreground py-6'>No apportionments yet.</p>
            ) : (
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b text-left text-muted-foreground'>
                    <th className='py-2 pr-4'>Head</th>
                    <th className='py-2 pr-4'>Amount</th>
                    <th className='py-2 pr-4'>Bill</th>
                    <th className='py-2 pr-4'>Source</th>
                    <th className='py-2 pr-4'>Status</th>
                    <th className='py-2 pr-4 text-right'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className='border-b last:border-0'>
                      <td className='py-2 pr-4 capitalize'>{it.category?.category_name ?? '—'}</td>
                      <td className='py-2 pr-4 font-medium'>₹{Number(it.amount).toLocaleString()}</td>
                      <td className='py-2 pr-4 font-mono text-xs text-muted-foreground'>
                        {it.bill_id.slice(0, 8)}…
                      </td>
                      <td className='py-2 pr-4 capitalize'>{it.source}</td>
                      <td className='py-2 pr-4'>
                        <span className={`inline-block rounded px-2 py-0.5 text-xs ${STATUS_STYLES[it.status] ?? ''}`}>
                          {it.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className='py-2 pr-4'>
                        <div className='flex justify-end gap-2'>
                          {canCreate && it.status === 'draft' && (
                            <Button size='sm' variant='outline' onClick={() => submit.mutate([it.id])}>
                              <Send className='h-3.5 w-3.5 mr-1' /> Submit
                            </Button>
                          )}
                          {canApprove && it.status === 'pending_approval' && (
                            <>
                              <Button size='sm' onClick={() => approve.mutate({ ids: [it.id] })}>
                                <Check className='h-3.5 w-3.5 mr-1' /> Approve
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() => reject.mutate({ ids: [it.id], reason: 'Rejected from workqueue' })}
                              >
                                <X className='h-3.5 w-3.5 mr-1' /> Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

export default function ApportionmentPage() {
  return (
    <PermissionGuard module='billing' action='apportionment.view'>
      <ApportionmentInner />
    </PermissionGuard>
  );
}
