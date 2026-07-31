'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { ChevronDown, ChevronRight, Copy, Loader2, PencilLine, Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import type { BosBoardPso, BosMasterPso } from '@/types/bos';
import {
  OutcomeInput,
  useResetBoardPsos,
  useSaveBoardPsos,
} from '@/hooks/bos/use-bos-po-pso';
import { OutcomeListEditor, renumberOutcomes } from './outcome-list-editor';

interface BoardPsoCardProps {
  board: { id: string; board_code: string; board_name: string };
  institutionsId: string;
  regulationId: string;
  masterPsos: BosMasterPso[];
  overrideRows: BosBoardPso[];
  canEdit: boolean;
}

/**
 * One board's PSO panel. A board with no override rows INHERITS the
 * institution master PSO set; "Customize" seeds an editable copy of the
 * effective set and saves it as a board-level override. "Reset to Master"
 * deletes the override so inheritance resumes.
 */
export function BoardPsoCard({
  board,
  institutionsId,
  regulationId,
  masterPsos,
  overrideRows,
  canEdit,
}: BoardPsoCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [editRows, setEditRows] = useState<OutcomeInput[]>([]);

  const saveMutation = useSaveBoardPsos(institutionsId, regulationId);
  const resetMutation = useResetBoardPsos(institutionsId, regulationId);

  const hasOverride = overrideRows.length > 0;
  const effective: OutcomeInput[] = hasOverride
    ? overrideRows.map((r) => ({ code: r.pso_code, description: r.description ?? '' }))
    : masterPsos.map((r) => ({ code: r.pso_code, description: r.description ?? '' }));

  // One click copies the full effective set (= master when inheriting) into
  // the editor — the user never retypes the master PSOs to customize a board.
  const startEditing = () => {
    setEditRows(renumberOutcomes([...effective], 'PSO'));
    setIsEditing(true);
    setIsExpanded(true);
  };

  // Errors are toasted by each mutation's onError; catch here only to avoid
  // an unhandled rejection from the awaited mutateAsync.
  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({
        board_id: board.id,
        board_code: board.board_code,
        board_name: board.board_name,
        psos: editRows,
      });
      toast.success(`PSOs saved for ${board.board_name}`);
      setIsEditing(false);
    } catch {
      /* handled in onError */
    }
  };

  const handleReset = async () => {
    try {
      await resetMutation.mutateAsync(board.id);
      toast.success(`${board.board_name} now inherits the master PSOs`);
      setResetDialogOpen(false);
      setIsEditing(false);
    } catch {
      setResetDialogOpen(false);
    }
  };

  const psoCount = effective.length;

  return (
    <div className='border rounded-md overflow-hidden'>
      <div
        className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 bg-muted/40 cursor-pointer select-none'
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className='flex items-center gap-2 flex-wrap'>
          {isExpanded ? (
            <ChevronDown className='h-4 w-4 text-muted-foreground' />
          ) : (
            <ChevronRight className='h-4 w-4 text-muted-foreground' />
          )}
          <span className='font-medium text-sm'>{board.board_name}</span>
          {board.board_code && (
            <span className='text-xs text-muted-foreground'>({board.board_code})</span>
          )}
          <Badge
            variant={hasOverride ? 'default' : 'secondary'}
            className='text-xs'
          >
            {hasOverride ? 'Board-specific' : 'Inherited from master'}
          </Badge>
          <Badge variant='outline' className='text-xs'>
            {psoCount} PSO{psoCount !== 1 ? 's' : ''}
          </Badge>
        </div>

        {canEdit && (
          <div
            className='flex flex-wrap items-center gap-2'
            onClick={(e) => e.stopPropagation()}
          >
            {!isEditing && (
              <Button variant='outline' size='sm' className='h-7' onClick={startEditing}>
                {hasOverride ? (
                  <PencilLine className='h-3.5 w-3.5 mr-1' />
                ) : (
                  <Copy className='h-3.5 w-3.5 mr-1' />
                )}
                {hasOverride ? 'Edit' : 'Copy from Master'}
              </Button>
            )}
            {hasOverride && !isEditing && (
              <Button
                variant='ghost'
                size='sm'
                className='h-7 text-muted-foreground'
                onClick={() => setResetDialogOpen(true)}
              >
                <Undo2 className='h-3.5 w-3.5 mr-1' />
                Reset to Master
              </Button>
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <div className='p-4 space-y-3'>
          {isEditing ? (
            <>
              <p className='text-xs text-muted-foreground'>
                Saving creates a board-specific PSO set for {board.board_name}. The
                master defaults stay unchanged for other boards.
              </p>
              <OutcomeListEditor
                rows={editRows}
                codePrefix='PSO'
                canEdit
                onChange={setEditRows}
                placeholder='e.g. Design specialised software systems'
                emptyText='No PSOs — add the first one below.'
              />
              <div className='flex items-center gap-2'>
                <Button size='sm' onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className='h-3 w-3 mr-1 animate-spin' />
                  ) : (
                    <Save className='h-3 w-3 mr-1' />
                  )}
                  Save Board PSOs
                </Button>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => setIsEditing(false)}
                  disabled={saveMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              {effective.length === 0 && (
                <p className='text-xs text-muted-foreground text-center py-4'>
                  No PSOs configured — set master PSOs above
                  {canEdit ? ' or customize this board' : ''}.
                </p>
              )}
              {effective.map((row) => (
                <div key={row.code} className='rounded-md border p-3 space-y-1'>
                  <Badge variant='outline' className='font-mono text-xs'>
                    {row.code}
                  </Badge>
                  <p className='text-sm whitespace-pre-wrap'>
                    {row.description || (
                      <span className='text-muted-foreground italic'>No description</span>
                    )}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Master PSOs</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the board-specific PSO set for {board.board_name}. The board
              will inherit the institution master PSOs again. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              disabled={resetMutation.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {resetMutation.isPending ? 'Resetting…' : 'Reset'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
