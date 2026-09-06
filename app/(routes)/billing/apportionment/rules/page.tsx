'use client';

/**
 * Apportionment Default Rules — per-package defaults that auto-apply to bills.
 * A rule: "for this accommodation type / fee structure, head X = ₹Y (fixed) or Z% (percent)".
 * Create → approve (activate). Only approved+active rules can be applied to bills.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Check } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useRevenueHeads,
  useApportionmentRules,
  useApportionmentMutations,
  type SplitMethod,
} from '@/hooks/billing/use-apportionment';
import { BillingApportionmentService } from '@/lib/services/billing/apportionment/apportionment-service';

function RulesInner() {
  const { canAccess } = usePermissions();
  const canCreate = canAccess('billing', 'apportionment.create');
  const canEdit = canAccess('billing', 'apportionment.edit');

  const { data: heads = [] } = useRevenueHeads();
  const { data: rules = [], isLoading } = useApportionmentRules();
  const { createRule, approveRule } = useApportionmentMutations();

  const { data: accomTypes = [] } = useQuery({
    queryKey: ['apportionment-accom-types'],
    queryFn: () => BillingApportionmentService.listAccommodationTypes(),
  });
  const { data: institutions = [] } = useQuery({
    queryKey: ['apportionment-institutions'],
    queryFn: () => BillingApportionmentService.listInstitutions(),
  });

  const [institutionId, setInstitutionId] = useState('');
  const [accomId, setAccomId] = useState('');
  const [headId, setHeadId] = useState('');
  const [method, setMethod] = useState<SplitMethod>('fixed');
  const [value, setValue] = useState('');

  const headName = (id: string) => heads.find((h) => h.id === id)?.category_name ?? id.slice(0, 8);

  const create = () => {
    if (!headId || !accomId || !value) return;
    createRule.mutate({
      institution_id: institutionId || null,
      fee_structure_id: null,
      accommodation_type_id: accomId,
      billing_category_id: headId,
      split_method: method,
      split_value: Number(value),
    });
    setValue('');
  };

  return (
    <ContentLayout title='Apportionment Rules'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Apportionment', href: '/billing/apportionment' },
          { label: 'Rules', href: '/billing/apportionment/rules' },
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Default Rules</h1>
            <p className='text-sm text-muted-foreground'>
              Per-package defaults. Only approved + active rules can be applied to bills.
            </p>
          </div>
          <Button variant='outline' asChild className='shrink-0'>
            <Link href='/billing/apportionment'>
              <ArrowLeft className='mr-2 h-4 w-4' /> Back
            </Link>
          </Button>
        </div>

        {canCreate && (
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium flex items-center gap-2'>
                <Plus className='h-4 w-4' /> New rule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3'>
                <select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}
                  className='h-10 rounded-md border border-input bg-background px-2 text-sm lg:col-span-2'>
                  <option value=''>Institution (all)…</option>
                  {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <select value={accomId} onChange={(e) => setAccomId(e.target.value)}
                  className='h-10 rounded-md border border-input bg-background px-2 text-sm'>
                  <option value=''>Accommodation…</option>
                  {accomTypes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select value={headId} onChange={(e) => setHeadId(e.target.value)}
                  className='h-10 rounded-md border border-input bg-background px-2 text-sm'>
                  <option value=''>Head…</option>
                  {heads.map((h) => <option key={h.id} value={h.id}>{h.category_name}</option>)}
                </select>
                <select value={method} onChange={(e) => setMethod(e.target.value as SplitMethod)}
                  className='h-10 rounded-md border border-input bg-background px-2 text-sm'>
                  <option value='fixed'>Fixed ₹</option>
                  <option value='percent'>Percent %</option>
                </select>
                <div className='flex gap-2'>
                  <Input type='number' placeholder={method === 'fixed' ? '₹' : '%'} value={value}
                    onChange={(e) => setValue(e.target.value)} />
                  <Button onClick={create} disabled={createRule.isPending || !headId || !accomId || !value}>Add</Button>
                </div>
              </div>
              <p className='text-xs text-muted-foreground mt-2'>
                Saved as draft. An approver activates it before it can be applied.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className='pb-2'><CardTitle className='text-sm font-medium'>Rules</CardTitle></CardHeader>
          <CardContent className='overflow-x-auto'>
            {isLoading ? (
              <p className='text-sm text-muted-foreground py-6'>Loading…</p>
            ) : rules.length === 0 ? (
              <p className='text-sm text-muted-foreground py-6'>No rules yet.</p>
            ) : (
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b text-left text-muted-foreground'>
                    <th className='py-2 pr-4'>Head</th>
                    <th className='py-2 pr-4'>Split</th>
                    <th className='py-2 pr-4'>Status</th>
                    <th className='py-2 pr-4 text-right'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className='border-b last:border-0'>
                      <td className='py-2 pr-4'>{headName(r.billing_category_id)}</td>
                      <td className='py-2 pr-4'>
                        {r.split_method === 'fixed' ? `₹${Number(r.split_value).toLocaleString()}` : `${r.split_value}%`}
                      </td>
                      <td className='py-2 pr-4'>
                        <span className={`inline-block rounded px-2 py-0.5 text-xs ${r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className='py-2 pr-4 text-right'>
                        {canEdit && r.status !== 'approved' && (
                          <Button size='sm' onClick={() => approveRule.mutate({ ruleId: r.id })}>
                            <Check className='h-3.5 w-3.5 mr-1' /> Approve
                          </Button>
                        )}
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

export default function ApportionmentRulesPage() {
  return (
    <PermissionGuard module='billing' action='apportionment.view'>
      <RulesInner />
    </PermissionGuard>
  );
}
