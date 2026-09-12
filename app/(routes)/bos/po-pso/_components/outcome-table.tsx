'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Loader2, PencilLine, Plus, Power, PowerOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  type OutcomeKind,
  type PoPsoScopeKey,
  useCreateOutcome,
  useUpdateOutcome,
} from '@/hooks/bos/use-bos-po-pso';

export interface OutcomeTableRow {
  id: string;
  code: string;
  description: string;
  is_active: boolean;
  updated_at?: string;
}

interface OutcomeTableProps {
  kind: OutcomeKind;
  rows: OutcomeTableRow[];
  canEdit: boolean;
  scopeKey: PoPsoScopeKey;
  placeholder: string;
}

const LABEL: Record<OutcomeKind, string> = { po: 'PO', pso: 'PSO' };

/**
 * Institution-wise PO / PSO table for the HOD — Code | Description | Status |
 * Action. Add assigns the next code server-side; Edit changes the
 * description; Deactivate / Reactivate flips is_active. Rows are NEVER
 * deleted — a deactivated outcome stays visible (muted) so its history and
 * any syllabus CO-PO cells that still reference it remain explainable.
 */
export function OutcomeTable({ kind, rows, canEdit, scopeKey, placeholder }: OutcomeTableProps) {
  const label = LABEL[kind];
  const create = useCreateOutcome(scopeKey);
  const update = useUpdateOutcome(scopeKey);

  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState('');
  const [editing, setEditing] = useState<OutcomeTableRow | null>(null);
  const [editText, setEditText] = useState('');
  const [toggling, setToggling] = useState<OutcomeTableRow | null>(null);

  const busy = create.isPending || update.isPending;

  const submitAdd = async () => {
    const description = addText.trim();
    if (!description) { toast.error('Enter a description'); return; }
    try {
      const row = await create.mutateAsync({ kind, description });
      const code = (row as Record<string, string>)[`${kind}_code`];
      toast.success(`${code ?? label} added`);
      setAddText('');
      setAddOpen(false);
    } catch { /* toasted in onError */ }
  };

  const submitEdit = async () => {
    if (!editing) return;
    const description = editText.trim();
    if (!description) { toast.error('Description cannot be empty'); return; }
    try {
      await update.mutateAsync({ kind, id: editing.id, description });
      toast.success(`${editing.code} updated`);
      setEditing(null);
    } catch { /* toasted in onError */ }
  };

  const submitToggle = async () => {
    if (!toggling) return;
    const next = !toggling.is_active;
    try {
      await update.mutateAsync({ kind, id: toggling.id, is_active: next });
      toast.success(`${toggling.code} ${next ? 'reactivated' : 'deactivated'}`);
      setToggling(null);
    } catch { setToggling(null); }
  };

  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-2 flex-wrap'>
        <p className='text-xs text-muted-foreground'>
          {activeCount} active {label}{activeCount !== 1 ? 's' : ''}
          {rows.length > activeCount && ` · ${rows.length - activeCount} inactive`}
        </p>
        {canEdit && (
          <Button size='sm' onClick={() => setAddOpen(true)} disabled={busy}>
            <Plus className='h-4 w-4 mr-1' />
            Add {label}
          </Button>
        )}
      </div>

      <div className='rounded-md border overflow-x-auto'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[90px]'>{label} Code</TableHead>
              <TableHead>{label} Description</TableHead>
              <TableHead className='w-[100px]'>Status</TableHead>
              {canEdit && <TableHead className='w-[180px] text-right'>Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 4 : 3} className='text-center text-sm text-muted-foreground py-8'>
                  {canEdit ? `No ${label}s yet. Click "Add ${label}" to enter the first one.` : `No ${label}s configured yet.`}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id} className={row.is_active ? undefined : 'opacity-60'}>
                <TableCell>
                  <Badge variant='outline' className='font-mono text-xs'>{row.code}</Badge>
                </TableCell>
                <TableCell className='text-sm whitespace-pre-wrap'>
                  {row.description || <span className='text-muted-foreground italic'>No description</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={row.is_active ? 'default' : 'secondary'} className='text-xs'>
                    {row.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                {canEdit && (
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button
                        variant='ghost' size='sm' className='h-7'
                        disabled={busy}
                        onClick={() => { setEditing(row); setEditText(row.description); }}
                      >
                        <PencilLine className='h-3.5 w-3.5 mr-1' />
                        Edit
                      </Button>
                      <Button
                        variant='ghost' size='sm'
                        className={`h-7 ${row.is_active ? 'text-destructive hover:text-destructive' : ''}`}
                        disabled={busy}
                        onClick={() => setToggling(row)}
                      >
                        {row.is_active ? (
                          <><PowerOff className='h-3.5 w-3.5 mr-1' />Deactivate</>
                        ) : (
                          <><Power className='h-3.5 w-3.5 mr-1' />Reactivate</>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!busy) setAddOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {label}</DialogTitle>
            <DialogDescription>
              The code is assigned automatically as the next {label} number for this programme and regulation.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor={`add-${kind}`}>{label} Description</Label>
            <Textarea
              id={`add-${kind}`}
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              placeholder={placeholder}
              rows={4}
              className='resize-none text-sm'
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant='ghost' onClick={() => setAddOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitAdd} disabled={busy}>
              {create.isPending && <Loader2 className='h-3 w-3 mr-1 animate-spin' />}
              Add {label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o && !busy) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editing?.code}</DialogTitle>
            <DialogDescription>
              The change is reflected wherever this {label} is used — compositions, learning pathway CO-PO matrices and reports.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor={`edit-${kind}`}>{label} Description</Label>
            <Textarea
              id={`edit-${kind}`}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder={placeholder}
              rows={4}
              className='resize-none text-sm'
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant='ghost' onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitEdit} disabled={busy}>
              {update.isPending && <Loader2 className='h-3 w-3 mr-1 animate-spin' />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate / Reactivate */}
      <AlertDialog open={!!toggling} onOpenChange={(o) => { if (!o && !busy) setToggling(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggling?.is_active ? `Deactivate ${toggling?.code}?` : `Reactivate ${toggling?.code}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggling?.is_active
                ? `${toggling.code} is hidden from new mappings and dropdowns but is NOT deleted — it stays here as Inactive and can be reactivated any time.`
                : `${toggling?.code} becomes available again for mappings and dropdowns.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={submitToggle}
              disabled={busy}
              className={toggling?.is_active ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            >
              {update.isPending ? 'Saving…' : toggling?.is_active ? 'Deactivate' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
