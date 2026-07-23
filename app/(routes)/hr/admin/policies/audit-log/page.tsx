// =====================================================================
// /hr/admin/policies/audit-log — Wave 3 policy audit history viewer
// =====================================================================
// Read-only viewer over `hr_policy_audit_log` (W3-M0 substrate).
// Shows every Save / Publish / Reclassify / Promote action with the
// mandatory reason text. Filters by policy_key / editor / date range.
//
// Server component — pure read path; uses the SSR Supabase client and
// honors RLS (super_admin sees all; institution users see scope-matching).
//
// Permission: super_admin / admin only (PermissionGuard).
// =====================================================================

import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';

import { createClient } from '@/lib/supabase/server';

// Force dynamic so RLS-scoped queries run per request, not at build.
export const dynamic = 'force-dynamic';

interface AuditLogPageSearchParams {
  policy_key?: string;
  editor?: string;
  from?: string;
  to?: string;
}

interface AuditRow {
  id: string;
  policy_key: string;
  scope_type: string;
  scope_id: string | null;
  action: string;
  reason: string;
  edited_at: string;
  editor_name: string | null;
  editor_email: string | null;
}

interface FilterOptions {
  policyKeys: string[];
  editors: Array<{ id: string; name: string }>;
}

export default async function HrPoliciesAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<AuditLogPageSearchParams>;
}) {
  const params = await searchParams;
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policies — Audit log">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies', href: '/hr/admin/policies' },
            { label: 'Audit log' },
          ]}
        />
        <AuditLogContent params={params} />
      </ContentLayout>
    </PermissionGuard>
  );
}

async function AuditLogContent({ params }: { params: AuditLogPageSearchParams }) {
  const supabase = await createClient();

  // 1. Pull recent audit rows (RLS-scoped). 100 most recent by default.
  let q = supabase
    .from('hr_policy_audit_log')
    .select(
      'id, policy_key, scope_type, scope_id, action, reason, edited_at, edited_by'
    )
    .order('edited_at', { ascending: false })
    .limit(100);

  if (params.policy_key) q = q.eq('policy_key', params.policy_key);
  if (params.editor) q = q.eq('edited_by', params.editor);
  if (params.from) q = q.gte('edited_at', params.from);
  if (params.to) q = q.lte('edited_at', params.to);

  const { data: rawRows, error } = await q;

  // 2. Join profiles for editor display name. Done client-side after the fetch
  // because RLS-restricted joins via PostgREST embeds can mask rows.
  const editorIds = Array.from(
    new Set((rawRows ?? []).map((r) => r.edited_by).filter(Boolean))
  );
  const editorMap = new Map<string, { name: string | null; email: string | null }>();
  if (editorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', editorIds);
    for (const p of profiles ?? []) {
      editorMap.set(p.id, {
        name: (p as any).full_name ?? null,
        email: (p as any).email ?? null,
      });
    }
  }

  const rows: AuditRow[] = (rawRows ?? []).map((r) => ({
    id: r.id,
    policy_key: r.policy_key,
    scope_type: r.scope_type,
    scope_id: r.scope_id,
    action: r.action,
    reason: r.reason,
    edited_at: r.edited_at,
    editor_name: editorMap.get(r.edited_by)?.name ?? null,
    editor_email: editorMap.get(r.edited_by)?.email ?? null,
  }));

  // 3. Build filter dropdown options from the visible rows.
  const filterOptions: FilterOptions = {
    policyKeys: Array.from(new Set(rows.map((r) => r.policy_key))).sort(),
    editors: Array.from(editorMap.entries())
      .map(([id, info]) => ({ id, name: info.name ?? info.email ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <Alert>
          <History className="h-4 w-4" />
          <AlertTitle>Audit log</AlertTitle>
          <AlertDescription>
            Append-only history of every Wave 3 policy edit. Each row shows
            who changed what and the reason they recorded at save time.
            Showing up to 100 most recent matching events.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/hr/admin/policies">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to policies
          </Link>
        </Button>
      </div>

      <AuditFilters options={filterOptions} active={params} />

      {error ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Failed to load audit log: {error.message}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState hasFilters={hasAnyFilter(params)} />
      ) : (
        <AuditTable rows={rows} />
      )}
    </div>
  );
}

function hasAnyFilter(params: AuditLogPageSearchParams): boolean {
  return Boolean(params.policy_key || params.editor || params.from || params.to);
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-2">
        <History className="h-8 w-8 mx-auto text-muted-foreground" />
        <h3 className="text-base font-medium">
          {hasFilters ? 'No audit events match these filters' : 'No audit events yet'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {hasFilters
            ? 'Try widening the date range or clearing the filters.'
            : 'Audit rows will appear here once Wave 3 editors start saving and publishing policy changes.'}
        </p>
        {hasFilters && (
          <Button asChild variant="outline" size="sm">
            <Link href="/hr/admin/policies/audit-log">Clear filters</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AuditFilters({
  options,
  active,
}: {
  options: FilterOptions;
  active: AuditLogPageSearchParams;
}) {
  return (
    <form
      method="get"
      className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 border rounded-lg bg-card"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Policy key
        </label>
        <select
          name="policy_key"
          defaultValue={active.policy_key ?? ''}
          className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All policies</option>
          {options.policyKeys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Editor</label>
        <select
          name="editor"
          defaultValue={active.editor ?? ''}
          className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Any editor</option>
          {options.editors.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">From</label>
        <input
          type="date"
          name="from"
          defaultValue={active.from ?? ''}
          className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">To</label>
        <input
          type="date"
          name="to"
          defaultValue={active.to ?? ''}
          className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <div className="md:col-span-4 flex gap-2 pt-1">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        <Button asChild type="button" variant="outline" size="sm">
          <Link href="/hr/admin/policies/audit-log">Reset</Link>
        </Button>
      </div>
    </form>
  );
}

function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[170px]">When</TableHead>
            <TableHead className="w-[200px]">Who</TableHead>
            <TableHead>Policy</TableHead>
            <TableHead className="w-[140px]">Action</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-sm whitespace-nowrap">
                {formatTimestamp(r.edited_at)}
              </TableCell>
              <TableCell className="text-sm">
                {r.editor_name ? (
                  <>
                    <div>{r.editor_name}</div>
                    {r.editor_email && (
                      <div className="text-xs text-muted-foreground">{r.editor_email}</div>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">Unknown</span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                <div className="font-mono text-xs break-all">{r.policy_key}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.scope_type}
                  {r.scope_id ? ` · ${r.scope_id.slice(0, 8)}…` : ''}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={badgeVariantForAction(r.action)}>{r.action}</Badge>
              </TableCell>
              <TableCell className="text-sm">{r.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function badgeVariantForAction(
  action: string
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (action) {
    case 'publish':
      return 'default';
    case 'edit_draft':
      return 'secondary';
    case 'classify_change':
      return 'outline';
    case 'promote_to_global':
      return 'destructive';
    default:
      return 'outline';
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
