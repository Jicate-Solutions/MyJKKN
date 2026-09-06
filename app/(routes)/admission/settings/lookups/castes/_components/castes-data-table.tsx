'use client';

// castes-data-table.tsx
// Lookup admin for the global `castes` table (child of community_categories).
// Mirrors community-categories-data-table.tsx with a community filter + parent
// community column. Castes are fetched per selected community to stay light.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Archive, RotateCcw, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { CasteService, type Caste } from '@/lib/services/admission/caste-service';
import { CasteFormDialog } from './caste-form-dialog';

interface CommunityOption {
  id: string;
  name: string;
  code: string;
}

export function CastesDataTable() {
  const [communities, setCommunities] = useState<CommunityOption[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<string>('');

  const [rows, setRows] = useState<Caste[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [dialogRow, setDialogRow] = useState<Caste | null>(null);

  const [archiveTarget, setArchiveTarget] = useState<Caste | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Load communities once for the filter + form parent selector.
  useEffect(() => {
    LookupService.listCommunityCategories(false)
      .then((data) => {
        const opts = data.map((c) => ({ id: c.id, name: c.name, code: c.code }));
        setCommunities(opts);
        // Default the filter to the first community that has a caste list.
        if (opts.length > 0 && !selectedCommunity) setSelectedCommunity(opts[0].id);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load communities';
        toast.error(message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRows = useCallback(async () => {
    if (!selectedCommunity) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await CasteService.listByCommunity(selectedCommunity, false);
      setRows(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load castes';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [selectedCommunity]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const openCreate = () => {
    setDialogMode('create');
    setDialogRow(null);
    setDialogOpen(true);
  };

  const openEdit = (row: Caste) => {
    setDialogMode('edit');
    setDialogRow(row);
    setDialogOpen(true);
  };

  const handleRestore = async (row: Caste) => {
    try {
      await CasteService.update(row.id, { is_active: true });
      toast.success(`Restored "${row.name}"`);
      await fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore caste');
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await CasteService.archive(archiveTarget.id);
      toast.success(`Archived "${archiveTarget.name}"`);
      setArchiveTarget(null);
      await fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive caste');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Castes under</p>
          <Select value={selectedCommunity} onValueChange={setSelectedCommunity}>
            <SelectTrigger className="w-full sm:w-[260px] max-w-full">
              <SelectValue placeholder="Select community" />
            </SelectTrigger>
            <SelectContent>
              {communities.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={openCreate} disabled={!selectedCommunity}>
          <Plus className="h-4 w-4 mr-1" />
          New Caste
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Aliases</TableHead>
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
                    Loading castes...
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
                  No castes for this community yet. Click &ldquo;New Caste&rdquo; to add one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate">
                    {(row.aliases ?? []).join(', ') || '—'}
                  </TableCell>
                  <TableCell>{row.sort_order}</TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? 'default' : 'secondary'}>
                      {row.is_active ? 'Active' : 'Archived'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)} title="Edit">
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

      <CasteFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        initialValues={dialogRow}
        communities={communities}
        defaultCommunityId={selectedCommunity}
        onSuccess={() => {
          setDialogOpen(false);
          void fetchRows();
        }}
      />

      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Caste</AlertDialogTitle>
            <AlertDialogDescription>
              Archive &ldquo;{archiveTarget?.name}&rdquo;? It will be hidden from active dropdowns
              but existing references stay intact. You can restore it later.
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
