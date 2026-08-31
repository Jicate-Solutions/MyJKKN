'use client';

// Course Events — the Packages tab body (Phase 2b Task 5).
//
// A plain list rendered from useCoursePackages, deliberately NOT a DataTable.
// DataTable in fetchDataFn mode registers no cached query, so its refresh bridge
// never fires on invalidateQueries and it needs a page-local counter folded into
// refetchKey (see hooks/events/use-general-events.ts and the /courses list page).
// A list backed by a real React Query hook has none of that problem, and this
// tab shows a handful of pricing tiers, not a paginated dataset.
//
// Every mutation is gated on courses.packages.manage. Reads are gated by RLS on
// courses.view, which the tab's parent page has already required.

import { useState } from 'react';
import { IndianRupee, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/lib/utils';
import { isWindowOpen } from '@/lib/services/courses/application-window';

/** timestamptz → a short local date+time. Matches how the sale window is
 *  entered (datetime-local), so the admin recognises the value they typed. */
const formatSaleDate = (value: string | null | undefined) => {
  if (!value) return 'an unset date';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'an invalid date';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};
import {
  useCoursePackages, useDeleteCoursePackage, useSaveCoursePackage,
} from '@/hooks/courses/use-course-packages';
import type { CoursePackage, SaveCoursePackageDto } from '@/types/courses';
import { PackageForm } from './package-form';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const formatDate = (value: string | null | undefined) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function PackagesPanel({ courseEventId }: { courseEventId: string }) {
  const { canAccess } = usePermissions();
  const canManage = canAccess('courses', 'packages.manage');

  const { data: packages, isLoading, isError, error } = useCoursePackages(courseEventId);
  const savePackage = useSaveCoursePackage();
  const deletePackage = useDeleteCoursePackage();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CoursePackage | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CoursePackage | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (pkg: CoursePackage) => {
    setEditing(pkg);
    setFormOpen(true);
  };

  const handleSubmit = (dto: SaveCoursePackageDto) => {
    savePackage.mutate(dto, { onSuccess: () => setFormOpen(false) });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Could not load packages. {getErrorMessage(error)}
        </CardContent>
      </Card>
    );
  }

  const list = packages ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          What a participant buys, and the schedule their bills are raised on.
        </p>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add package
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No packages yet. A course cannot be applied for until it has at least one.
            </p>
            {canManage && (
              <Button variant="outline" className="mt-4" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add the first package
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((pkg) => {
            const installments = pkg.installments ?? [];
            // A package outside its sale window is invisible to the public —
            // toPublicPackages filters on exactly this. Until it was badged
            // here, an expired tier looked identical to a live one in the
            // console: an admin created a package, saw it listed, and could not
            // understand why the apply page offered no choice.
            const onSale = pkg.is_active && isWindowOpen(pkg.sale_opens_at, pkg.sale_closes_at);
            const notYetOnSale =
              pkg.is_active &&
              Boolean(pkg.sale_opens_at) &&
              new Date(pkg.sale_opens_at!) > new Date();
            return (
              <Card key={pkg.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{pkg.name}</h3>
                        {!pkg.is_active && (
                          <Badge variant="outline" className="text-[10px]">
                            Retired
                          </Badge>
                        )}
                        {pkg.is_active && !onSale && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-[10px] text-amber-700 dark:border-amber-800 dark:text-amber-400"
                          >
                            {notYetOnSale ? 'Sale not started' : 'Sale ended'}
                          </Badge>
                        )}
                      </div>

                      {/* The dates, not just the state — "Sale ended" without
                          saying when leaves the admin guessing which field to
                          edit. */}
                      {pkg.is_active && !onSale && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Not shown on the public page.{' '}
                          {notYetOnSale
                            ? `Sale opens ${formatSaleDate(pkg.sale_opens_at)}.`
                            : `Sale closed ${formatSaleDate(pkg.sale_closes_at)}.`}{' '}
                          Clear the sale dates to keep it always on sale.
                        </p>
                      )}
                      {pkg.description && (
                        <p className="whitespace-pre-line text-sm text-muted-foreground">
                          {pkg.description}
                        </p>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(pkg)}
                          aria-label={`Edit ${pkg.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingDelete(pkg)}
                          aria-label={`Delete ${pkg.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <IndianRupee className="h-4 w-4 text-muted-foreground" />
                      {inr.format(Number(pkg.total_amount))}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {pkg.seat_cap ? `${pkg.seat_cap} seats` : 'Unlimited seats'}
                    </span>
                    <span className="text-muted-foreground">
                      {installments.length === 0
                        ? 'Payable in full — no schedule'
                        : `${installments.length} instalment${installments.length === 1 ? '' : 's'}`}
                    </span>
                  </div>

                  {installments.length > 0 && (
                    <ul className="divide-y rounded-md border text-sm">
                      {installments.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                          <span className="min-w-0 truncate">
                            <span className="text-muted-foreground">#{i.installment_no}</span>{' '}
                            {i.label || `Instalment ${i.installment_no}`}
                          </span>
                          <span className="flex shrink-0 items-center gap-4">
                            <span className="text-muted-foreground">{formatDate(i.due_date)}</span>
                            <span className="font-medium">{inr.format(Number(i.amount))}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* key remounts the form so defaultValues re-initialise when switching
          between Add and Edit, or between two different packages. */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add a package'}</DialogTitle>
          </DialogHeader>
          <PackageForm
            key={editing?.id ?? 'new'}
            courseEventId={courseEventId}
            editing={editing}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
            submitting={savePackage.isPending}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this package?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{pendingDelete?.name}</span> and its
              instalment schedule will be permanently deleted. A package that people are already
              enrolled on cannot be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deletePackage.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
              disabled={deletePackage.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePackage.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete package'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
