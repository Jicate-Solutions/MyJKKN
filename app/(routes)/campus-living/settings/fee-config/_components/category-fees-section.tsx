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
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { useHostelCategoryFees } from '@/hooks/campus-living/use-hostel-category-fees';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import { useActiveAmenitiesCategories } from '@/hooks/campus-living/use-amenities-categories';
import {
  CATEGORY_KIND_LABELS,
  FEE_FREQUENCY_LABELS,
  getCategoryId,
  getCategoryKind,
  type HostelCategoryFee,
} from '@/types/hostel-category-fees';
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
  const { fees, loading, error, deleteFee } = useHostelCategoryFees(hostelYearId);
  const { hostelCategories } = useActiveHostelCategories();
  const { messCategories } = useActiveMessCategories();
  const { amenitiesCategories } = useActiveAmenitiesCategories();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HostelCategoryFee | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const nameFor = (fee: HostelCategoryFee) => {
    const kind = getCategoryKind(fee);
    const id = getCategoryId(fee);
    const list =
      kind === 'hostel_room'
        ? hostelCategories
        : kind === 'mess'
        ? messCategories
        : amenitiesCategories;
    return list.find((c) => c.id === id)?.name ?? '—';
  };

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const handleEdit = (fee: HostelCategoryFee) => {
    setEditing(fee);
    setDialogOpen(true);
  };
  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this category fee? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteFee(id);
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
          Individual fees per hostel room / mess / amenity category. A learner&apos;s hostel
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
                  <Badge variant="outline">{CATEGORY_KIND_LABELS[getCategoryKind(fee)]}</Badge>
                </TableCell>
                <TableCell className="font-medium">{nameFor(fee)}</TableCell>
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
                        onClick={() => handleDelete(fee.id)}
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
    </div>
  );
}
