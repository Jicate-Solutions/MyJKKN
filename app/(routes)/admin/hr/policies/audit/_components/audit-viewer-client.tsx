'use client';

/**
 * AuditViewerClient — client-side cross-policy audit log with filters,
 * table view, timeline toggle, and pagination.
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Clock,
  LayoutList,
  Loader2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { usePolicyAuditLog } from '@/hooks/hr/use-policy-audit';
import type {
  HRPolicyAuditLogEntry,
  PolicyChangeType,
} from '@/types/hr-policy-audit';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30;

const CHANGE_TYPES: { value: PolicyChangeType; label: string }[] = [
  { value: 'edit_draft', label: 'Draft edited' },
  { value: 'publish', label: 'Published' },
  { value: 'unpublish', label: 'Unpublished' },
  { value: 'classify_change', label: 'Reclassified' },
  { value: 'promote_to_global', label: 'Promoted to global' },
];

export function AuditViewerClient() {
  // Filter state
  const [policyKey, setPolicyKey] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [changeType, setChangeType] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');

  const { data, isLoading, error } = usePolicyAuditLog(
    policyKey || undefined,
    institutionId || undefined,
    {
      change_type: (changeType || undefined) as PolicyChangeType | undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      page,
      page_size: PAGE_SIZE,
    }
  );

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleReset = () => {
    setPolicyKey('');
    setInstitutionId('');
    setChangeType('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 border rounded-lg bg-card">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Policy key</Label>
          <Input
            placeholder="e.g. hr.leave.casual"
            value={policyKey}
            onChange={(e) => { setPolicyKey(e.target.value); setPage(1); }}
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Institution ID</Label>
          <Input
            placeholder="UUID"
            value={institutionId}
            onChange={(e) => { setInstitutionId(e.target.value); setPage(1); }}
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Action type</Label>
          <Select
            value={changeType}
            onValueChange={(v) => { setChangeType(v === '_all' ? '' : v); setPage(1); }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All actions</SelectItem>
              {CHANGE_TYPES.map((ct) => (
                <SelectItem key={ct.value} value={ct.value}>
                  {ct.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="h-9 text-sm"
          />
        </div>

        <div className="md:col-span-5 flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={handleReset}>
            Reset filters
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button
              size="sm"
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              onClick={() => setViewMode('table')}
              className="h-7 px-2 text-xs"
            >
              <LayoutList className="h-3 w-3 mr-1" />
              Table
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'timeline' ? 'default' : 'ghost'}
              onClick={() => setViewMode('timeline')}
              className="h-7 px-2 text-xs"
            >
              <Clock className="h-3 w-3 mr-1" />
              Timeline
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading audit log...
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Failed to load audit log: {error.message}
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState hasFilters={Boolean(policyKey || institutionId || changeType || fromDate || toDate)} />
      ) : viewMode === 'table' ? (
        <AuditTable entries={entries} />
      ) : (
        <AuditTimeline entries={entries} />
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({total} total events)
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table view
// ---------------------------------------------------------------------------

function AuditTable({ entries }: { entries: HRPolicyAuditLogEntry[] }) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[170px]">When</TableHead>
            <TableHead className="w-[180px]">Who</TableHead>
            <TableHead>Policy</TableHead>
            <TableHead className="w-[130px]">Action</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <AuditTableRow key={entry.id} entry={entry} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AuditTableRow({ entry }: { entry: HRPolicyAuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = entry.old_value !== null || entry.new_value !== null;

  return (
    <>
      <TableRow>
        <TableCell className="text-sm whitespace-nowrap">
          {formatTimestamp(entry.edited_at)}
        </TableCell>
        <TableCell className="text-sm">
          {entry.editor_name ? (
            <>
              <div>{entry.editor_name}</div>
              {entry.editor_email && (
                <div className="text-xs text-muted-foreground">{entry.editor_email}</div>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Unknown</span>
          )}
        </TableCell>
        <TableCell className="text-sm">
          <div className="font-mono text-xs break-all">{entry.policy_key}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {entry.scope_type}
            {entry.scope_id ? ` · ${entry.scope_id.slice(0, 8)}…` : ''}
          </div>
        </TableCell>
        <TableCell>
          <ActionBadge action={entry.action} />
        </TableCell>
        <TableCell className="text-sm max-w-[300px] truncate" title={entry.reason}>
          {entry.reason}
        </TableCell>
        <TableCell>
          {hasDiff && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </Button>
          )}
        </TableCell>
      </TableRow>
      {expanded && hasDiff && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DiffPanel label="Before" value={entry.old_value} variant="old" />
              <DiffPanel label="After" value={entry.new_value} variant="new" />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Timeline view
// ---------------------------------------------------------------------------

function AuditTimeline({ entries }: { entries: HRPolicyAuditLogEntry[] }) {
  return (
    <div className="relative space-y-0 pl-2">
      <div className="absolute left-[21px] top-3 bottom-3 w-px bg-border" />
      {entries.map((entry) => (
        <TimelineEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function TimelineEntry({ entry }: { entry: HRPolicyAuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = entry.old_value !== null || entry.new_value !== null;

  return (
    <div className="relative flex gap-3 pb-4">
      <div className="relative z-10 flex-shrink-0 mt-1.5">
        <div className={`h-[10px] w-[10px] rounded-full border-2 ${dotColor(entry.action)}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <ActionBadge action={entry.action} />
          <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">
            {entry.policy_key}
          </code>
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(entry.edited_at)}
          </span>
        </div>
        <div className="mt-1 text-sm">
          <span className="font-medium">
            {entry.editor_name || entry.editor_email || 'Unknown'}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground italic">
          &ldquo;{entry.reason}&rdquo;
        </p>
        {hasDiff && (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs">
                <ChevronDown
                  className={`h-3 w-3 mr-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
                {expanded ? 'Hide changes' : 'Show changes'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                <DiffPanel label="Before" value={entry.old_value} variant="old" />
                <DiffPanel label="After" value={entry.new_value} variant="new" />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-2">
        <Clock className="h-8 w-8 mx-auto text-muted-foreground" />
        <h3 className="text-base font-medium">
          {hasFilters ? 'No audit events match these filters' : 'No audit events yet'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {hasFilters
            ? 'Try widening the date range or clearing the filters.'
            : 'Audit rows will appear once policy editors save, publish, or reclassify policies.'}
        </p>
      </CardContent>
    </Card>
  );
}

function ActionBadge({ action }: { action: PolicyChangeType }) {
  const config: Record<PolicyChangeType, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    edit_draft: { label: 'Draft edited', variant: 'secondary' },
    publish: { label: 'Published', variant: 'default' },
    unpublish: { label: 'Unpublished', variant: 'destructive' },
    classify_change: { label: 'Reclassified', variant: 'outline' },
    promote_to_global: { label: 'Promoted', variant: 'outline' },
  };
  const c = config[action] ?? { label: action, variant: 'outline' as const };
  return <Badge variant={c.variant} className="text-xs">{c.label}</Badge>;
}

function DiffPanel({
  label,
  value,
  variant,
}: {
  label: string;
  value: unknown | null;
  variant: 'old' | 'new';
}) {
  const bg = variant === 'old' ? 'bg-red-50 dark:bg-red-950/20' : 'bg-green-50 dark:bg-green-950/20';
  const border = variant === 'old' ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800';

  return (
    <div className={`rounded-md border ${border} ${bg} p-2 overflow-auto max-h-[300px]`}>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <pre className="text-xs whitespace-pre-wrap break-all font-mono">
        {value === null ? '(empty)' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function dotColor(action: PolicyChangeType): string {
  switch (action) {
    case 'publish': return 'bg-green-500 border-green-500';
    case 'unpublish': return 'bg-red-500 border-red-500';
    case 'edit_draft': return 'bg-blue-500 border-blue-500';
    case 'classify_change': return 'bg-amber-500 border-amber-500';
    case 'promote_to_global': return 'bg-purple-500 border-purple-500';
    default: return 'bg-gray-400 border-gray-400';
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
