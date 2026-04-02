'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Calendar,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
  Loader2,
} from 'lucide-react';
import { useCASEBatches } from '@/hooks/vac/use-case';
import { CASEService } from '@/lib/services/vac/case-service';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { CASEBatch, CASEBatchStatus } from '@/types/case';

interface BatchListProps {
  institutionId: string;
}

const STATUS_COLORS: Record<CASEBatchStatus, string> = {
  planned: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  in_progress: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  completed: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const FORMAT_LABELS: Record<string, string> = {
  spread: 'Spread',
  moderate: 'Moderate',
  intensive: 'Intensive',
};

export function BatchList({ institutionId }: BatchListProps) {
  const router = useRouter();
  const { data: batches, isLoading, refetch } = useCASEBatches({ institution_id: institutionId });
  const [deleteTarget, setDeleteTarget] = useState<CASEBatch | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await CASEService.deleteBatch(deleteTarget.id);
      toast.success('Batch deleted');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete batch');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading batches...
      </div>
    );
  }

  const batchList = batches ?? [];

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Batches ({batchList.length})</h3>
        <Button size="sm" onClick={() => router.push('/vac/admin/case/batches/new')}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Batch
        </Button>
      </div>

      {batchList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No batches created yet. Click &quot;New Batch&quot; to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {batchList.map((batch) => (
            <Card key={batch.id} className="relative">
              <CardContent className="pt-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-sm">
                      {batch.batch_code || 'Unnamed Batch'}
                    </p>
                    <Badge
                      variant="outline"
                      className={`mt-1 capitalize text-xs ${STATUS_COLORS[batch.status] ?? ''}`}
                    >
                      {batch.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => router.push(`/vac/admin/case/batches/${batch.id}/edit`)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(batch)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Details */}
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {FORMAT_LABELS[batch.delivery_format] ?? batch.delivery_format}
                    </Badge>
                  </div>

                  {(batch.start_date || batch.end_date) && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {batch.start_date
                          ? format(new Date(batch.start_date), 'dd MMM')
                          : '?'}{' '}
                        -{' '}
                        {batch.end_date
                          ? format(new Date(batch.end_date), 'dd MMM yyyy')
                          : '?'}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      {batch.current_enrollment} / {batch.max_capacity} enrolled
                    </span>
                  </div>

                  {/* Capacity bar */}
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(
                          (batch.current_enrollment / batch.max_capacity) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete batch &quot;{deleteTarget?.batch_code}&quot;?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
