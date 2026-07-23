'use client';

// app/(routes)/bos/sop/_components/sop-version-history.tsx
//
// Dialog listing every snapshot in bos_sop_versions for a document. Users can
// view a snapshot (read-only render of that version's content) or restore it
// (which replaces the current content and creates a new "Restored from vN"
// snapshot — non-destructive).

import { useState } from 'react';
import { format } from 'date-fns';
import { History, RotateCcw, Eye } from 'lucide-react';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBosSopVersions, useRestoreBosSopVersion,
} from '@/hooks/bos/use-bos-sop';
import { BosSopService } from '@/lib/services/bos/bos-sop-service';
import type { BosSopVersion } from '@/types/bos-sop';
import { sopJsonToHtml } from '@/lib/sop/render';

export interface SopVersionHistoryProps {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SopVersionHistory({ documentId, open, onOpenChange }: SopVersionHistoryProps) {
  const { data: versions, isLoading } = useBosSopVersions(open ? documentId : undefined);
  const restore = useRestoreBosSopVersion();
  const [previewing, setPreviewing] = useState<BosSopVersion | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadPreview = async (versionNo: number) => {
    setPreviewLoading(true);
    try {
      const v = await BosSopService.getVersion(documentId, versionNo);
      setPreviewing(v);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <History className='h-4 w-4' />
            Version History
          </DialogTitle>
        </DialogHeader>

        {previewing ? (
          <div className='space-y-3'>
            <div className='text-sm text-muted-foreground flex items-center justify-between'>
              <span>Preview: v{previewing.version_no} · {format(new Date(previewing.created_at), 'dd MMM yyyy HH:mm')}</span>
              <Button size='sm' variant='ghost' onClick={() => setPreviewing(null)}>← Back to list</Button>
            </div>
            <div
              className='prose max-w-none border rounded p-4 max-h-[55vh] overflow-y-auto bg-white dark:bg-zinc-900'
              dangerouslySetInnerHTML={{ __html: sopJsonToHtml(previewing.content) }}
            />
            <DialogFooter>
              <Button
                onClick={async () => {
                  if (!window.confirm(`Restore document to v${previewing.version_no}? Current state will be saved as a new snapshot.`)) return;
                  await restore.mutateAsync({ id: documentId, versionNo: previewing.version_no });
                  setPreviewing(null);
                  onOpenChange(false);
                }}
                disabled={restore.isPending}
              >
                <RotateCcw className='h-4 w-4 mr-1' />
                {restore.isPending ? 'Restoring…' : `Restore v${previewing.version_no}`}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className='max-h-[60vh] overflow-y-auto space-y-2'>
            {isLoading ? (
              <>
                <Skeleton className='h-12 w-full' />
                <Skeleton className='h-12 w-full' />
              </>
            ) : (versions ?? []).length === 0 ? (
              <div className='text-center py-8 text-sm text-muted-foreground'>
                No version history yet.
              </div>
            ) : (
              (versions ?? []).map((v) => (
                <div
                  key={v.id}
                  className='flex items-center justify-between gap-3 rounded border p-3 hover:bg-muted/50 transition-colors'
                >
                  <div className='flex-1 min-w-0'>
                    <div className='font-medium text-sm'>Version {v.version_no}</div>
                    <div className='text-xs text-muted-foreground'>
                      {format(new Date(v.created_at), 'dd MMM yyyy HH:mm')}
                      {v.note && <span className='ml-2 italic'>“{v.note}”</span>}
                    </div>
                  </div>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={previewLoading}
                    onClick={() => loadPreview(v.version_no)}
                  >
                    <Eye className='h-3 w-3 mr-1' /> Preview
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
