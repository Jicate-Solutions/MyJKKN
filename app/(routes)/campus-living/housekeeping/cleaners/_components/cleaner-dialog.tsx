'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import {
  useCreateCleaner,
  useUpdateCleaner,
} from '@/hooks/campus-living/use-housekeeping-cleaners';
import type { Cleaner } from '@/types/campus-living/housekeeping';

/**
 * Working days are stored as POSTGRES DOW: 0 = Sunday .. 6 = Saturday, the same
 * convention as hostel_cleaning_availability.weekday and EXTRACT(DOW FROM ...).
 * They are DISPLAYED Monday-first for readability. An off-by-one here would
 * silently make cleaners un-assignable on the wrong day, surfacing only as
 * `cleaner_not_working` from fn_cl_housekeeping_assign.
 */
const DOW_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const EMPTY = {
  full_name: '',
  phone: '',
  gender: '' as '' | 'Male' | 'Female' | 'Other',
  employee_code: '',
  working_days: [1, 2, 3, 4, 5, 6],
  shift_start: '',
  shift_end: '',
  is_active: true,
  notes: '',
  block_ids: [] as string[],
};

interface Props {
  mode: 'create' | 'edit';
  cleaner?: Cleaner | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultInstitutionId?: string;
}

export function CleanerDialog({
  mode,
  cleaner,
  open,
  onOpenChange,
  defaultInstitutionId,
}: Props) {
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  // State is INITIALISED from props, never synced from them in an effect: the
  // page keys this dialog on the cleaner id, so editing a different cleaner
  // mounts a fresh component. An effect that reset state on open would cascade
  // a render every time the dialog appeared.
  const [institutionId, setInstitutionId] = useState<string>(
    mode === 'edit' && cleaner ? cleaner.institution_id : defaultInstitutionId ?? '',
  );
  const [form, setForm] = useState(() =>
    mode === 'edit' && cleaner
      ? {
          full_name: cleaner.full_name,
          phone: cleaner.phone ?? '',
          gender: (cleaner.gender ?? '') as '' | 'Male' | 'Female' | 'Other',
          employee_code: cleaner.employee_code ?? '',
          working_days: cleaner.working_days ?? [],
          shift_start: cleaner.shift_start?.slice(0, 5) ?? '',
          shift_end: cleaner.shift_end?.slice(0, 5) ?? '',
          is_active: cleaner.is_active,
          notes: cleaner.notes ?? '',
          block_ids: cleaner.block_ids ?? [],
        }
      : { ...EMPTY },
  );

  const create = useCreateCleaner();
  const update = useUpdateCleaner();

  const { data: blocksData } = useHostelBlocks(institutionId);
  const blocks: any[] = (blocksData as any)?.data ?? [];

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleDay = (dow: number) =>
    set(
      'working_days',
      form.working_days.includes(dow)
        ? form.working_days.filter((d) => d !== dow)
        : [...form.working_days, dow].sort(),
    );

  const toggleBlock = (id: string) =>
    set(
      'block_ids',
      form.block_ids.includes(id)
        ? form.block_ids.filter((b) => b !== id)
        : [...form.block_ids, id],
    );

  const canSave =
    form.full_name.trim().length > 0 && (mode === 'edit' || institutionId.length > 0);

  function handleSave() {
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      gender: form.gender || null,
      employee_code: form.employee_code.trim() || null,
      working_days: form.working_days,
      shift_start: form.shift_start || null,
      shift_end: form.shift_end || null,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
      block_ids: form.block_ids,
    };

    if (mode === 'edit' && cleaner) {
      update.mutate(
        { cleanerId: cleaner.id, dto: payload },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate(
        { institution_id: institutionId, ...payload },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent has no max-height in this repo. min-h-0 AND
          overflow-y-auto must be on the SAME element or the body paints over
          the footer. */}
      <DialogContent className='flex max-h-[85vh] flex-col sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit cleaner' : 'Add a cleaner'}</DialogTitle>
          <DialogDescription>
            Cleaners are directory records. They do not log in — the warden assigns them and
            records the work.
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto pr-1'>
          {mode === 'create' && (
            <div className='space-y-2'>
              <Label>Institution *</Label>
              <Select
                value={institutionId}
                onValueChange={setInstitutionId}
                disabled={institutionsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Choose an institution' />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst: any) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='cleaner-name'>Full name *</Label>
            <Input
              id='cleaner-name'
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
            />
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='cleaner-phone'>Phone</Label>
              <Input
                id='cleaner-phone'
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label>Gender</Label>
              <Select
                value={form.gender}
                onValueChange={(v) => set('gender', v as 'Male' | 'Female' | 'Other')}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Not specified' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='Male'>Male</SelectItem>
                  <SelectItem value='Female'>Female</SelectItem>
                  <SelectItem value='Other'>Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='grid gap-3 sm:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='cleaner-code'>Employee code</Label>
              <Input
                id='cleaner-code'
                value={form.employee_code}
                onChange={(e) => set('employee_code', e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='shift-start'>Shift start</Label>
              <Input
                id='shift-start'
                type='time'
                value={form.shift_start}
                onChange={(e) => set('shift_start', e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='shift-end'>Shift end</Label>
              <Input
                id='shift-end'
                type='time'
                value={form.shift_end}
                onChange={(e) => set('shift_end', e.target.value)}
              />
            </div>
          </div>

          <div className='space-y-2'>
            <Label>Working days</Label>
            <div className='flex flex-wrap gap-2'>
              {DOW_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type='button'
                  onClick={() => toggleDay(d.value)}
                  className={[
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    form.working_days.includes(d.value)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  ].join(' ')}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {form.working_days.length === 0 && (
              <p className='text-sm text-destructive'>
                No working days selected — this cleaner cannot be assigned to any job.
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <Label>Blocks served</Label>
            {!institutionId && (
              <p className='text-sm text-muted-foreground'>
                Choose an institution first to list its blocks.
              </p>
            )}
            <div className='space-y-1.5'>
              {blocks.map((b) => (
                <label key={b.id} className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={form.block_ids.includes(b.id)}
                    onCheckedChange={() => toggleBlock(b.id)}
                  />
                  {b.name}
                </label>
              ))}
            </div>
            {form.block_ids.length === 0 && (
              <p className='flex items-start gap-1.5 text-sm text-destructive'>
                <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                Assign at least one block, or this cleaner cannot be given any job.
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='cleaner-notes'>Notes</Label>
            <Textarea
              id='cleaner-notes'
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          <div className='flex items-center gap-2'>
            <Switch
              id='cleaner-active'
              checked={form.is_active}
              onCheckedChange={(v) => set('is_active', v)}
            />
            <Label htmlFor='cleaner-active'>Active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || pending} onClick={handleSave}>
            {pending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add cleaner'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
