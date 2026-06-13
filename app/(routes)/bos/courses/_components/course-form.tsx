'use client';

import * as React from 'react';
import { useEffect } from 'react';
import { useForm, Controller, type UseFormReturn, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  courseFormSchema,
  COURSE_PART_VALUES,
  COURSE_CATEGORY_VALUES,
  COURSE_TYPE_VALUES,
  COURSE_LEVEL_VALUES,
  type CourseFormInput,
} from '@/lib/services/bos/courses-schemas';
import { useCourseTypeOptions } from '@/hooks/bos/use-course-types';
import type { BosBoard } from '@/types/bos';

interface Props {
  defaultValues?: Partial<CourseFormInput>;
  boards?: BosBoard[];                 // Required for save (Zod blocks if missing); shown as a select
  boardsLoading?: boolean;
  onSubmit: (values: CourseFormInput) => Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
  /**
   * When set, the inner Board picker is hidden and `form.board_id` is kept
   * synced to this value. Used by the New Course page where Board is already
   * picked in the outer scope strip — avoids two redundant Board pickers and
   * the mismatch risk between them.
   */
  lockedBoardId?: string;
}

export function CourseForm({ defaultValues, boards, boardsLoading, onSubmit, submitting, submitLabel = 'Save', lockedBoardId }: Props) {
  // Live course_type list from COE — falls back to the bundled list while loading
  // or on outage so the form is never blocked.
  const courseTypesQ = useCourseTypeOptions();
  const courseTypeOptions: readonly string[] =
    courseTypesQ.options.length > 0 ? courseTypesQ.options : COURSE_TYPE_VALUES;

  // Sort boards by COE's board_order ascending; nulls/undefined sink to the bottom.
  // Memoize so the searchable list isn't re-sorted on every keystroke.
  const boardOptions = React.useMemo(() => {
    const list = boards ? [...boards] : [];
    list.sort((a, b) => {
      const ao = a.board_order ?? Number.POSITIVE_INFINITY;
      const bo = b.board_order ?? Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      return a.board_code.localeCompare(b.board_code);
    });
    return list.map((b) => ({
      value: b.id,
      label: b.board_name ? `${b.board_code} — ${b.board_name}` : b.board_code,
    }));
  }, [boards]);

  const form = useForm<CourseFormInput>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      course_code: '',
      course_name: '',
      course_category: 'Theory',
      // course_part_master and course_type intentionally omitted — PG / non-tiered
      // courses don't carry a Part or Type, so blank is the safer default.
      // Both schema entries are optional.
      // course_level intentionally omitted — some courses genuinely have no
      // Roman-numeral tier, so blank is the right default. The schema is now
      // optional, so submitting without a Level is valid.
      exam_duration: 3,
      credit: 3,
      theory_hours: 0,
      practical_hours: 0,
      internal_max_mark: 25,
      external_max_mark: 75,
      total_max_mark: 100,
      ...defaultValues,
      // lockedBoardId wins over any defaultValues.board_id — the scope-strip
      // picker is the single source of truth on the New Course page.
      ...(lockedBoardId ? { board_id: lockedBoardId } : {}),
    },
  });

  // Keep form.board_id synced when the scope-strip Board changes after mount.
  // react-hook-form's defaultValues only apply on initial mount, so without
  // this hook a user who picks Board A, opens the form, then switches to
  // Board B in the scope strip would silently submit with Board A.
  useEffect(() => {
    if (lockedBoardId) {
      form.setValue('board_id', lockedBoardId, { shouldDirty: false, shouldValidate: true });
    }
  }, [lockedBoardId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-compute total_max_mark from internal + external.
  const internal = form.watch('internal_max_mark');
  const external = form.watch('external_max_mark');
  useEffect(() => {
    form.setValue(
      'total_max_mark',
      Number(internal || 0) + Number(external || 0),
      { shouldValidate: false },
    );
  }, [internal, external]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6 max-w-3xl'>
      <fieldset className='space-y-3 rounded-lg border p-4'>
        <legend className='px-2 text-sm font-semibold'>Identity</legend>
        {!lockedBoardId && (
          // When lockedBoardId is provided (New Course page), the outer scope
          // strip is the single source of truth for Board — see lockedBoardId
          // prop docs. Edit page leaves this picker visible so users can
          // reassign the board.
          <div className='grid grid-cols-2 gap-3'>
            <Field label='Board' required error={form.formState.errors.board_id?.message}>
              <SearchableSelect
                value={form.watch('board_id') ?? ''}
                onValueChange={(v) =>
                  form.setValue('board_id', v, { shouldValidate: true, shouldDirty: true })
                }
                options={boardOptions}
                loading={boardsLoading}
                disabled={!boardsLoading && boardOptions.length === 0}
                placeholder={
                  boardsLoading
                    ? 'Loading boards…'
                    : boardOptions.length === 0
                      ? 'No boards available for this institution'
                      : 'Select board'
                }
                searchPlaceholder='Search board…'
                emptyMessage='No matching boards'
                className='w-full justify-between'
              />
            </Field>
          </div>
        )}
        <div className='grid grid-cols-2 gap-3'>
          <Field label='Course Code' required error={form.formState.errors.course_code?.message}>
            <Input
              {...form.register('course_code')}
              placeholder='24UCSC01'
              className='font-mono'
              onChange={(e) =>
                form.setValue('course_code', e.target.value.toUpperCase(), {
                  shouldValidate: true, shouldDirty: true,
                })
              }
            />
          </Field>
          <Field label='Course Name' required error={form.formState.errors.course_name?.message}>
            <Input
              {...form.register('course_name')}
              onChange={(e) =>
                form.setValue('course_name', e.target.value.toUpperCase(), {
                  shouldValidate: true, shouldDirty: true,
                })
              }
            />
          </Field>
        </div>
        <div className='grid grid-cols-2 gap-3'>
          <SelectField name='course_category' form={form} label='Category' options={COURSE_CATEGORY_VALUES} required />
          <Field label='Part' error={form.formState.errors.course_part_master?.message}>
            <Controller
              name='course_part_master'
              control={form.control}
              render={({ field }) => (
                <SearchableSelect
                  value={(field.value as string) ?? ''}
                  onValueChange={(v) =>
                    // Empty value means "cleared" — PG courses carry no Part,
                    // so we keep the field undefined rather than sending ''.
                    field.onChange(v === '' ? undefined : v)
                  }
                  options={COURSE_PART_VALUES.map((v) => ({ value: v, label: v }))}
                  placeholder='(none) — leave blank for PG'
                  searchPlaceholder='Search part…'
                  emptyMessage='No matching part'
                  className='w-full justify-between'
                />
              )}
            />
          </Field>
        </div>
        <div className='grid grid-cols-[2fr_1fr] gap-3'>
          <Field label='Type' error={form.formState.errors.course_type?.message}>
            <Controller
              name='course_type'
              control={form.control}
              render={({ field }) => (
                <SearchableSelect
                  value={(field.value as string) ?? ''}
                  onValueChange={(v) =>
                    // Empty value means "cleared" — keep the field undefined so
                    // optional Zod stays happy and COE doesn't receive an empty
                    // string.
                    field.onChange(v === '' ? undefined : v)
                  }
                  options={COURSE_TYPE_VALUES.map((v) => ({ value: v, label: v }))}
                  placeholder='(none) — leave blank if no Type'
                  searchPlaceholder='Search type…'
                  emptyMessage='No matching type'
                  className='w-full justify-between'
                />
              )}
            />
          </Field>
          <Field label='Level' error={form.formState.errors.course_level?.message}>
            <Controller
              name='course_level'
              control={form.control}
              render={({ field }) => (
                <SearchableSelect
                  value={(field.value as string) ?? ''}
                  onValueChange={(v) =>
                    // Empty string means "cleared" — keep the field truly empty
                    // so the optional Zod check stays happy and we don't send
                    // an empty string to COE.
                    field.onChange(v === '' ? undefined : v)
                  }
                  options={COURSE_LEVEL_VALUES.map((v) => ({ value: v, label: v }))}
                  placeholder='Select level'
                  searchPlaceholder='Search level…'
                  emptyMessage='No matching level'
                  className='w-full justify-between'
                />
              )}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className='space-y-3 rounded-lg border p-4'>
        <legend className='px-2 text-sm font-semibold'>Workload</legend>
        <div className='grid grid-cols-4 gap-3'>
          <Field label='Exam (Hrs)' required error={form.formState.errors.exam_duration?.message}>
            <Input type='number' min={0} max={8} {...form.register('exam_duration', { valueAsNumber: true })} />
          </Field>
          <Field label='Credits' required error={form.formState.errors.credit?.message}>
            <Input type='number' step='0.5' min={0} max={10} {...form.register('credit', { valueAsNumber: true })} />
          </Field>
          <Field label='Theory Hours' required error={form.formState.errors.theory_hours?.message}>
            <Input type='number' min={0} max={40} {...form.register('theory_hours', { valueAsNumber: true })} />
          </Field>
          <Field label='Practical Hours' required error={form.formState.errors.practical_hours?.message}>
            <Input type='number' min={0} max={40} {...form.register('practical_hours', { valueAsNumber: true })} />
          </Field>
        </div>
      </fieldset>

      <fieldset className='space-y-3 rounded-lg border p-4'>
        <legend className='px-2 text-sm font-semibold'>Max Marks</legend>
        <div className='grid grid-cols-3 gap-3'>
          <Field label='Internal (CIA)' required error={form.formState.errors.internal_max_mark?.message}>
            <Input type='number' min={0} max={100} {...form.register('internal_max_mark', { valueAsNumber: true })} />
          </Field>
          <Field label='External (ESE)' required error={form.formState.errors.external_max_mark?.message}>
            <Input type='number' min={0} max={100} {...form.register('external_max_mark', { valueAsNumber: true })} />
          </Field>
          <Field label='Total (auto)'>
            <Input disabled type='number' {...form.register('total_max_mark', { valueAsNumber: true })} />
          </Field>
        </div>
      </fieldset>

      <Button type='submit' disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}

function Field({
  label, error, children, required,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className='space-y-1'>
      <Label className='text-xs'>
        {label}
        {required && (
          // Decorative: required-ness is enforced by the Zod schema, not by
          // this glyph. aria-hidden keeps screen readers from announcing "star".
          <span aria-hidden='true' className='ml-0.5 text-red-600'>*</span>
        )}
      </Label>
      {children}
      {error && <p className='text-xs text-red-600'>{error}</p>}
    </div>
  );
}

function SelectField({
  name, form, label, options, disabled, placeholder, required,
}: {
  name: FieldPath<CourseFormInput>;
  form: UseFormReturn<CourseFormInput>;
  label: string;
  options: readonly string[];
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
}) {
  const error = form.formState.errors[name]?.message as string | undefined;
  // Controller binds Radix Select to react-hook-form's controlled state from
  // the very first render — fixes the case where `form.watch(name)` briefly
  // returned undefined and the trigger showed blank (e.g., the level default
  // 'I' not appearing in the trigger even though defaultValues set it).
  return (
    <Field label={label} error={error} required={required}>
      <Controller
        name={name}
        control={form.control}
        render={({ field }) => (
          <Select
            value={(field.value as string) ?? ''}
            onValueChange={field.onChange}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      />
    </Field>
  );
}