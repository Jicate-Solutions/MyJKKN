'use client';

import { useState } from 'react';
import { CloudDownload, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface SyncResult {
  synced: number;
  created: number | null;
  updated: number | null;
  errors: string[];
  message: string;
}

interface PreviewData {
  total: number;
}

export function SyncFromJkknButton() {
  const [isOpen, setIsOpen]           = useState(false);
  const [isFetching, setIsFetching]   = useState(false);
  const [isSyncing, setIsSyncing]     = useState(false);
  const [preview, setPreview]         = useState<PreviewData | null>(null);
  const [result, setResult]           = useState<SyncResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Fetch a 1-record page just to get the total count from metadata
  const fetchPreview = async () => {
    setIsFetching(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/jkkn/learners?limit=1&page=1');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to fetch preview from JKKN');
      }
      const total: number =
        data?.metadata?.total ?? data?.pagination?.total ?? 0;
      setPreview({ total });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reach JKKN API';
      setPreviewError(msg);
    } finally {
      setIsFetching(false);
    }
  };

  const handleDialogOpen = async (open: boolean) => {
    setIsOpen(open);
    if (open && !preview && !previewError) {
      await fetchPreview();
    }
    if (!open) {
      resetDialog();
    }
  };

  const handleImport = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/learners/sync-from-jkkn', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(
            'You do not have permission to import learner profiles. Contact your administrator.'
          );
        }
        if (res.status === 401) {
          throw new Error('Please log in to continue.');
        }
        throw new Error(data?.error ?? 'Sync failed');
      }

      setResult(data as SyncResult);
      toast.success(`Synced ${data.synced} learner records from JKKN`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      toast.error(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const resetDialog = () => {
    setPreview(null);
    setResult(null);
    setPreviewError(null);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm' className='gap-2'>
          <CloudDownload className='h-4 w-4' />
          Import from JKKN
        </Button>
      </DialogTrigger>

      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>Import Learners from JKKN</DialogTitle>
          <DialogDescription>
            Pull all learner records from the JKKN central system and upsert
            them into the local database.
          </DialogDescription>
        </DialogHeader>

        {/* Loading preview */}
        {isFetching && (
          <div className='flex items-center justify-center py-8 gap-2'>
            <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
            <span className='text-sm text-muted-foreground'>
              Fetching preview from JKKN…
            </span>
          </div>
        )}

        {/* Preview error */}
        {!isFetching && previewError && (
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Could not reach JKKN API</AlertTitle>
            <AlertDescription>{previewError}</AlertDescription>
          </Alert>
        )}

        {/* Preview ready — show count + warnings */}
        {!isFetching && preview && !result && (
          <div className='space-y-3'>
            <Alert>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>Ready to import</AlertTitle>
              <AlertDescription>
                <strong>{preview.total.toLocaleString()} learners</strong> found
                in JKKN. This will create or update matching records in the
                local database.
              </AlertDescription>
            </Alert>

            <Alert>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>Skeleton records</AlertTitle>
              <AlertDescription>
                Personal details (religion, community, address, marks) are{' '}
                <strong>not</strong> stored in JKKN and will be left blank.
                Imported profiles will have{' '}
                <em>is_profile_complete = false</em> — admins must fill in
                personal details separately.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Result */}
        {result && (
          <Alert className='border-green-200 bg-green-50'>
            <CheckCircle className='h-4 w-4 text-green-600' />
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription>
              <div className='space-y-1 mt-1 text-sm'>
                <div>
                  Records synced:{' '}
                  <strong className='text-green-700'>
                    {result.synced.toLocaleString()}
                  </strong>
                </div>
                {result.errors.length > 0 && (
                  <div className='text-red-600 mt-2'>
                    <strong>{result.errors.length} batch error(s):</strong>
                    <ul className='list-disc list-inside mt-1 space-y-0.5'>
                      {result.errors.map((e, i) => (
                        <li key={i} className='text-xs'>
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={resetDialog} disabled={isSyncing}>
            {result ? 'Close' : 'Cancel'}
          </Button>

          {!result && preview && !previewError && (
            <Button
              onClick={handleImport}
              disabled={isSyncing || isFetching}
              className='gap-2'
            >
              {isSyncing ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  Importing…
                </>
              ) : (
                <>
                  <CloudDownload className='h-4 w-4' />
                  Import All ({preview.total.toLocaleString()})
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
