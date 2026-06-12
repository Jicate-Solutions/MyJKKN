'use client';

// accommodation-types-data-table.tsx
// Lookup admin for the global `accommodation_types` catalog (shared by all
// institutions since migration 20260610100000).

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Archive, RotateCcw, Plus } from 'lucide-react';

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
import { toast } from 'react-hot-toast';

import { LookupService } from '@/lib/services/admission/lookup-service';
import type { AdmissionFeeAccommodationType } from '@/types/admission';
import { AccommodationTypeFormDialog } from './accommodation-type-form-dialog';

export function AccommodationTypesDataTable() {
  const [rows, setRows] = useState<AdmissionFeeAccommodationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [dialogRow, setDialogRow] = useState<AdmissionFeeAccommodationType | null>(null);

  const [archiveTarget, setArchiveTarget] = useState<AdmissionFeeAccommodationType | null>(null);
  const [archiving, setArchiving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await LookupService.listAccommodationTypes(false);
      setRows(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load accommodation types';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const openCreate = () => {
    setDialogMode('create');
    setDialogRow(null);
    setDialogOpen(true);
  };

  const openEdit = (row: AdmissionFeeAccommodationType) => {
    setDialogMode('edit');
    setDialogRow(row);
    setDialogOpen(true);
  };

  const handleRestore = async (row: AdmissionFeeAccommodationType) => {
    try {
      await LookupService.updateAccommodationType(row.id, { is_active: true });
      toast.success(`Restored "${row.name}"`);
      await fetchRows();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore accommodation type';
      toast.error(message);
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await LookupService.archiveAccommodationType(archiveTarget.id);
      toast.success(`Archived "${archiveTarget.name}"`);
      setArchiveTarget(null);
      await fetchRows();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive accommodation type';
      toast.error(message);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <p className="text-xs text-muted-foreground">
          Accommodation types are shared by all institutions.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New Accommodation Type
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[110px]">Sort Order</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[160px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading accommodation types...
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No accommodation types yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.sort_order}</TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? 'default' : 'secondary'}>
                      {row.is_active ? 'Active' : 'Archived'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(row)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {row.is_active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setArchiveTarget(row)}
                          title="Archive"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(row)}
                          title="Restore"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AccommodationTypeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        initialValues={dialogRow}
        onSuccess={() => {
          setDialogOpen(false);
          void fetchRows();
        }}
      />

      <AlertDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Accommodation Type</AlertDialogTitle>
            <AlertDialogDescription>
              Archive &ldquo;{archiveTarget?.name}&rdquo;? It will be hidden from active
              dropdowns but existing references stay intact. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmArchive}
              disabled={archiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {archiving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Archiving...
                </>
              ) : (
                'Archive'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
