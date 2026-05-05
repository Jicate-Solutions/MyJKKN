'use client';

// dqr-mapping-table.tsx
// Lists pending data_quality_review rows and provides Map / Ignore actions.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Wand2, EyeOff } from 'lucide-react';

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

import { DqrService, type DqrRow } from '@/lib/services/admission/dqr-service';
import { MapRowDialog } from './map-row-dialog';

export function DqrMappingTable() {
  const [rows, setRows] = useState<DqrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mapTarget, setMapTarget] = useState<DqrRow | null>(null);
  const [ignoreTarget, setIgnoreTarget] = useState<DqrRow | null>(null);
  const [ignoring, setIgnoring] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await DqrService.listPending();
      setRows(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load DQR rows';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const handleConfirmIgnore = async () => {
    if (!ignoreTarget) return;
    setIgnoring(true);
    try {
      await DqrService.ignore(ignoreTarget.id);
      toast.success('Marked as ignored');
      setIgnoreTarget(null);
      await fetchRows();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to ignore DQR row';
      toast.error(message);
    } finally {
      setIgnoring(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Observed lookup values from production data that don&rsquo;t yet match a canonical
            lookup. Map each one to a canonical value, or ignore it (e.g. obvious typos).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{rows.length} pending</Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchRows()}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Observed Value</TableHead>
              <TableHead className="w-[120px]">Occurrences</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[180px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading DQR rows...
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
                  No pending DQR rows. Everything is mapped or ignored.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-mono text-xs">
                      {row.table_name}.<span className="font-semibold">{row.column_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {row.observed_value}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {row.occurrence_count}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">Pending</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setMapTarget(row)}
                      >
                        <Wand2 className="h-3 w-3 mr-1" />
                        Map
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIgnoreTarget(row)}
                      >
                        <EyeOff className="h-3 w-3 mr-1" />
                        Ignore
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {mapTarget && (
        <MapRowDialog
          open={!!mapTarget}
          onOpenChange={(open) => !open && setMapTarget(null)}
          row={mapTarget}
          onSuccess={() => {
            setMapTarget(null);
            void fetchRows();
          }}
        />
      )}

      <AlertDialog
        open={!!ignoreTarget}
        onOpenChange={(open) => !open && setIgnoreTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ignore DQR Row</AlertDialogTitle>
            <AlertDialogDescription>
              Mark &ldquo;{ignoreTarget?.observed_value}&rdquo; (from{' '}
              {ignoreTarget?.table_name}.{ignoreTarget?.column_name}) as ignored?
              The row will be removed from the pending queue but the underlying data
              is left untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ignoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmIgnore} disabled={ignoring}>
              {ignoring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ignoring...
                </>
              ) : (
                'Ignore'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
