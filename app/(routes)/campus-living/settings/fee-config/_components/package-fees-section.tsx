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
import { usePackageFees } from '@/hooks/campus-living/use-hostel-fees';
import { useActiveHostelYears } from '@/hooks/campus-living/use-hostel-years';
import { useAdmissionPackages } from '@/hooks/campus-living/use-admission-packages';
import { FEE_FREQUENCY_LABELS, type HostelFee } from '@/types/hostel-fees';
import { PackageFeeDialog } from './package-fee-dialog';

const formatCurrency = (amount: number) =>
  amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

interface Props {
  /** Default hostel year for new fees (from the page's year selector). */
  hostelYearId: string;
  canEdit: boolean;
}

export function PackageFeesSection({ hostelYearId, canEdit }: Props) {
  const { fees, loading, error, deleteFee } = usePackageFees();
  const { packages } = useAdmissionPackages({ is_active: true, limit: 1000 });
  const { hostelYears } = useActiveHostelYears();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HostelFee | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HostelFee | null>(null);

  const packageNameFor = (fee: HostelFee) =>
    (packages ?? []).find((p) => p.id === fee.package_id)?.name ?? '—';
  const yearNameFor = (fee: HostelFee) =>
    (hostelYears ?? []).find((y) => y.id === fee.hostel_year_id)?.name ?? '—';

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
          A single flat all-in fee per package (bundled room + mess), per hostel year. For a
          learner assigned to a package, this replaces summing the individual category fees.
        </p>
        {canEdit ? (
          <Button onClick={handleAdd} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Add Package Fee
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading package fees...
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load package fees</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : fees.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          No package fees yet.
          {canEdit ? ' Click "Add Package Fee" to add the first one.' : ''}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package</TableHead>
              <TableHead>Hostel Year</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Status</TableHead>
              {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {fees.map((fee) => (
              <TableRow key={fee.id}>
                <TableCell className="font-medium">{packageNameFor(fee)}</TableCell>
                <TableCell>{yearNameFor(fee)}</TableCell>
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

      <PackageFeeDialog
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
            <AlertDialogTitle>Delete package fee?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  This will permanently remove the{' '}
                  <span className="font-medium text-foreground">{packageNameFor(pendingDelete)}</span>{' '}
                  fee (<span className="font-medium text-foreground">{yearNameFor(pendingDelete)}</span>) of{' '}
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
