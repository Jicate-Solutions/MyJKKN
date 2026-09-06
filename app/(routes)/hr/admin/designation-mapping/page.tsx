// app/(routes)/hr/admin/designation-mapping/page.tsx
// ============================================================================
// Sort job titles into the four groups JKKN already has.
//
// Today nothing tells a lecturer from a bus driver: all 857 `staff` rows carry
// role_type='teacher', 'Bus Driver' and 'Attender' included. The four groups
// already exist in `hr_cadres` (Teaching / Administrative / Non-Technical /
// Supporting (Technical)) and `hr_designations` already knows which group each
// title belongs to. The missing piece is the link from a person to a
// designation — `hr_staff_details.designation_id`, which this screen writes.
//
// Progress is stated as a count of job titles. No score, no grade, no ranking.
// An unsorted title reads 'Not sorted yet' and is never defaulted to Teaching,
// because defaulting to Teaching is the bug this screen exists to undo.
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import {
  NOT_SORTED_LABEL,
  buildTitleRows,
  isTitleSorted,
  normalizeDesignationKey,
  summariseTitleProgress,
  type DesignationOption,
  type TitleRow,
} from '@/lib/services/hr/designation-mapping';
import {
  listHrOrganizations,
  loadWorkspace,
  saveTitleMapping,
  type HrOrganizationOption,
} from '@/lib/services/hr/designation-mapping-service';

const UNSORTED_VALUE = '__not_sorted__';

function Explain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

function TitleTable({
  rows,
  designations,
  onSave,
  savingKey,
}: {
  rows: TitleRow[];
  designations: DesignationOption[];
  onSave: (row: TitleRow, designation: DesignationOption) => void;
  savingKey: string | null;
}) {
  const byId = useMemo(
    () => new Map(designations.map((d) => [d.id, d])),
    [designations]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2 font-medium">Job title</th>
            <th className="p-2 font-medium">People</th>
            <th className="p-2 font-medium">Group</th>
            <th className="p-2 font-medium">Sort into</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const current = row.designationId ? byId.get(row.designationId) ?? null : null;
            const sorted = isTitleSorted(row);
            return (
              <tr key={row.key} className="border-b align-top">
                <td className="p-2">
                  <div className="font-medium">{row.label}</div>
                  {row.variants.length > 1 && (
                    <div className="text-xs text-muted-foreground">
                      Also written: {row.variants.filter((v) => v !== row.label).join(', ')}
                    </div>
                  )}
                </td>
                <td className="p-2 tabular-nums">{row.headcount}</td>
                <td className="p-2">
                  {current ? (
                    <Badge variant="secondary">{current.cadre_name ?? NOT_SORTED_LABEL}</Badge>
                  ) : sorted ? (
                    <span className="text-xs text-muted-foreground">
                      Sorted, more than one designation
                    </span>
                  ) : (
                    <Badge variant="outline">{NOT_SORTED_LABEL}</Badge>
                  )}
                  {!sorted && row.sortedCount > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {row.sortedCount} of {row.headcount} sorted
                    </div>
                  )}
                </td>
                <td className="p-2">
                  <Select
                    value={row.designationId ?? UNSORTED_VALUE}
                    disabled={savingKey === row.key}
                    onValueChange={(value) => {
                      if (value === UNSORTED_VALUE) return;
                      const designation = byId.get(value);
                      if (designation) onSave(row, designation);
                    }}
                  >
                    <SelectTrigger className="w-[320px]">
                      <SelectValue placeholder={NOT_SORTED_LABEL} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSORTED_VALUE} disabled>
                        {NOT_SORTED_LABEL}
                      </SelectItem>
                      {designations.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                          {d.cadre_name ? ` — ${d.cadre_name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DesignationMappingScreen() {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSorted, setShowSorted] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const orgsQuery = useQuery({
    queryKey: ['hr', 'designation-mapping', 'organizations'],
    queryFn: listHrOrganizations,
  });

  const organizations = orgsQuery.data ?? [];
  const selectedOrg: HrOrganizationOption | null = useMemo(() => {
    if (organizations.length === 0) return null;
    return organizations.find((o) => o.id === orgId) ?? organizations[0];
  }, [organizations, orgId]);

  const workspaceQuery = useQuery({
    queryKey: ['hr', 'designation-mapping', 'workspace', selectedOrg?.id],
    queryFn: () => loadWorkspace(selectedOrg as HrOrganizationOption),
    enabled: Boolean(selectedOrg),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ row, designation }: { row: TitleRow; designation: DesignationOption }) => {
      const workspace = workspaceQuery.data;
      if (!workspace || !selectedOrg) return 0;
      const staffIds = workspace.staff
        .filter((s) => normalizeDesignationKey(s.designation) === row.key)
        .map((s) => s.id);
      return saveTitleMapping({
        staffIds,
        designation,
        hrOrganizationId: selectedOrg.id,
        detailOrgByStaffId: workspace.detailOrgByStaffId,
      });
    },
    onSuccess: (count, { row, designation }) => {
      toast.success(
        `${row.label} sorted into ${designation.cadre_name ?? designation.name} — ${count} ${
          count === 1 ? 'person' : 'people'
        } updated`
      );
      queryClient.invalidateQueries({
        queryKey: ['hr', 'designation-mapping', 'workspace', selectedOrg?.id],
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Could not save that mapping';
      toast.error(message);
    },
    onSettled: () => setSavingKey(null),
  });

  const rows = useMemo(
    () => buildTitleRows(workspaceQuery.data?.staff ?? []),
    [workspaceQuery.data]
  );
  const progress = useMemo(() => summariseTitleProgress(rows), [rows]);

  const visibleRows = useMemo(() => {
    const needle = normalizeDesignationKey(search);
    return rows.filter((row) => {
      if (!showSorted && isTitleSorted(row)) return false;
      if (needle === '') return true;
      return row.key.includes(needle);
    });
  }, [rows, search, showSorted]);

  const breadcrumb = (
    <PageBreadcrumb
      items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Administration' },
        { label: 'HR', href: '/hr/admin' },
        { label: 'Designation Mapping' },
      ]}
    />
  );

  // --- Explicit refusals. An empty read here means RLS said no, silently. -----
  if (!orgsQuery.isLoading && organizations.length === 0) {
    return (
      <ContentLayout title="Designation Mapping">
        {breadcrumb}
        <Explain title="No HR organisation is visible to your account">
          Sorting job titles needs an HR organisation, and none is readable with your
          current access. Ask an HR administrator to link your account to one.
        </Explain>
      </ContentLayout>
    );
  }

  const designations = workspaceQuery.data?.designations ?? [];
  const workspaceReady = workspaceQuery.isSuccess;

  return (
    <ContentLayout title="Designation Mapping">
      {breadcrumb}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Sort job titles into their group</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Every team member has a job title typed in as free text. Pick the matching
            designation and the whole title is sorted at once, including every way it has
            been spelled. Nothing is guessed: a title nobody has sorted reads{' '}
            <span className="font-medium">{NOT_SORTED_LABEL}</span>.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {organizations.length > 1 && (
              <Select value={selectedOrg?.id ?? ''} onValueChange={setOrgId}>
                <SelectTrigger className="w-[320px]">
                  <SelectValue placeholder="Choose an organisation" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              className="w-[260px]"
              placeholder="Find a job title"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="outline" size="sm" onClick={() => setShowSorted((v) => !v)}>
              {showSorted ? 'Hide sorted titles' : 'Show sorted titles'}
            </Button>
            {workspaceReady && (
              <span className="text-sm font-medium tabular-nums">{progress.label}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {workspaceQuery.isError && (
        <Explain title="Could not load this organisation">
          {workspaceQuery.error instanceof Error
            ? workspaceQuery.error.message
            : 'Something went wrong reading job titles.'}
        </Explain>
      )}

      {workspaceReady && designations.length === 0 && (
        <Explain title="No designations are visible for this organisation">
          This organisation has no designations you can read, so there is nothing to sort
          titles into. Either none have been created for it, or your account is not linked
          to this organisation. Ask an HR administrator to check.
        </Explain>
      )}

      {workspaceReady && designations.length > 0 && rows.length === 0 && (
        <Explain title="No job titles found">
          No team members are readable for this organisation, so there are no job titles to
          sort.
        </Explain>
      )}

      {workspaceReady && designations.length > 0 && rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {showSorted ? 'All job titles' : 'Job titles still to sort'} ({visibleRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {visibleRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {showSorted
                  ? 'No job title matches that search.'
                  : 'Every job title here has been sorted.'}
              </p>
            ) : (
              <TitleTable
                rows={visibleRows}
                designations={designations}
                savingKey={savingKey}
                onSave={(row, designation) => {
                  setSavingKey(row.key);
                  saveMutation.mutate({ row, designation });
                }}
              />
            )}
          </CardContent>
        </Card>
      )}
    </ContentLayout>
  );
}

export default function DesignationMappingPage() {
  return (
    <PermissionGuard
      module="hr.employees"
      action="edit"
      fallback={
        <ContentLayout title="Designation Mapping">
          <Explain title="You do not have access to sort job titles">
            Sorting job titles changes HR records, so it needs the
            &ldquo;Edit Employee Details&rdquo; permission. Ask an HR administrator if you
            need it.
          </Explain>
        </ContentLayout>
      }
    >
      <DesignationMappingScreen />
    </PermissionGuard>
  );
}
