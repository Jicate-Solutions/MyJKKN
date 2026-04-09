'use client';

// app/(routes)/events/marathon/[id]/results/_components/import-gps-results.tsx
// GPS import dialog — shows available track count and triggers bulk import.
// Created: 2026-04-07

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Satellite, Loader2, CheckCircle2, AlertCircle, SkipForward } from 'lucide-react';
import { useGPSTrackCount, useImportFromGPS } from '@/hooks/events/marathon/use-marathon-results';
import type { ImportGPSResultsResponse } from '@/types/events-marathon';

// ============================================================================
// Props
// ============================================================================

interface ImportGPSResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
}

// ============================================================================
// Component
// ============================================================================

export function ImportGPSResultsDialog({
  open,
  onOpenChange,
  eventId,
}: ImportGPSResultsDialogProps) {
  const [importResult, setImportResult] = useState<ImportGPSResultsResponse | null>(null);

  const { data: trackCount, isLoading: countLoading } = useGPSTrackCount(eventId);
  const importMutation = useImportFromGPS();

  const handleImport = async () => {
    setImportResult(null);
    try {
      const result = await importMutation.mutateAsync(eventId);
      setImportResult(result);
    } catch {
      // Toast handled by mutation
    }
  };

  const handleClose = () => {
    setImportResult(null);
    onOpenChange(false);
  };

  const isPending = importMutation.isPending;
  const hasResult = importResult !== null;
  const available = trackCount ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Satellite className="h-4 w-4" />
            Import from GPS Tracking
          </DialogTitle>
          <DialogDescription>
            Automatically create result entries from GPS race tracking data.
            Existing results will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Available tracks */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Satellite className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">GPS Tracks Available</span>
            </div>
            {countLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Badge variant={available > 0 ? 'default' : 'secondary'}>
                {available} runner{available !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          {available === 0 && !countLoading && !hasResult && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No GPS tracks with elapsed time found. Ensure runners have completed
              tracking before importing.
            </p>
          )}

          {/* Import result summary */}
          {hasResult && (
            <div className="rounded-lg border divide-y">
              <div className="flex items-center gap-3 p-3">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Imported</p>
                  <p className="text-xs text-muted-foreground">New results created</p>
                </div>
                <Badge variant="default">{importResult.imported}</Badge>
              </div>
              <div className="flex items-center gap-3 p-3">
                <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Skipped</p>
                  <p className="text-xs text-muted-foreground">Result already exists</p>
                </div>
                <Badge variant="secondary">{importResult.skipped}</Badge>
              </div>
              {importResult.errors.length > 0 && (
                <div className="p-3 space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    <p className="text-sm font-medium text-destructive">
                      {importResult.errors.length} Error{importResult.errors.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ul className="space-y-0.5 pl-6">
                    {importResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        {err}
                      </li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li className="text-xs text-muted-foreground">
                        …and {importResult.errors.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            {hasResult ? 'Close' : 'Cancel'}
          </Button>
          {!hasResult && (
            <Button
              onClick={handleImport}
              disabled={isPending || available === 0 || countLoading}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Satellite className="h-4 w-4 mr-2" />
                  Import {available > 0 ? `${available} Track${available !== 1 ? 's' : ''}` : ''}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
