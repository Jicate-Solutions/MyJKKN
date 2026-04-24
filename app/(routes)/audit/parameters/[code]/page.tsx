'use client';

// Audit parameter detail page.
// Sections:
//   - Overview (name, description, group, status)
//   - Framework Mapping (per-body criterion codes, block layout)
//   - Discovery Query (readonly code block + cycle/institution picker + Run Query +
//                     paginated results table + client-side CSV export)
//   - Evidence Required checklist
//   - Owner Routing (default + escalation + SLA)
//   - Institution Overrides list (parameters with this code but institution_id set)
//
// "Run Query" POSTs to /api/audit/parameters/[code]/run-query with
// {cycle_id, institution_id, page, page_size}. Results render in a 100-row
// paginated table (Thrash T4). Export CSV is client-side from the fetched
// page — Agent D's /export-query streams full-dataset CSV in a sibling PR.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  ArrowLeft,
  Clock,
  UserCircle,
  Building2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { FrameworkMappingDisplay } from '../../_components/parameters/framework-mapping-display';
import { EvidenceRequiredList } from '../../_components/parameters/evidence-required-list';
import { RunQueryControls } from '../../_components/parameters/run-query-controls';
import { RunQueryResultsTable } from '../../_components/parameters/run-query-results-table';
import { useRunDiscoveryQuery } from '@/hooks/audit/use-audit-discovery';
import type {
  AuditParameterCatalogRow
} from '@/lib/types/audit';
import type { DiscoveryQueryResult } from '@/lib/services/audit';

const GROUP_LABELS: Record<number, string> = {
  1: 'Academic / Curricular',
  2: 'Research',
  3: 'Governance',
  4: 'Infrastructure'
};

export default function AuditParameterDetailPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = decodeURIComponent(params.code);

  const {
    data: rows = [],
    isLoading,
    isError
  } = useQuery({
    queryKey: ['audit', 'parameter-detail', code],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('audit_parameter_catalog')
        .select('*')
        .eq('code', code);
      if (error) throw error;
      return (data ?? []) as AuditParameterCatalogRow[];
    },
    staleTime: 60 * 1000
  });

  const systemRow = rows.find((r) => r.institution_id === null);
  const overrides = rows.filter((r) => r.institution_id !== null);

  // Run-query state. `result` holds the latest DiscoveryQueryResult from the
  // API; `page` drives both the pagination component AND the next mutation.
  const [cycleId, setCycleId] = useState<string | undefined>(undefined);
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    undefined
  );
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DiscoveryQueryResult | null>(null);

  const runQuery = useRunDiscoveryQuery();

  const executeQuery = (nextPage: number) => {
    if (!systemRow?.discovery_query_sql && !systemRow?.discovery_query_ai) {
      toast.error('This parameter has no discovery query defined.');
      return;
    }
    if (!cycleId || !institutionId) {
      toast.error('Select a cycle and institution before running the query.');
      return;
    }
    runQuery.mutate(
      {
        parameter_code: code,
        cycle_id: cycleId,
        institution_id: institutionId,
        page: nextPage,
        page_size: 100
      },
      {
        onSuccess: (data) => {
          setResult(data);
          setPage(nextPage);
          toast.success(
            `Discovery query returned ${data.total_count.toLocaleString()} row${
              data.total_count === 1 ? '' : 's'
            }.`
          );
        },
        onError: (err) => {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Failed to run discovery query'
          );
        }
      }
    );
  };

  const handleRunQuery = () => executeQuery(1);
  const handlePageChange = (nextPage: number) => executeQuery(nextPage);

  return (
    <PermissionGuard module='audit' action='parameter.view'>
      <ContentLayout title='Parameter Detail'>
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
                <BreadcrumbPage className='font-mono text-xs'>{code}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Button variant='ghost' size='sm' onClick={() => router.back()}>
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back
          </Button>

          {isLoading && <DetailSkeleton />}

          {isError && (
            <div className='text-destructive text-sm'>
              Failed to load parameter detail.
            </div>
          )}

          {!isLoading && !systemRow && (
            <Card>
              <CardContent className='p-6'>
                <p className='text-muted-foreground'>
                  Parameter <code className='font-mono'>{code}</code> not found.
                </p>
              </CardContent>
            </Card>
          )}

          {systemRow && (
            <>
              <OverviewCard row={systemRow} />
              <FrameworkMappingCard row={systemRow} />
              <DiscoveryQueryCard
                row={systemRow}
                cycleId={cycleId}
                institutionId={institutionId}
                onCycleChange={setCycleId}
                onInstitutionChange={setInstitutionId}
                onRun={handleRunQuery}
                isRunning={runQuery.isPending}
                result={result}
                page={page}
                onPageChange={handlePageChange}
                parameterCode={code}
              />
              <EvidenceCard row={systemRow} />
              <OwnerRoutingCard row={systemRow} />
              <OverridesCard overrides={overrides} />
            </>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function DetailSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-32 w-full' />
      <Skeleton className='h-24 w-full' />
      <Skeleton className='h-40 w-full' />
    </div>
  );
}

function OverviewCard({ row }: { row: AuditParameterCatalogRow }) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3 flex-wrap'>
          <div className='space-y-1'>
            <p className='font-mono text-xs text-muted-foreground'>{row.code}</p>
            <CardTitle className='text-xl'>{row.name}</CardTitle>
          </div>
          <div className='flex gap-2 items-center'>
            <Badge variant='secondary'>{GROUP_LABELS[row.parameter_group]}</Badge>
            {row.is_active ? (
              <Badge variant='default'>Active</Badge>
            ) : (
              <Badge variant='outline'>Inactive</Badge>
            )}
            {row.is_system && (
              <Badge variant='outline' className='text-xs'>
                System
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className='text-sm text-muted-foreground'>
          {row.description ?? 'No description provided.'}
        </p>
      </CardContent>
    </Card>
  );
}

function FrameworkMappingCard({ row }: { row: AuditParameterCatalogRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Framework Mapping</CardTitle>
      </CardHeader>
      <CardContent>
        <FrameworkMappingDisplay
          mapping={row.framework_mapping}
          variant='block'
          emptyLabel='No accreditation-body mappings configured.'
        />
      </CardContent>
    </Card>
  );
}

function DiscoveryQueryCard({
  row,
  cycleId,
  institutionId,
  onCycleChange,
  onInstitutionChange,
  onRun,
  isRunning,
  result,
  page,
  onPageChange,
  parameterCode
}: {
  row: AuditParameterCatalogRow;
  cycleId: string | undefined;
  institutionId: string | undefined;
  onCycleChange: (value: string) => void;
  onInstitutionChange: (value: string) => void;
  onRun: () => void;
  isRunning: boolean;
  result: DiscoveryQueryResult | null;
  page: number;
  onPageChange: (page: number) => void;
  parameterCode: string;
}) {
  const hasSql = !!row.discovery_query_sql;
  const hasAi = !!row.discovery_query_ai;
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Discovery Query</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {hasAi && (
          <div>
            <div className='text-xs text-muted-foreground mb-1'>AI prompt</div>
            <p className='text-sm italic'>{row.discovery_query_ai}</p>
          </div>
        )}
        {hasSql && (
          <div>
            <div className='text-xs text-muted-foreground mb-1'>SQL</div>
            <pre className='bg-muted rounded p-3 text-xs overflow-x-auto font-mono'>
              {row.discovery_query_sql}
            </pre>
          </div>
        )}
        {!hasSql && !hasAi && (
          <p className='text-sm text-muted-foreground'>
            No discovery query defined for this parameter.
          </p>
        )}

        {(hasSql || hasAi) && (
          <>
            <div className='border-t pt-4'>
              <RunQueryControls
                cycleId={cycleId}
                institutionId={institutionId}
                onCycleChange={onCycleChange}
                onInstitutionChange={onInstitutionChange}
                onRun={onRun}
                isRunning={isRunning}
                disabled={!hasSql && !hasAi}
              />
            </div>
            {result && (
              <RunQueryResultsTable
                rows={result.rows}
                totalCount={result.total_count}
                page={page}
                pageSize={result.page_size}
                onPageChange={onPageChange}
                isLoading={isRunning}
                parameterCode={parameterCode}
                warning={result.warning}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceCard({ row }: { row: AuditParameterCatalogRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Evidence Required</CardTitle>
      </CardHeader>
      <CardContent>
        <EvidenceRequiredList
          value={row.evidence_required ?? []}
          emptyMessage='No evidence items configured.'
        />
      </CardContent>
    </Card>
  );
}

function OwnerRoutingCard({ row }: { row: AuditParameterCatalogRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Owner Routing & SLA</CardTitle>
      </CardHeader>
      <CardContent className='grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm'>
        <div className='flex items-start gap-2'>
          <UserCircle className='h-4 w-4 text-muted-foreground mt-0.5' />
          <div>
            <div className='text-xs text-muted-foreground'>Default Owner</div>
            <div className='font-mono'>{row.default_owner_role}</div>
          </div>
        </div>
        <div className='flex items-start gap-2'>
          <UserCircle className='h-4 w-4 text-muted-foreground mt-0.5' />
          <div>
            <div className='text-xs text-muted-foreground'>Escalation</div>
            <div className='font-mono'>{row.escalation_role ?? '—'}</div>
          </div>
        </div>
        <div className='flex items-start gap-2'>
          <Clock className='h-4 w-4 text-muted-foreground mt-0.5' />
          <div>
            <div className='text-xs text-muted-foreground'>SLA (P1 / P2)</div>
            <div>
              <span className='text-red-600 font-semibold'>
                {row.p1_sla_days}d
              </span>
              <span className='text-muted-foreground mx-1'>/</span>
              <span className='text-amber-600 font-semibold'>
                {row.p2_sla_days}d
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverridesCard({
  overrides
}: {
  overrides: AuditParameterCatalogRow[];
}) {
  const [institutionMap, setInstitutionMap] = useState<Map<string, string>>(
    new Map()
  );

  useEffect(() => {
    const ids = overrides
      .map((o) => o.institution_id)
      .filter((id): id is string => !!id);
    if (ids.length === 0) return;
    const supabase = createClientSupabaseClient();
    (async () => {
      const { data } = await (supabase as any)
        .from('institutions')
        .select('id,name')
        .in('id', ids);
      const next = new Map<string, string>();
      for (const row of (data ?? []) as { id: string; name: string }[]) {
        next.set(row.id, row.name);
      }
      setInstitutionMap(next);
    })();
  }, [overrides]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Institution Overrides</CardTitle>
      </CardHeader>
      <CardContent>
        {overrides.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            No institution-specific overrides for this parameter.
          </p>
        ) : (
          <ul className='space-y-2'>
            {overrides.map((o) => (
              <li
                key={o.id}
                className='flex items-center gap-2 text-sm p-2 rounded border bg-muted/20'
              >
                <Building2 className='h-4 w-4 text-muted-foreground flex-shrink-0' />
                <span className='font-medium'>
                  {institutionMap.get(o.institution_id ?? '') ??
                    o.institution_id}
                </span>
                <span className='text-xs text-muted-foreground'>
                  owner: <code className='font-mono'>{o.default_owner_role}</code>
                  {' · '}SLA: {o.p1_sla_days}d / {o.p2_sla_days}d
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
