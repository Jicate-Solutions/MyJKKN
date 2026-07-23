'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, CopyX } from 'lucide-react';
import toast from 'react-hot-toast';
import { BugReport } from '@/types/bugs';
import {
  useDuplicateCandidates,
  useUpdateBugReportStatus
} from '@/hooks/bug-reports/use-bug-reports';

interface MarkDuplicateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The bug being marked as a duplicate. */
  sourceBug: Pick<BugReport, 'id' | 'display_id' | 'description' | 'module_name'> | null;
  /** Called after a successful mark (e.g. refetch stats). */
  onMarked?: () => void;
}

/**
 * Admin dialog: pick the canonical ("original") bug this report duplicates.
 * Candidates default to open bugs in the same module; typing searches
 * BUG-IDs and descriptions across all modules.
 */
export function MarkDuplicateDialog({
  open,
  onOpenChange,
  sourceBug,
  onMarked
}: MarkDuplicateDialogProps) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const updateStatusMutation = useUpdateBugReportStatus();

  // Debounce the candidate search 300ms behind typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset state whenever the dialog opens for a (new) bug
  useEffect(() => {
    if (open) {
      setSearchInput('');
      setDebouncedQ('');
      setSelectedId(null);
    }
  }, [open, sourceBug?.id]);

  const { data: candidates, isLoading } = useDuplicateCandidates(
    sourceBug?.id ?? null,
    debouncedQ,
    open
  );

  const handleConfirm = async () => {
    if (!sourceBug || !selectedId) return;
    try {
      await updateStatusMutation.mutateAsync({
        reportId: sourceBug.id,
        status: 'duplicate',
        duplicateOf: selectedId
      });
      const canonical = candidates?.find((c) => c.id === selectedId);
      toast.success(
        `${sourceBug.display_id} marked as duplicate of ${canonical?.display_id ?? 'the selected report'}.`
      );
      onOpenChange(false);
      onMarked?.();
    } catch (err: any) {
      toast.error(err?.message || 'Could not mark as duplicate.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <CopyX className='w-5 h-5' />
            Mark {sourceBug?.display_id} as a duplicate
          </DialogTitle>
          <DialogDescription>
            Pick the original report this bug duplicates. When the original is
            resolved, this report resolves automatically and its reporter is
            emailed.
          </DialogDescription>
        </DialogHeader>

        {sourceBug && (
          <p className='text-xs text-muted-foreground border rounded-md p-2 line-clamp-2'>
            {sourceBug.description}
          </p>
        )}

        <div className='relative'>
          <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search by BUG-ID or description (blank = same module)…'
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className='pl-8'
          />
        </div>

        <ScrollArea className='h-64 rounded-md border'>
          {isLoading ? (
            <div className='flex items-center justify-center h-24'>
              <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
            </div>
          ) : !candidates || candidates.length === 0 ? (
            <div className='p-4 text-sm text-muted-foreground text-center'>
              No open reports found{debouncedQ ? ` for “${debouncedQ}”` : ' in this module'}.
              Try searching by BUG-ID or a keyword.
            </div>
          ) : (
            <div className='divide-y'>
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type='button'
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-3 hover:bg-muted/60 transition-colors ${
                    selectedId === c.id ? 'bg-primary/10 ring-1 ring-primary/40' : ''
                  }`}
                >
                  <div className='flex items-center gap-2 flex-wrap'>
                    <span className='font-mono text-xs font-semibold'>
                      {c.display_id}
                    </span>
                    {c.module_name && (
                      <Badge variant='outline' className='text-[10px] px-1 py-0'>
                        {c.module_name}
                      </Badge>
                    )}
                    {(c.duplicate_count ?? 0) > 0 && (
                      <Badge
                        variant='outline'
                        className='text-[10px] px-1 py-0 border-purple-300 text-purple-700 dark:text-purple-300'
                      >
                        {c.duplicate_count} duplicate{(c.duplicate_count ?? 0) > 1 ? 's' : ''}
                      </Badge>
                    )}
                    <span className='text-[10px] text-muted-foreground ml-auto'>
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className='text-xs text-muted-foreground line-clamp-2 mt-1'>
                    {c.description}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedId || updateStatusMutation.isPending}
          >
            {updateStatusMutation.isPending ? (
              <Loader2 className='h-4 w-4 animate-spin mr-2' />
            ) : null}
            Mark as Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
