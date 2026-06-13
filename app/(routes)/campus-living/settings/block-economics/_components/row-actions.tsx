'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MoreHorizontal, Pencil, EyeOff, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBlockEconomics } from '@/hooks/campus-living/use-block-economics';
import type { BlockEconomicsEntry } from '@/lib/services/campus-living/block-economics-service';
import { BlockEconomicsFormDialog } from './block-economics-form-dialog';

interface BlockEconomicsRowActionsProps {
  entry: BlockEconomicsEntry;
}

export function BlockEconomicsRowActions({
  entry,
}: BlockEconomicsRowActionsProps) {
  const { disableEntry, enableEntry } = useBlockEconomics();
  const [showEdit, setShowEdit] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);

  const isActive = entry.is_active;

  const handleToggle = async () => {
    if (!reason.trim()) return;
    try {
      setWorking(true);
      if (isActive) {
        await disableEntry(entry.id, reason.trim());
        toast.success('Cost entry disabled');
      } else {
        await enableEntry(entry.id, reason.trim());
        toast.success('Cost entry re-enabled');
      }
      setShowToggle(false);
      setReason('');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to update cost entry'
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='icon' className='h-8 w-8'>
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => setShowEdit(true)}>
            <Pencil className='h-4 w-4 mr-2' />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setReason('');
              setShowToggle(true);
            }}
            className={isActive ? 'text-destructive focus:text-destructive' : ''}
          >
            {isActive ? (
              <>
                <EyeOff className='h-4 w-4 mr-2' />
                Disable
              </>
            ) : (
              <>
                <Eye className='h-4 w-4 mr-2' />
                Re-enable
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BlockEconomicsFormDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        mode='edit'
        entry={entry}
      />

      <AlertDialog open={showToggle} onOpenChange={setShowToggle}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isActive ? 'Disable cost entry' : 'Re-enable cost entry'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? 'This entry stops feeding the dashboard cost figures. The record is kept (with full history) — nothing is deleted, so you can re-enable it later.'
                : 'This entry starts feeding the dashboard cost figures again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className='space-y-2'>
            <Label htmlFor='toggle-reason'>Reason</Label>
            <Textarea
              id='toggle-reason'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isActive
                  ? 'e.g. duplicate of the new combined housekeeping entry.'
                  : 'e.g. cost is back in effect this year.'
              }
              className='min-h-[60px] resize-none'
            />
            <p className='text-xs text-muted-foreground'>
              Required — saved to the audit trail.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleToggle}
              disabled={working || !reason.trim()}
              variant={isActive ? 'destructive' : 'default'}
            >
              {working && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
              {isActive ? 'Disable' : 'Re-enable'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
