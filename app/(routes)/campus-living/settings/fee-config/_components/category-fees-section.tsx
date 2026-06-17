'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { useHostelFees } from '@/hooks/campus-living/use-hostel-fees';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import {
  FEE_TARGET_LABELS,
  FEE_FREQUENCY_LABELS,
  getFeeTargetId,
  getFeeTargetKind,
  type HostelFee,
} from '@/types/hostel-fees';
// Hostel + mess category type unions/labels are identical ('boys'|'girls'|'mixed'),
// so one label map renders the gender for either kind of row.
import { HOSTEL_CATEGORY_TYPE_LABELS } from '@/types/hostel-categories';
import { CategoryFeeDialog } from './category-fee-dialog';

const formatCurrency = (amount: number) =>
  amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

interface Props {
  hostelYearId: string;
  canEdit: boolean;
}

export function CategoryFeesSection({ hostelYearId, canEdit }: Props) {
  const { fees: allFees, loading, error, deleteFee } = useHostelFees(hostelYearId);
  // This section manages room/mess category fees only; package fees live in their own tab.
  const fees = allFees.filter((f) => !f.package_id);
  const { hostelCategories } = useActiveHostelCategories();
  const { messCategories } = useActiveMessCategories();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HostelFee | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HostelFee | null>(null);

  const nameFor = (fee: HostelFee) => {
    const kind = getFeeTargetKind(fee);
    const id = getFeeTargetId(fee);
    const list = kind === 'hostel_room' ? hostelCategories : messCategories;
    return list.find((c) => c.id === id)?.name ?? '—';
  };

  // Boys/Girls of the targeted category — categories are gender-typed, so the same
  // name (e.g. "Classic Room") appears once per hostel type.
  const typeLabelFor = (fee: HostelFee) => {
    const kind = getFeeTargetKind(fee);
    const id = getFeeTargetId(fee);
    const list = kind === 'hostel_room' ? hostelCategories : messCategories;
    const t = list.find((c) => c.id === id)?.type;
    return t ? HOSTEL_CATEGORY_TYPE_LABELS[t] : null;
  };

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const handleEdit = (fee: HostelFee) => {
    setEditing(fee);
    setDialogOpen(true);
  };
  const confirmDelete = async () => {
    if (!pendingDelete || deletingId) return;
    const id = pendingDelete.id;
    setDeletingId(id);
    try {
      await deleteFee(id);
      setPendingDelete(null);
    } catch {
      // error toast handled upstream
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Individual fees per hostel room / mess category. A learner&apos;s hostel
          total is the sum of their selected categories. Shared across all institutions.
        </p>
        {canEdit ? (
          <Button onClick={handleAdd} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Add Category Fee
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading category fees...
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load category fees</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : fees.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          No category fees for this hostel year yet.
          {canEdit ? ' Click "Add Category Fee" to add the first one.' : ''}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Hostel Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Status</TableHead>
              {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {fees.map((fee) => (
              <TableRow key={fee.id}>
                <TableCell>
                  <Badge variant="outline">{FEE_TARGET_LABELS[getFeeTargetKind(fee)]}</Badge>
                </TableCell>
                <TableCell className="font-medium">{nameFor(fee)}</TableCell>
                <TableCell>
                  {typeLabelFor(fee) ? (
                    <Badge variant="outline">{typeLabelFor(fee)}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{formatCurrency(fee.amount)}</TableCell>
                <TableCell>{FEE_FREQUENCY_LABELS[fee.frequency]}</TableCell>
                <TableCell>
                  <Badge variant={fee.is_active ? 'default' : 'outline'}>
                    {fee.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(fee)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(fee)}
                        disabled={deletingId === fee.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CategoryFeeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={editing ? 'edit' : 'create'}
        hostelYearId={hostelYearId}
        fee={editing}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deletingId) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category fee?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  This will permanently remove the{' '}
                  <span className="font-medium text-foreground">{nameFor(pendingDelete)}</span>{' '}
                  fee of{' '}
                  <span className="font-medium text-foreground">
                    {formatCurrency(pendingDelete.amount)}
                  </span>
                  . This action cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={!!deletingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
