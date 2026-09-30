'use client';

// Admin-managed vacate checklist: ONE global list. Each vacate request gets a
// frozen copy of the active, reason-applicable items when it is submitted, so
// edits here never change a request already with the warden.

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import {
  useVacateChecklistItems,
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useReorderChecklistItems,
  useDeleteChecklistItem,
} from '@/hooks/campus-living/use-vacate-checklist';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { VACATE_REASONS, VACATE_REASON_LABELS } from '@/types/hostel-vacate';
import type { VacateChecklistItem, VacateReason } from '@/types/hostel-vacate';

interface FormState {
  item_label: string;
  description: string;
  is_required: boolean;
  applies_to_all: boolean;
  reasons: VacateReason[];
}

const EMPTY_FORM: FormState = {
  item_label: '',
  description: '',
  is_required: true,
  applies_to_all: true,
  reasons: [],
};

export default function VacateChecklistSettingsPage() {
  const { profile } = useAuth();
  const userId = profile?.id ?? '';

  const { data: items = [], isLoading, error } = useVacateChecklistItems();
  const createMut = useCreateChecklistItem();
  const updateMut = useUpdateChecklistItem();
  const reorderMut = useReorderChecklistItems();
  const deleteMut = useDeleteChecklistItem();
  const [deleting, setDeleting] = useState<VacateChecklistItem | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VacateChecklistItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(item: VacateChecklistItem) {
    setEditing(item);
    setForm({
      item_label: item.item_label,
      description: item.description ?? '',
      is_required: item.is_required,
      applies_to_all: !item.applies_to_reasons?.length,
      reasons: item.applies_to_reasons ?? [],
    });
    setDialogOpen(true);
  }

  const formValid =
    form.item_label.trim().length >= 3 && (form.applies_to_all || form.reasons.length > 0);

  async function handleSave() {
    if (!formValid || !userId) return;
    const input = {
      item_label: form.item_label,
      description: form.description,
      is_required: form.is_required,
      applies_to_reasons: form.applies_to_all ? null : form.reasons,
    };
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, input, userId });
    } else {
      // New items go to the end of the list.
      const last = items.reduce((m, i) => Math.max(m, i.sort_order), 0);
      await createMut.mutateAsync({ input: { ...input, sort_order: last + 10 }, userId });
    }
    setDialogOpen(false);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length || !userId) return;
    const ids = items.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorderMut.mutate({ orderedIds: ids, userId });
  }

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <ContentLayout title='Vacate Checklist'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Settings' },
          { label: 'Vacate Checklist' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Vacate Checklist</h1>
            <p className='text-sm text-muted-foreground max-w-2xl'>
              The warden ticks these before approving a hostel vacate. Required items must all be ticked.
              Changes apply to requests submitted from now on; requests already with the warden keep the
              list they were submitted with.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className='mr-2 h-4 w-4' />
            Add item
          </Button>
        </div>

        {isLoading ? (
          <div className='flex items-center justify-center min-h-[200px]'>
            <Loader2 className='h-8 w-8 animate-spin text-primary' />
          </div>
        ) : error ? (
          <Card className='border-destructive'>
            <CardContent className='p-4 text-sm text-destructive'>
              Failed to load: {(error as Error).message}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className='p-0 overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-[90px]'>Order</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Applies to</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={item.id} className={item.is_active ? '' : 'opacity-60'}>
                      <TableCell>
                        <div className='flex gap-1'>
                          <Button
                            size='icon'
                            variant='ghost'
                            className='h-7 w-7'
                            disabled={idx === 0 || reorderMut.isPending}
                            onClick={() => move(idx, -1)}
                            aria-label='Move up'
                          >
                            <ArrowUp className='h-3.5 w-3.5' />
                          </Button>
                          <Button
                            size='icon'
                            variant='ghost'
                            className='h-7 w-7'
                            disabled={idx === items.length - 1 || reorderMut.isPending}
                            onClick={() => move(idx, 1)}
                            aria-label='Move down'
                          >
                            <ArrowDown className='h-3.5 w-3.5' />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-col'>
                          <span className='text-sm font-medium'>{item.item_label}</span>
                          {item.description && (
                            <span className='text-xs text-muted-foreground'>{item.description}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.is_required ? (
                          <Badge variant='outline'>Required</Badge>
                        ) : (
                          <Badge variant='secondary'>Optional</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.applies_to_reasons?.length ? (
                          <div className='flex flex-wrap gap-1'>
                            {item.applies_to_reasons.map((r) => (
                              <Badge key={r} variant='outline' className='text-xs'>
                                {VACATE_REASON_LABELS[r]}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className='text-xs text-muted-foreground'>All reasons</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={item.is_active}
                          disabled={updateMut.isPending || !userId}
                          onCheckedChange={(v) =>
                            updateMut.mutate({ id: item.id, input: { is_active: v }, userId })
                          }
                          aria-label={`${item.item_label} active`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size='sm' variant='ghost' onClick={() => openEdit(item)}>
                          <Pencil className='mr-1 h-3.5 w-3.5' />
                          Edit
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='text-destructive hover:text-destructive'
                          onClick={() => setDeleting(item)}
                        >
                          <Trash2 className='mr-1 h-3.5 w-3.5' />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className='text-center py-10 text-muted-foreground'>
                        No checklist items yet. Add the first one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className='max-w-[440px]'>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.item_label}”?</DialogTitle>
            <DialogDescription>
              It is removed from the list for future requests. Requests already submitted keep their own
              copy of this item. To stop using it but keep it on the list, switch it off instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeleting(null)} disabled={deleteMut.isPending}>
              Cancel
            </Button>
            <Button
              variant='destructive'
              disabled={deleteMut.isPending}
              onClick={async () => {
                if (!deleting) return;
                await deleteMut.mutateAsync(deleting.id);
                setDeleting(null);
              }}
            >
              {deleteMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='max-w-[520px]'>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit checklist item' : 'Add checklist item'}</DialogTitle>
            <DialogDescription>
              Switch an item off to retire it, or delete it. Requests already submitted keep their own copy.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='item-label'>
                Item <span className='text-destructive'>*</span>
              </Label>
              <Input
                id='item-label'
                value={form.item_label}
                maxLength={200}
                onChange={(e) => setForm({ ...form, item_label: e.target.value })}
                placeholder='e.g. Room keys returned'
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='item-desc'>Guidance for the warden (optional)</Label>
              <Textarea
                id='item-desc'
                value={form.description}
                maxLength={1000}
                rows={2}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className='flex items-center justify-between rounded-md border p-3'>
              <div>
                <p className='text-sm font-medium'>Required</p>
                <p className='text-xs text-muted-foreground'>Approval is blocked until a required item is ticked.</p>
              </div>
              <Switch
                checked={form.is_required}
                onCheckedChange={(v) => setForm({ ...form, is_required: v })}
                aria-label='Required'
              />
            </div>

            <div className='space-y-2 rounded-md border p-3'>
              <div className='flex items-center justify-between'>
                <p className='text-sm font-medium'>Applies to every vacate reason</p>
                <Switch
                  checked={form.applies_to_all}
                  onCheckedChange={(v) => setForm({ ...form, applies_to_all: v })}
                  aria-label='Applies to all reasons'
                />
              </div>
              {!form.applies_to_all && (
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1'>
                  {VACATE_REASONS.map((r) => (
                    <label key={r} className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={form.reasons.includes(r)}
                        onCheckedChange={(v) =>
                          setForm({
                            ...form,
                            reasons: v ? [...form.reasons, r] : form.reasons.filter((x) => x !== r),
                          })
                        }
                      />
                      {VACATE_REASON_LABELS[r]}
                    </label>
                  ))}
                  {form.reasons.length === 0 && (
                    <p className='text-xs text-destructive sm:col-span-2'>Pick at least one reason.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formValid || saving}>
              {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {editing ? 'Save changes' : 'Add item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
