'use client';

/**
 * Create / edit dialog for a calendar_entries row.
 *
 * Extracted from holidays-admin.tsx, which had it inline and had grown past the
 * point where the table and the form could be read separately.
 *
 * THE FLEX SHELL ON DialogContent IS LOAD-BEARING. The primitive sets no
 * max-height and no overflow, so this form — eight fields plus a scrolling
 * institution list — put Save below the fold on a laptop with no way to reach
 * it. The header and footer stay pinned; only the field body scrolls.
 *
 * Dates are written as UTC day boundaries (`all_day: true`). Building them from
 * local time would store the previous day for every IST user, which is the
 * off-by-one already recorded against the calendar grid's all-day rendering.
 */

import moment from 'moment';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type {
  CalendarCategory,
  CalendarEntry,
  CalendarEntryKind,
  CreateCalendarEntryInput,
} from '@/types/calendar';

export interface HolidayFormState {
  id?: string;
  kind: CalendarEntryKind;
  title: string;
  description: string;
  category_id: string;
  start_date: string;
  end_date: string;
  blocks_attendance: boolean;
  is_active: boolean;
  scope: 'all' | 'specific';
  scope_institution_ids: string[];
}

export const EMPTY_HOLIDAY_FORM: HolidayFormState = {
  kind: 'holiday',
  title: '',
  description: '',
  category_id: '',
  start_date: moment().format('YYYY-MM-DD'),
  end_date: moment().format('YYYY-MM-DD'),
  blocks_attendance: true,
  is_active: true,
  scope: 'all',
  scope_institution_ids: [],
};

export function entryToForm(e: CalendarEntry): HolidayFormState {
  return {
    id: e.id,
    kind: e.kind,
    title: e.title,
    description: e.description ?? '',
    category_id: e.category_id ?? '',
    start_date: moment.utc(e.start_at).format('YYYY-MM-DD'),
    end_date: moment.utc(e.end_at).format('YYYY-MM-DD'),
    blocks_attendance: e.blocks_attendance,
    is_active: e.is_active,
    scope:
      e.scope_institution_ids && e.scope_institution_ids.length ? 'specific' : 'all',
    scope_institution_ids: e.scope_institution_ids ?? [],
  };
}

export function formToPayload(f: HolidayFormState): CreateCalendarEntryInput {
  return {
    kind: f.kind,
    title: f.title.trim(),
    description: f.description || null,
    category_id: f.category_id || null,
    start_at: moment.utc(f.start_date).startOf('day').toISOString(),
    end_at: moment.utc(f.end_date).endOf('day').toISOString(),
    all_day: true,
    blocks_attendance: f.kind === 'holiday' ? f.blocks_attendance : false,
    is_active: f.is_active,
    scope_institution_ids: f.scope === 'all' ? null : f.scope_institution_ids,
  };
}

/**
 * FULLY CONTROLLED — the draft lives in the parent, not here.
 *
 * The obvious alternative (seed `useState` from a prop, resync in an effect)
 * is what this component started as, and `react-hooks/set-state-in-effect`
 * rejects it: the dialog stays mounted between opens, so the effect is the only
 * thing that would stop "Edit" on a second row from showing the first row's
 * values — a cascading render doing work the parent can just do directly.
 */
export function HolidayEntryDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  categories,
  institutions,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: HolidayFormState;
  onFormChange: (next: HolidayFormState) => void;
  categories: CalendarCategory[];
  institutions: { id: string; name: string }[];
  saving: boolean;
  onSave: (form: HolidayFormState) => void;
}) {
  const set = (patch: Partial<HolidayFormState>) => onFormChange({ ...form, ...patch });

  const toggleInstitution = (id: string) =>
    set({
      scope_institution_ids: form.scope_institution_ids.includes(id)
        ? form.scope_institution_ids.filter((x) => x !== id)
        : [...form.scope_institution_ids, id],
    });

  // End before start silently produces a range that matches nothing downstream,
  // so it is caught here rather than written.
  const invalidRange = Boolean(
    form.start_date && form.end_date && form.end_date < form.start_date
  );
  const noInstitutions = form.scope === 'specific' && form.scope_institution_ids.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg'>
        {/* pr-10 clears DialogContent's built-in close ✕ (absolute right-4
            top-4), which p-0 would otherwise let the title run under. */}
        <DialogHeader className='border-b px-6 py-4 pr-10'>
          <DialogTitle>{form.id ? 'Edit' : 'New'} entry</DialogTitle>
        </DialogHeader>

        <div className='space-y-3 overflow-y-auto px-6 py-4'>
          <div>
            <Label>Kind</Label>
            <Select
              value={form.kind}
              onValueChange={(v) => set({ kind: v as CalendarEntryKind })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='holiday'>Holiday</SelectItem>
                <SelectItem value='event'>Event</SelectItem>
                <SelectItem value='meeting'>Meeting</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <Label>Start date</Label>
              <Input
                type='date'
                value={form.start_date}
                onChange={(e) => set({ start_date: e.target.value })}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type='date'
                value={form.end_date}
                onChange={(e) => set({ end_date: e.target.value })}
              />
            </div>
          </div>
          {invalidRange && (
            <p className='text-xs text-destructive'>End date cannot be before the start date.</p>
          )}

          <div>
            <Label>Category</Label>
            <Select
              value={form.category_id || 'none'}
              onValueChange={(v) => set({ category_id: v === 'none' ? '' : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select…' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='none'>— none —</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Scope</Label>
            <Select
              value={form.scope}
              onValueChange={(v) => set({ scope: v as 'all' | 'specific' })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All institutions (common)</SelectItem>
                <SelectItem value='specific'>Specific institutions</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.scope === 'specific' && (
            <div className='max-h-40 space-y-1 overflow-y-auto rounded border p-2'>
              {institutions.map((inst) => (
                <label key={inst.id} className='flex items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    checked={form.scope_institution_ids.includes(inst.id)}
                    onChange={() => toggleInstitution(inst.id)}
                  />
                  {inst.name}
                </label>
              ))}
            </div>
          )}
          {noInstitutions && (
            <p className='text-xs text-destructive'>
              Pick at least one institution, or switch the scope back to common.
            </p>
          )}

          {form.kind === 'holiday' && (
            <div className='flex items-center justify-between'>
              <div>
                <Label>Blocks attendance</Label>
                <p className='text-xs text-muted-foreground'>
                  Suppresses attendance marking on these dates.
                </p>
              </div>
              <Switch
                checked={form.blocks_attendance}
                onCheckedChange={(v) => set({ blocks_attendance: v })}
              />
            </div>
          )}

          <div className='flex items-center justify-between'>
            <div>
              <Label>Active</Label>
              <p className='text-xs text-muted-foreground'>
                Inactive entries stay on record but drop off the calendar.
              </p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => set({ is_active: v })} />
          </div>
        </div>

        <DialogFooter className='border-t px-6 py-4'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={saving || !form.title.trim() || invalidRange || noInstitutions}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
