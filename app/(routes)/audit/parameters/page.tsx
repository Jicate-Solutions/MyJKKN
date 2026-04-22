'use client';

// Audit Parameter Catalog browser.
// 36-parameter Aassaan catalog, grouped 1-4, with framework-mapping badges
// + filter + active/inactive toggle. Row click → /audit/parameters/[code].
//
// Sprint 01 PR-B2.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Search, ChevronRight } from 'lucide-react';
import { useSystemParameters } from '@/hooks/audit/use-audit-parameters';
import { FrameworkMappingDisplay } from '../_components/parameters/framework-mapping-display';
import type {
  AuditParameterCatalogRow,
  ParameterGroup
} from '@/lib/types/audit';

const GROUPS: { value: ParameterGroup; label: string; hint: string }[] = [
  { value: 1, label: 'Group 1', hint: 'Academic / Curricular' },
  { value: 2, label: 'Group 2', hint: 'Research' },
  { value: 3, label: 'Group 3', hint: 'Governance' },
  { value: 4, label: 'Group 4', hint: 'Infrastructure' }
];

export default function AuditParametersPage() {
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [activeGroup, setActiveGroup] = useState<ParameterGroup>(1);
  const router = useRouter();

  const { data: parameters = [], isLoading, isError, refetch } = useSystemParameters();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (parameters as AuditParameterCatalogRow[]).filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [parameters, filter, showInactive]);

  const byGroup = useMemo(() => {
    const map = new Map<ParameterGroup, AuditParameterCatalogRow[]>();
    for (const g of GROUPS) map.set(g.value, []);
    for (const row of filtered) {
      const bucket = map.get(row.parameter_group);
      if (bucket) bucket.push(row);
    }
    return map;
  }, [filtered]);

  return (
    <PermissionGuard module='audit' action='parameter.view'>
      <ContentLayout title='Audit Parameters'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/audit'>Audit</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Parameters</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardContent className='p-6 space-y-6'>
              <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
                <div>
                  <h2 className='text-lg font-semibold'>Parameter Catalog</h2>
                  <p className='text-sm text-muted-foreground'>
                    36 system-default parameters across 4 groups. Institution
                    overrides are applied automatically on cycle pages.
                  </p>
                </div>
                <div className='flex items-center gap-3'>
                  <div className='flex items-center gap-2'>
                    <Switch
                      id='show-inactive'
                      checked={showInactive}
                      onCheckedChange={setShowInactive}
                    />
                    <Label htmlFor='show-inactive' className='text-sm'>
                      Show inactive
                    </Label>
                  </div>
                </div>
              </div>

              <div className='relative max-w-md'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Filter by code, name, description…'
                  className='pl-9'
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>

              {isError && (
                <div className='text-destructive text-sm'>
                  Failed to load parameters.{' '}
                  <Button variant='link' className='h-auto p-0' onClick={() => refetch()}>
                    Retry
                  </Button>
                </div>
              )}

              <Tabs
                value={String(activeGroup)}
                onValueChange={(v) => setActiveGroup(Number(v) as ParameterGroup)}
              >
                <TabsList className='grid grid-cols-2 sm:grid-cols-4 w-full'>
                  {GROUPS.map((g) => {
                    const count = byGroup.get(g.value)?.length ?? 0;
                    return (
                      <TabsTrigger key={g.value} value={String(g.value)}>
                        <span className='flex flex-col items-center'>
                          <span className='text-sm font-semibold'>{g.label}</span>
                          <span className='text-xs text-muted-foreground'>
                            {g.hint} ({count})
                          </span>
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {GROUPS.map((g) => {
                  const rows = byGroup.get(g.value) ?? [];
                  return (
                    <TabsContent key={g.value} value={String(g.value)} className='mt-4'>
                      <ParameterTable
                        rows={rows}
                        loading={isLoading}
                        onRowClick={(code) =>
                          router.push(
                            `/audit/parameters/${encodeURIComponent(code)}`
                          )
                        }
                      />
                    </TabsContent>
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function ParameterTable({
  rows,
  loading,
  onRowClick
}: {
  rows: AuditParameterCatalogRow[];
  loading: boolean;
  onRowClick: (code: string) => void;
}) {
  if (loading) {
    return (
      <div className='space-y-2'>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className='h-12 w-full' />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className='text-sm text-muted-foreground py-8 text-center'>
        No parameters match the current filter.
      </p>
    );
  }

  return (
    <div className='rounded-md border overflow-x-auto'>
      <Table className='min-w-[720px]'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-[180px]'>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className='w-[140px]'>Default Owner</TableHead>
            <TableHead className='w-[110px]'>SLA (P1 / P2)</TableHead>
            <TableHead className='w-[200px]'>Framework Mapping</TableHead>
            <TableHead className='w-[40px]' />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className='cursor-pointer hover:bg-muted/40'
              onClick={() => onRowClick(row.code)}
            >
              <TableCell className='font-mono text-xs'>{row.code}</TableCell>
              <TableCell>
                <div className='space-y-1'>
                  <span className='font-medium'>{row.name}</span>
                  {!row.is_active && (
                    <Badge variant='outline' className='ml-2 text-xs'>
                      Inactive
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className='font-mono text-xs'>
                {row.default_owner_role}
              </TableCell>
              <TableCell className='text-xs'>
                <span className='text-red-600 font-semibold'>{row.p1_sla_days}d</span>
                <span className='text-muted-foreground mx-1'>/</span>
                <span className='text-amber-600 font-semibold'>{row.p2_sla_days}d</span>
              </TableCell>
              <TableCell>
                <FrameworkMappingDisplay mapping={row.framework_mapping} />
              </TableCell>
              <TableCell>
                <ChevronRight className='h-4 w-4 text-muted-foreground' />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
