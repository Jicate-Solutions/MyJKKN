'use client';

// ============================================================================
// Rule Types Data Table — admin CRUD for assignment_rule_type_registry.
// Created: 2026-05-07.
// Lean by design: list + create + edit + toggle-active + delete. Mirrors the
// tier-policy admin UI pattern (PR #736). is_system rows are protected:
//   - delete button disabled with tooltip "deactivate instead of delete"
//   - rule_type_key field rendered read-only on edit (changing the key would
//     break existing assignment rules whose enriched `type` virtual field
//     resolves through this string)
// ============================================================================

import { useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAllRuleTypes, useRuleTypeMutations } from '@/hooks/admission';
import type { AssignmentRuleTypeRow } from '@/lib/services/admission/rule-type-registry-service';
import { getRuleTypeIcon } from '@/components/shared/assignment-rules-crud/columns';

import { RuleTypeFormDialog } from './rule-type-form-dialog';

export function RuleTypesDataTable() {
  const { ruleTypes, isLoading, refetch } = useAllRuleTypes();
  const { toggleActive, deleteRuleType, isToggling, isDeleting } =
    useRuleTypeMutations();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AssignmentRuleTypeRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<AssignmentRuleTypeRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggleActive = (row: AssignmentRuleTypeRow, next: boolean) => {
    setTogglingId(row.id);
    toggleActive.mutate(
      { id: row.id, isActive: next },
      { onSettled: () => setTogglingId(null) },
    );
  };

  const handleDelete = () => {
    if (!deletingRow) return;
    deleteRuleType.mutate(deletingRow.id, {
      onSuccess: () => setDeletingRow(null),
    });
  };

  const handleNew = () => {
    setEditingRow(null);
    setFormOpen(true);
  };

  const handleEdit = (row: AssignmentRuleTypeRow) => {
    setEditingRow(row);
    setFormOpen(true);
  };

  const handleFormSaved = () => {
    setFormOpen(false);
    setEditingRow(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Catalog of assignment-rule strategies surfaced by the rule-form picker
        when counselors create assignment rules. System rows (the original 6)
        cannot be deleted — deactivate them instead. Admin-created rows are
        free to delete.
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Rule Types</h2>
          <p className="text-xs text-muted-foreground">
            {ruleTypes ? `${ruleTypes.length} row${ruleTypes.length === 1 ? '' : 's'}` : '—'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" />
            New Rule Type
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : ruleTypes.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          No rule types yet. Run the migration{' '}
          <code className="rounded bg-muted px-1">
            20260510210001_create_assignment_rule_type_registry.sql
          </code>{' '}
          to seed the 6 system defaults, or click &ldquo;New Rule Type&rdquo;
          to create a custom one.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Display Label</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24">Sort</TableHead>
                <TableHead className="w-24">System</TableHead>
                <TableHead className="w-24">Active</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ruleTypes.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {getRuleTypeIcon(row.rule_type_key, row.icon_name)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.rule_type_key}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {row.display_label}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                    {row.description ?? <span className="italic">—</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.sort_order}</TableCell>
                  <TableCell>
                    {row.is_system ? (
                      <Badge variant="outline">System</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Custom</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.is_active}
                      disabled={togglingId === row.id || isToggling}
                      onCheckedChange={(v) => handleToggleActive(row, v)}
                      aria-label={`Toggle ${row.rule_type_key} active`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(row)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {row.is_system ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled
                                  aria-label="System type — deactivate instead of delete"
                                >
                                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              System type — deactivate instead of delete.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeletingRow(row)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RuleTypeFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingRow(null);
        }}
        ruleType={editingRow}
        onSaved={handleFormSaved}
      />

      <AlertDialog
        open={!!deletingRow}
        onOpenChange={(open) => {
          if (!open) setDeletingRow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule type?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingRow && (
                <>
                  Removes the &ldquo;{deletingRow.display_label}&rdquo; rule type
                  ({deletingRow.rule_type_key}). Existing assignment rules
                  whose virtual <code>type</code> resolves to this key will fall
                  through to a generic icon, but their criteria/action
                  routing is unaffected.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
