'use client';

// Per-institution parameter override management (Sprint 01 — Thrash T2).
//
// URL: /audit/parameters/[code]/overrides
//
// Scope: one parameter code. Lists every institution override for that code,
// offers create / edit / delete. The merged "system + override" view is
// already served elsewhere (listForInstitution); this page is a flat-table of
// the override ROWS (institution_id != null) for admins.
//
// Until a follow-up PR wires a link from the parameter detail page, users
// reach this page via the URL. Breadcrumb still links back to detail so they
// have a way out.

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Plus, ArrowLeft, Info } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { OverrideFormDialog } from '../../../_components/parameters/override-form-dialog';
import { OverrideTable } from '../../../_components/parameters/override-table';
import {
  useParameterOverrides,
  useInstitutionsForOverridePicker,
} from '@/hooks/audit/use-parameter-overrides';
import type { AuditParameterCatalogRow } from '@/lib/types/audit';

const GROUP_LABELS: Record<number, string> = {
  1: 'G1 — Academic',
  2: 'G2 — Research',
  3: 'G3 — Governance',
  4: 'G4 — Infrastructure',
};

export default function AuditParameterOverridesPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code);

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<AuditParameterCatalogRow | null>(null);

  // System row (institution_id IS NULL) — used to prefill the override form.
  const { data: systemRow, isLoading: systemLoading } = useQuery({
    queryKey: ['audit', 'parameter-system-row', code] as const,
    queryFn: async (): Promise<AuditParameterCatalogRow | null> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('audit_parameter_catalog')
        .select('*')
        .eq('code', code)
        .is('institution_id', null)
        .maybeSingle();
      if (error) throw error;
      return (data as AuditParameterCatalogRow) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: overrideRows = [],
    isLoading: overridesLoading,
    isError,
  } = useParameterOverrides(code);

  // Exclude the system row (defensive — useParameterOverrides returns both
  // system + overrides depending on RLS scope).
  const overrides = useMemo(
    () => overrideRows.filter((r) => r.institution_id !== null),
    [overrideRows]
  );

  // Institutions dictionary for name lookup.
  const { data: institutions = [] } = useInstitutionsForOverridePicker();
  const institutionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of institutions) m.set(i.id, i.name);
    return m;
  }, [institutions]);

  const existingInstitutionIds = useMemo(
    () => overrides.map((o) => o.institution_id).filter((v): v is string => !!v),
    [overrides]
  );

  const isLoading = systemLoading || overridesLoading;

  return (
    <PermissionGuard module='audit' action='parameter.manage'>
      <ContentLayout title='Parameter Overrides'>
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
                <BreadcrumbLink href='/audit/parameters'>Parameters</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink
                  href={`/audit/parameters/${encodeURIComponent(code)}`}
                >
                  <span className='font-mono text-xs'>{code}</span>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Overrides</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className='flex items-center justify-between flex-wrap gap-3'>
            <Button variant='ghost' size='sm' asChild>
              <Link href={`/audit/parameters/${encodeURIComponent(code)}`}>
                <ArrowLeft className='h-4 w-4 mr-2' />
                Back to parameter
              </Link>
            </Button>
          </div>

          {isLoading && <LoadingSkeleton />}

          {!isLoading && !systemRow && (
            <Card>
              <CardContent className='p-6'>
                <p className='text-muted-foreground'>
                  Parameter <code className='font-mono'>{code}</code> not found.
                </p>
              </CardContent>
            </Card>
          )}

          {!isLoading && systemRow && (
            <>
              <Card>
                <CardHeader>
                  <div className='flex items-start justify-between gap-3 flex-wrap'>
                    <div className='space-y-1'>
                      <p className='font-mono text-xs text-muted-foreground'>
                        {systemRow.code}
                      </p>
                      <CardTitle className='text-xl'>
                        Institution Overrides — {systemRow.name}
                      </CardTitle>
                    </div>
                    <div className='flex gap-2 items-center'>
                      <Badge variant='secondary'>
                        {GROUP_LABELS[systemRow.parameter_group]}
                      </Badge>
                      <Badge variant='outline' className='text-xs'>
                        System
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className='flex items-start gap-2 text-sm text-muted-foreground'>
                    <Info className='h-4 w-4 mt-0.5 flex-shrink-0' />
                    <p>
                      Each institution can have at most one override per parameter.
                      An override inherits unspecified fields from the system row
                      and only diverges on what you set here. Deleting an override
                      reverts that institution to the system default.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className='flex items-center justify-between flex-wrap gap-3'>
                    <CardTitle className='text-base'>
                      Overrides ({overrides.length})
                    </CardTitle>
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className='h-4 w-4 mr-2' />
                      Add Override
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isError ? (
                    <div className='text-destructive text-sm'>
                      Failed to load overrides.
                    </div>
                  ) : (
                    <OverrideTable
                      code={code}
                      overrides={overrides}
                      institutionNameById={institutionNameById}
                      onEdit={setEditRow}
                    />
                  )}
                </CardContent>
              </Card>

              <OverrideFormDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                mode='create'
                code={code}
                systemRow={systemRow}
                existingInstitutionIds={existingInstitutionIds}
              />

              {editRow && (
                <OverrideFormDialog
                  open={!!editRow}
                  onOpenChange={(open) => !open && setEditRow(null)}
                  mode='edit'
                  code={code}
                  systemRow={systemRow}
                  entity={editRow}
                />
              )}
            </>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function LoadingSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-32 w-full' />
      <Skeleton className='h-64 w-full' />
    </div>
  );
}
