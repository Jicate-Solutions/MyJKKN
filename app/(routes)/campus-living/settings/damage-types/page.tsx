'use client';

// Admin-managed room damage types: ONE global list. The warden picks from the
// active types during a vacate inspection; the default amount pre-fills the fine.
// Types are never deleted (recorded damages keep a name snapshot) — switch off to retire.

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  useDamageTypes,
  useCreateDamageType,
  useUpdateDamageType,
} from '@/hooks/campus-living/use-damage-types';
import { Loader2, Pencil, Plus } from 'lucide-react';
import type { HostelDamageType } from '@/types/hostel-vacate';

interface FormState {
  name: string;
  default_amount: string;
  sort_order: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  default_amount: '0',
  sort_order: '0',
  is_active: true,
};

const formatInr = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function DamageTypesSettingsPage() {
  const { profile } = useAuth();
  const userId = profile?.id ?? '';

  const { data: items = [], isLoading, error } = useDamageTypes();
  const createMut = useCreateDamageType();
  const updateMut = useUpdateDamageType();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HostelDamageType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openCreate() {
    const last = items.reduce((m, i) => Math.max(m, i.sort_order), 0);
    setEditing(null);
    setForm({ ...EMPTY_FORM, sort_order: String(last + 10) });
    setDialogOpen(true);
  }

  function openEdit(item: HostelDamageType) {
    setEditing(item);
    setForm({
      name: item.name,
      default_amount: String(item.default_amount),
      sort_order: String(item.sort_order),
      is_active: item.is_active,
    });
    setDialogOpen(true);
  }

  const nameLen = form.name.trim().length;
  const amount = Number(form.default_amount);
  const sortOrder = Number(form.sort_order);
  const formValid =
    nameLen >= 2 &&
    nameLen <= 120 &&
    form.default_amount.trim() !== '' &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    form.sort_order.trim() !== '' &&
    Number.isInteger(sortOrder);

  async function handleSave() {
    if (!formValid || !userId) return;
    const input = {
      name: form.name.trim(),
      default_amount: amount,
      sort_order: sortOrder,
      is_active: form.is_active,
    };
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, input, userId });
    } else {
      await createMut.mutateAsync({ input, userId });
    }
    setDialogOpen(false);
  }

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <ContentLayout title='Damage Types'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Settings' },
          { label: 'Damage Types' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Damage Types</h1>
            <p className='text-sm text-muted-foreground max-w-2xl'>
              Room damage types the warden can pick during a vacate inspection, with a default fine amount.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className='mr-2 h-4 w-4' />
            Add damage type
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
                    <TableHead>Name</TableHead>
                    <TableHead>Default amount</TableHead>
                    <TableHead className='w-[90px]'>Order</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className={item.is_active ? '' : 'opacity-60'}>
                      <TableCell>
                        <span className='text-sm font-medium'>{item.name}</span>
                      </TableCell>
                      <TableCell className='text-sm'>{formatInr(item.default_amount)}</TableCell>
                      <TableCell className='text-sm'>{item.sort_order}</TableCell>
                      <TableCell>
                        <Switch
                          checked={item.is_active}
                          disabled={updateMut.isPending || !userId}
                          onCheckedChange={(v) =>
                            updateMut.mutate({ id: item.id, input: { is_active: v }, userId })
                          }
                          aria-label={`${item.name} active`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size='sm' variant='ghost' onClick={() => openEdit(item)}>
                          <Pencil className='mr-1 h-3.5 w-3.5' />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className='text-center py-10 text-muted-foreground'>
                        No damage types yet. Add the first one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='max-w-[520px]'>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit damage type' : 'Add damage type'}</DialogTitle>
            <DialogDescription>
              Switch a type off to retire it. Damages already recorded keep their own copy of the name.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='damage-name'>
                Name <span className='text-destructive'>*</span>
              </Label>
              <Input
                id='damage-name'
                value={form.name}
                maxLength={120}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder='e.g. Broken window pane'
              />
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='damage-amount'>
                  Default amount (₹) <span className='text-destructive'>*</span>
                </Label>
                <Input
                  id='damage-amount'
                  type='number'
                  min={0}
                  step='0.01'
                  value={form.default_amount}
                  onChange={(e) => setForm({ ...form, default_amount: e.target.value })}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='damage-order'>Sort order</Label>
                <Input
                  id='damage-order'
                  type='number'
                  step={1}
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                />
              </div>
            </div>

            <div className='flex items-center justify-between rounded-md border p-3'>
              <div>
                <p className='text-sm font-medium'>Active</p>
                <p className='text-xs text-muted-foreground'>Only active types appear in the warden's list.</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                aria-label='Active'
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formValid || saving}>
              {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {editing ? 'Save changes' : 'Add damage type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
