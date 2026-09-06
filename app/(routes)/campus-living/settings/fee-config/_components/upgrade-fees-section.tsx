'use client';

import { useMemo, useState } from 'react';
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
import { Plus, Edit, Trash2, Loader2, ArrowRight, Building2, UtensilsCrossed } from 'lucide-react';
import { useHostelUpgradeFees } from '@/hooks/campus-living/use-hostel-upgrade-fees';
import {
  UPGRADE_FEE_GENDER_LABELS,
  type UpgradeFeeRow,
} from '@/types/hostel-category-upgrade-fees';
import { UpgradeFeeDialog } from './upgrade-fee-dialog';

const inr = (n: number | null) =>
  n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

/** Payable after discount. net_amount is generated in Postgres; fall back to the
 *  gross so a row written before the discount migration still renders. */
const netOf = (r: UpgradeFeeRow) => r.net_amount ?? r.amount;

interface Props {
  hostelYearId: string;
  canEdit: boolean;
}

function UpgradeTable({
  title,
  icon,
  rows,
  canEdit,
  onEdit,
  onDelete,
  deletingId,
}: {
  title: string;
  icon: React.ReactNode;
  rows: UpgradeFeeRow[];
  canEdit: boolean;
  onEdit: (r: UpgradeFeeRow) => void;
  onDelete: (r: UpgradeFeeRow) => void;
  deletingId: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          No {title.toLowerCase()} configured for this hostel year.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From</TableHead>
              <TableHead className="w-8" />
              <TableHead>To</TableHead>
              <TableHead>Pay</TableHead>
              <TableHead>Status</TableHead>
              {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">
                    {r.from_name ?? '—'}
                    {r.from_type ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {UPGRADE_FEE_GENDER_LABELS[r.from_type]}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{inr(r.from_base_fee)}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <ArrowRight className="h-4 w-4" />
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    {r.to_name ?? '—'}
                    {r.to_type ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {UPGRADE_FEE_GENDER_LABELS[r.to_type]}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{inr(r.to_base_fee)}</div>
                </TableCell>
                <TableCell>
                  {netOf(r) < r.amount ? (
                    <div className="space-y-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs text-muted-foreground line-through">
                          {inr(r.amount)}
                        </span>
                        <span className="font-semibold">
                          {netOf(r) === 0 ? 'Free' : inr(netOf(r))}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-emerald-500 text-emerald-700 dark:text-emerald-400"
                      >
                        {r.discount_type === 'percent'
                          ? `${r.discount_value}% off`
                          : `${inr(r.amount - netOf(r))} off`}
                      </Badge>
                    </div>
                  ) : (
                    <span className="font-semibold">{inr(r.amount)}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={r.is_active ? 'default' : 'outline'}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(r)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(r)}
                        disabled={deletingId === r.id}
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
    </div>
  );
}

export function UpgradeFeesSection({ hostelYearId, canEdit }: Props) {
  const { rows, loading, error, deleteFee } = useHostelUpgradeFees(hostelYearId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UpgradeFeeRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UpgradeFeeRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const roomRows = useMemo(() => rows.filter((r) => r.kind === 'room'), [rows]);
  const messRows = useMemo(() => rows.filter((r) => r.kind === 'mess'), [rows]);

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const handleEdit = (r: UpgradeFeeRow) => {
    setEditing(r);
    setDialogOpen(true);
  };
  const confirmDelete = async () => {
    if (!pendingDelete || deletingId) return;
    setDeletingId(pendingDelete.id);
    try {
      await deleteFee(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      // toast handled upstream
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Explicit payment to move a resident from one category to a higher one. Shown in My
          Hostel as the upgrade options. Unconfigured pairs fall back to the fee difference.
        </p>
        {canEdit ? (
          <Button onClick={handleAdd} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Add Upgrade Fee
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading upgrade fees...
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load upgrade fees</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <UpgradeTable
            title="Upgrade Room"
            icon={<Building2 className="h-4 w-4 text-primary" />}
            rows={roomRows}
            canEdit={canEdit}
            onEdit={handleEdit}
            onDelete={setPendingDelete}
            deletingId={deletingId}
          />
          <UpgradeTable
            title="Upgrade Mess"
            icon={<UtensilsCrossed className="h-4 w-4 text-primary" />}
            rows={messRows}
            canEdit={canEdit}
            onEdit={handleEdit}
            onDelete={setPendingDelete}
            deletingId={deletingId}
          />
        </>
      )}

      <UpgradeFeeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={editing ? 'edit' : 'create'}
        hostelYearId={hostelYearId}
        row={editing}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deletingId) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete upgrade fee?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  This removes the{' '}
                  <span className="font-medium text-foreground">
                    {pendingDelete.from_name} → {pendingDelete.to_name}
                  </span>{' '}
                  upgrade fee of{' '}
                  <span className="font-medium text-foreground">
                    {inr(netOf(pendingDelete))}
                  </span>
                  .
                  Residents upgrading this pair will then fall back to the fee difference. This
                  cannot be undone.
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
