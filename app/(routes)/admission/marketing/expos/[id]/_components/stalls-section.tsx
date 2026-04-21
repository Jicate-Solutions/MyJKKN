'use client';

// BUG-003146: Grid of stalls for a given expo event, with create/edit/delete.
// Rendered inside the expo detail page under a "Stalls" tab.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  Plus,
  Edit,
  Trash2,
  Store,
  IndianRupee,
  UserCheck,
  Loader2,
  Image as ImageIcon,
  Package,
} from 'lucide-react';
import { useStallsByEvent, useDeleteStall, useStallLeadCount } from '@/hooks/admission/use-stalls';
import { StallFormDialog } from './stall-form-dialog';
import type { ExpoEventStall } from '@/types/admission';

interface StallsSectionProps {
  expoEventId: string;
  defaultInstitutionId?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function StallLeadCountBadge({ stallId }: { stallId: string }) {
  const { count, isLoading } = useStallLeadCount(stallId);
  if (isLoading) {
    return <Skeleton className="h-4 w-12" />;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <UserCheck className="h-3.5 w-3.5 text-green-600" />
      <span className="font-medium">{count}</span>
      <span className="text-muted-foreground">lead{count === 1 ? '' : 's'}</span>
    </span>
  );
}

function StallCard({
  stall,
  onEdit,
  onDelete,
}: {
  stall: ExpoEventStall;
  onEdit: (s: ExpoEventStall) => void;
  onDelete: (s: ExpoEventStall) => void;
}) {
  const photoCount = stall.photos?.length ?? 0;
  const materialCount = stall.promotional_materials?.length ?? 0;
  const staffName = stall.assigned_staff?.full_name ?? null;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{stall.stall_name}</CardTitle>
            {staffName ? (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                Lead: {staffName}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1 italic">
                No staff assigned
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(stall)}
              aria-label="Edit stall"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(stall)}
              aria-label="Delete stall"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-2.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <IndianRupee className="h-3.5 w-3.5" />
            Expenses
          </span>
          <span className="font-medium">{formatCurrency(stall.total_expenses ?? 0)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Leads attributed</span>
          <StallLeadCountBadge stallId={stall.id} />
        </div>

        {(photoCount > 0 || materialCount > 0) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {photoCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <ImageIcon className="h-3 w-3" />
                {photoCount} photo{photoCount === 1 ? '' : 's'}
              </Badge>
            )}
            {materialCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Package className="h-3 w-3" />
                {materialCount} material{materialCount === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        )}

        {stall.notes && (
          <p className="text-xs text-muted-foreground pt-1 line-clamp-2 border-t mt-2">
            {stall.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function StallsSection({ expoEventId, defaultInstitutionId }: StallsSectionProps) {
  const { stalls, isLoading } = useStallsByEvent(expoEventId);
  const deleteStall = useDeleteStall();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStall, setEditingStall] = useState<ExpoEventStall | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExpoEventStall | null>(null);

  function openCreate() {
    setEditingStall(null);
    setDialogOpen(true);
  }

  function openEdit(stall: ExpoEventStall) {
    setEditingStall(stall);
    setDialogOpen(true);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteStall.mutate(
      { id: pendingDelete.id, eventId: pendingDelete.expo_event_id },
      { onSuccess: () => setPendingDelete(null) }
    );
  }

  const totalStallExpenses = stalls.reduce(
    (sum, s) => sum + (Number(s.total_expenses) || 0),
    0
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Stalls
              {stalls.length > 0 && (
                <Badge variant="secondary" className="ml-1.5">
                  {stalls.length}
                </Badge>
              )}
            </CardTitle>
            {stalls.length > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                {stalls.length} stall{stalls.length === 1 ? '' : 's'} · total stall
                expenses {formatCurrency(totalStallExpenses)}
              </p>
            )}
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Stall
          </Button>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-44 w-full" />
              ))}
            </div>
          ) : stalls.length === 0 ? (
            <div className="text-center py-10">
              <Store className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                No stalls yet. Create a stall per institution or per booth so expenses
                and leads can be attributed to the right team.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Stall
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {stalls.map((stall) => (
                <StallCard
                  key={stall.id}
                  stall={stall}
                  onEdit={openEdit}
                  onDelete={(s) => setPendingDelete(s)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <StallFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expoEventId={expoEventId}
        defaultInstitutionId={defaultInstitutionId}
        stall={editingStall}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this stall?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{pendingDelete?.stall_name}</span> will be
              removed. Any leads already attributed to this stall will stay in the
              system but will no longer be linked to a stall.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteStall.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteStall.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteStall.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete Stall'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
