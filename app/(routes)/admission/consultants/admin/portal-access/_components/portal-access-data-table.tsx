'use client';

// ============================================================================
// Portal Access Data Table — super-admin editor for the three rule_types
// in consultant_portal_access_policy.
// Created: 2026-05-13.
//
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
//
// Layout: a single table sectioned by rule_type. Each row is one principal-typed
// grant (role / permission / user-id) with display_label, active toggle, edit,
// soft-delete. A rule_type filter at the top hides irrelevant sections; "All"
// (default) shows everything grouped.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  deactivateAccessRule,
  explainRuleType,
  formatPrincipalType,
  formatRuleType,
  listAccessRules,
  RULE_TYPE_OPTIONS,
  setAccessRuleActive,
  type ConsultantPortalAccessRow,
  type PortalAccessRuleType,
} from '@/lib/services/admission/consultant-portal-access-service';

import { EditAccessDialog } from './edit-access-dialog';

const ALL = '__all__';
type FilterValue = typeof ALL | PortalAccessRuleType;

const RULE_TYPE_ORDER: PortalAccessRuleType[] = [
  'portal_login_allowed',
  'rls_read_own_data',
  'preview_as_consultant',
];

export function PortalAccessDataTable() {
  const [rows, setRows] = useState<ConsultantPortalAccessRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>(ALL);
  const [editing, setEditing] = useState<ConsultantPortalAccessRow | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ConsultantPortalAccessRow | null>(
    null,
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAccessRules();
      setRows(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load portal access rules';
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Group rows by rule_type so we can render section headers between groups.
  const grouped = useMemo(() => {
    if (!rows) return null;
    const visible =
      filter === ALL ? rows : rows.filter((r) => r.rule_type === filter);
    const map: Record<PortalAccessRuleType, ConsultantPortalAccessRow[]> = {
      portal_login_allowed: [],
      rls_read_own_data: [],
      preview_as_consultant: [],
    };
    for (const r of visible) {
      map[r.rule_type].push(r);
    }
    return map;
  }, [rows, filter]);

  const handleToggleActive = async (
    row: ConsultantPortalAccessRow,
    next: boolean,
  ) => {
    setTogglingId(row.id);
    try {
      await setAccessRuleActive(row.id, row.rule_type, next);
      toast.success(
        `${row.display_label} ${next ? 'turned on' : 'turned off'}`,
      );
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update';
      toast.error(msg);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deactivateAccessRule(deleting.id, deleting.rule_type);
      toast.success('Rule turned off');
      setDeleting(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not turn off';
      toast.error(msg);
    }
  };

  const handleNew = () => {
    setEditing(null);
    setCreating(true);
  };

  const handleEdit = (row: ConsultantPortalAccessRow) => {
    setEditing(row);
    setCreating(false);
  };

  const handleSaved = async () => {
    setEditing(null);
    setCreating(false);
    await load();
  };

  const totalRows = rows?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Plain-English explainer */}
      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <h3 className="mb-2 text-sm font-semibold">
          What this page controls
        </h3>
        <p className="text-sm text-muted-foreground">
          Three separate decisions about the consultant portal at{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            /consultant-portal
          </code>
          :
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>
            <strong>Who can sign in</strong> — principals (role / permission /
            specific user) allowed to load any portal page. Active consultants
            (with a row in <code className="text-xs">education_consultants</code>{' '}
            and status=active) are always allowed by default.
          </li>
          <li>
            <strong>Who reads own data</strong> — principals granted the
            additive RLS read on their own attribution and commission rows.
          </li>
          <li>
            <strong>Who can preview-as</strong> — admin roles permitted to
            enter the portal AS a specific consultant via see-as-user (cookie
            swap).
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Adding a new persona (e.g., a Senior VP) is a one-row INSERT — no
          deploy, no PR. To temporarily revoke access, toggle the row off; the
          row stays as an audit record.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Show rules for
          </label>
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as FilterValue)}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All rule types</SelectItem>
              {RULE_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {rows
              ? `${totalRows} rule${totalRows === 1 ? '' : 's'} configured`
              : '—'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Add rule
          </Button>
        </div>
      </div>

      {/* Sections */}
      {loading || grouped === null ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="space-y-8">
          {RULE_TYPE_ORDER.filter(
            (rt) => filter === ALL || filter === rt,
          ).map((rt) => (
            <RuleTypeSection
              key={rt}
              ruleType={rt}
              rows={grouped[rt]}
              togglingId={togglingId}
              onToggle={handleToggleActive}
              onEdit={handleEdit}
              onDelete={(r) => setDeleting(r)}
            />
          ))}
        </div>
      )}

      <EditAccessDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCreating(false);
          }
        }}
        row={editing}
        defaultRuleType={
          filter === ALL ? 'portal_login_allowed' : (filter as PortalAccessRuleType)
        }
        onSaved={handleSaved}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  This will turn off the rule{' '}
                  <strong>&quot;{deleting.display_label}&quot;</strong> under{' '}
                  <em>{formatRuleType(deleting.rule_type)}</em>. The row is
                  preserved as an audit record — you can turn it back on later.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// RuleTypeSection — one labelled block for a single rule_type, with its
// description and a small table of rows.
// ----------------------------------------------------------------------------
interface RuleTypeSectionProps {
  ruleType: PortalAccessRuleType;
  rows: ConsultantPortalAccessRow[];
  togglingId: string | null;
  onToggle: (row: ConsultantPortalAccessRow, next: boolean) => void;
  onEdit: (row: ConsultantPortalAccessRow) => void;
  onDelete: (row: ConsultantPortalAccessRow) => void;
}

function RuleTypeSection({
  ruleType,
  rows,
  togglingId,
  onToggle,
  onEdit,
  onDelete,
}: RuleTypeSectionProps) {
  return (
    <div>
      <div className="mb-3 space-y-1">
        <h3 className="text-base font-semibold">{formatRuleType(ruleType)}</h3>
        <p className="text-xs text-muted-foreground">{explainRuleType(ruleType)}</p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No rules in this section yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%]">Label</TableHead>
                <TableHead className="w-[15%]">Type</TableHead>
                <TableHead className="w-[27%]">Value</TableHead>
                <TableHead className="w-[20%]">Notes</TableHead>
                <TableHead className="w-[10%] text-center">Active</TableHead>
                <TableHead className="w-[60px] text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={row.is_active ? '' : 'opacity-60'}
                >
                  <TableCell className="font-medium">{row.display_label}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {formatPrincipalType(row.principal_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {row.principal_value}
                    </code>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.notes ? row.notes : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={row.is_active}
                      disabled={togglingId === row.id}
                      onCheckedChange={(next) => onToggle(row, next)}
                      aria-label={`Toggle ${row.display_label}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onEdit(row)}
                        aria-label={`Edit ${row.display_label}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(row)}
                        aria-label={`Turn off ${row.display_label}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
