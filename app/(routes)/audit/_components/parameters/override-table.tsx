'use client';

// Table of per-institution overrides for one parameter code.
// Rows: institution_name, evidence count, default_owner_role, P1/P2 SLA, active,
//       [Edit] [Delete].
// Institution name is resolved client-side from the overrides rows; we fetch
// the institution dictionary in the page and pass it down — keeps this table
// a pure renderer.

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeleteOverride } from '@/hooks/audit/use-parameter-overrides';
import type { AuditParameterCatalogRow } from '@/lib/types/audit';

interface OverrideTableProps {
  code: string;
  overrides: AuditParameterCatalogRow[];
  institutionNameById: Map<string, string>;
  onEdit: (row: AuditParameterCatalogRow) => void;
}

export function OverrideTable({
  code,
  overrides,
  institutionNameById,
  onEdit,
}: OverrideTableProps) {
  const [pendingDelete, setPendingDelete] =
    useState<AuditParameterCatalogRow | null>(null);
  const deleteMutation = useDeleteOverride({ code });

  const handleDelete = async () => {
    if (!pendingDelete?.institution_id) return;
    try {
      await deleteMutation.mutateAsync(pendingDelete.institution_id);
      toast.success('Override deleted');
      setPendingDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete override');
    }
  };

  if (overrides.length === 0) {
    return (
      <div className='rounded-md border border-dashed p-8 text-center'>
        <p className='text-sm text-muted-foreground'>
          No institution-specific overrides yet. Use{' '}
          <span className='font-semibold'>Add Override</span> to create one.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Institution</TableHead>
              <TableHead className='text-center'>Evidence</TableHead>
              <TableHead>Owner Role</TableHead>
              <TableHead className='text-center'>P1 SLA</TableHead>
              <TableHead className='text-center'>P2 SLA</TableHead>
              <TableHead className='text-center'>Status</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overrides.map((row) => {
              const institutionName =
                (row.institution_id && institutionNameById.get(row.institution_id)) ||
                row.institution_id ||
                '—';
              const evidenceCount = (row.evidence_required ?? []).length;
              return (
                <TableRow key={row.id}>
                  <TableCell className='font-medium'>{institutionName}</TableCell>
                  <TableCell className='text-center'>{evidenceCount}</TableCell>
                  <TableCell className='font-mono text-xs'>
                    {row.default_owner_role}
                  </TableCell>
                  <TableCell className='text-center text-red-600 font-semibold'>
                    {row.p1_sla_days}d
                  </TableCell>
                  <TableCell className='text-center text-amber-600 font-semibold'>
                    {row.p2_sla_days}d
                  </TableCell>
                  <TableCell className='text-center'>
                    {row.is_active ? (
                      <Badge variant='default' className='text-xs'>
                        Active
                      </Badge>
                    ) : (
                      <Badge variant='outline' className='text-xs'>
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button
                        size='icon'
                        variant='ghost'
                        onClick={() => onEdit(row)}
                        aria-label='Edit override'
                      >
                        <Pencil className='h-4 w-4' />
                      </Button>
                      <Button
                        size='icon'
                        variant='ghost'
                        onClick={() => setPendingDelete(row)}
                        aria-label='Delete override'
                      >
                        <Trash2 className='h-4 w-4 text-destructive' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete override?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the institution-specific override for{' '}
              <span className='font-semibold'>
                {pendingDelete?.institution_id
                  ? institutionNameById.get(pendingDelete.institution_id) ??
                    pendingDelete.institution_id
                  : 'this institution'}
              </span>
              . The institution will fall back to the system default for{' '}
              <code className='font-mono text-xs'>{code}</code>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className='h-4 w-4 mr-2 animate-spin' />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
