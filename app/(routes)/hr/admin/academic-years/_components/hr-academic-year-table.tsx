'use client';

import { useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useDeleteHRAcademicYear,
  useHRAcademicYearsWithUsage,
} from '@/hooks/hr/use-hr-academic-years';
import type { HRAcademicYear, HRAcademicYearWithUsage } from '@/types/hr-academic-years';
import { getErrorMessage, cn } from '@/lib/utils';
import { toast } from 'sonner';

import { HRAcademicYearFormDialog } from './hr-academic-year-form-dialog';

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

/** Today sits inside this year. Computed here rather than stored, so it can never go stale. */
function isCurrent(y: HRAcademicYear): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return y.is_active && y.start_date <= today && today <= y.end_date;
}

export function HRAcademicYearTable() {
  const { data: years = [], isLoading, isError, error } = useHRAcademicYearsWithUsage();
  const remove = useDeleteHRAcademicYear();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HRAcademicYear | null>(null);
  const [deleting, setDeleting] = useState<HRAcademicYearWithUsage | null>(null);

  const onAdd = () => { setEditing(null); setFormOpen(true); };
  const onEdit = (y: HRAcademicYear) => { setEditing(y); setFormOpen(true); };

  const onConfirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(`${deleting.year_name} deleted`);
      setDeleting(null);
    } catch (err) {
      // The service refuses before the database does, so this message names
      // the rows holding the year rather than reporting a 23503.
      toast.error(getErrorMessage(err));
    }
  };

  if (isError) {
    return <p className="text-sm text-destructive">{getErrorMessage(error)}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          One row per year, shared by every institution. Leave balances, applications
          and encashments are all keyed on these.
        </p>
        <Button size="sm" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add year
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Year</TableHead>
              <TableHead>Starts</TableHead>
              <TableHead>Ends</TableHead>
              <TableHead className="text-right">Balances</TableHead>
              <TableHead className="text-right">Applications</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}

            {!isLoading && years.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No HR academic years yet. Add one to enable leave balances.
                </TableCell>
              </TableRow>
            )}

            {years.map((y) => {
              const current = isCurrent(y);
              const inUse = y.balance_count > 0 || y.application_count > 0;
              return (
                <TableRow key={y.id}>
                  <TableCell className="font-medium">
                    {y.year_name}
                    {current && (
                      <Badge variant="outline" className="ml-2 border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-400">
                        Current
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(y.start_date)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(y.end_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {y.balance_count > 0 ? y.balance_count.toLocaleString('en-IN') : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {y.application_count > 0 ? y.application_count.toLocaleString('en-IN') : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-normal',
                        y.is_active
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'border-muted-foreground/30 bg-muted text-muted-foreground'
                      )}
                    >
                      {y.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions for {y.year_name}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(y)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={inUse}
                          onClick={() => setDeleting(y)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {inUse ? 'In use — cannot delete' : 'Delete'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <HRAcademicYearFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        year={editing}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.year_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Nothing references this year, so deleting it is safe. If you only want to
              stop it being offered for new leave, edit it and clear Active instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); onConfirmDelete(); }}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
