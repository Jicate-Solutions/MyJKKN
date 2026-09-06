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
  makeCourseFormSchema,
  COURSE_PART_VALUES,
  COURSE_CATEGORY_VALUES,
  COURSE_TYPE_VALUES,
  COURSE_LEVEL_VALUES,
  type CourseFormInput,
} from '@/lib/services/bos/courses-schemas';
import { useCourseTypeOptions } from '@/hooks/bos/use-course-types';
import type { BosBoard, AcademicModel } from '@/types/bos';

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
  /**
   * Hide the Part & Level fields — institutions that don't use the TN
   * arts-college tiers (see institutionSkipsPartLevel, e.g. CET). Both schema
   * fields are optional, so submitting without them stays valid.
   */
  hidePartLevel?: boolean;
  /**
   * Academic model of the selected board. Year-based pharmacy/AHS models
   * (mgr_pharmd, mgr_ahs) relax credits/hours/category to optional and expose
   * an Academic Year field; B.Pharm (pci_pharm) and Anna behave identically.
   * Defaults to 'anna_univ'.
   */
  academicModel?: AcademicModel;
}

export function CourseForm({ defaultValues, boards, boardsLoading, onSubmit, submitting, submitLabel = 'Save', lockedBoardId, hidePartLevel, academicModel = 'anna_univ' }: Props) {
  // Year-based models (Pharm.D / AHS) carry no credits, no course category, and
  // locate the course by academic year instead of semester tiers.
  const isYearBased = academicModel === 'mgr_pharmd' || academicModel === 'mgr_ahs';
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
    resolver: zodResolver(makeCourseFormSchema(academicModel)),
    defaultValues: {
      course_code: '',
      course_name: '',
      // Year-based models have no category in source — leave blank (optional).
      course_category: isYearBased ? undefined : 'Theory',
      // course_part_master and course_type intentionally omitted — PG / non-tiered
      // courses don't carry a Part or Type, so blank is the safer default.
      // Both schema entries are optional.
      // course_level intentionally omitted — some courses genuinely have no
      // Roman-numeral tier, so blank is the right default. The schema is now
      // optional, so submitting without a Level is valid.
      exam_duration: 3,
      // Year-based models carry no credits and hours-per-week only; leave blank.
      credit: isYearBased ? undefined : 3,
      theory_hours: 0,
      tutorial_hours: 0,
      practical_hours: 0,
      // The Max Marks block edits the CONVERTED marks — the CIA/ESE weightage
      // that sums to the total. Deliberately NO internal_max_mark /
      // external_max_mark seed: those are the COE-owned question-paper ceilings,
      // and seeding them here would make a create overwrite the ceiling with a
      // stale 25/75 instead of letting toCoeCreatePayload default it to the
      // value the user actually typed. The edit page supplies them explicitly.
      internal_converted_mark: isYearBased ? undefined : 25,
      external_converted_mark: isYearBased ? undefined : 75,
      total_max_mark: isYearBased ? undefined : 100,
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

  // Auto-compute total_max_mark from the CONVERTED internal + external, so the
  // displayed total reconciles with COE's stored total_max_mark. Summing the
  // paper ceilings instead would show 50 + 100 = 150 for a Theory + Practical
  // course whose real total is 100.
  const internal = form.watch('internal_converted_mark');
  const external = form.watch('external_converted_mark');
  useEffect(() => {
    form.setValue(
      'total_max_mark',
      Number(internal || 0) + Number(external || 0),
      { shouldValidate: false },
    );
  }, [internal, external]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className='w-full space-y-6'>
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
        {/* Year-based models (Pharm.D/AHS) locate the course by academic year. */}
        {isYearBased && (
          <div className='grid grid-cols-2 gap-3'>
            <Field label='Academic Year' error={form.formState.errors.academic_year?.message}>
              <Input
                type='number'
                min={1}
                max={6}
                {...form.register('academic_year', { valueAsNumber: true })}
                placeholder='1'
              />
            </Field>
          </div>
        )}
        <div className='grid grid-cols-2 gap-3'>
          <SelectField name='course_category' form={form} label='Category' options={COURSE_CATEGORY_VALUES} required={!isYearBased} />
          {!hidePartLevel && (
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
          )}
        </div>
        <div className={hidePartLevel ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-[2fr_1fr] gap-3'}>
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
          {!hidePartLevel && (
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
          )}
        </div>
      </fieldset>

      <fieldset className='space-y-3 rounded-lg border p-4'>
        <legend className='px-2 text-sm font-semibold'>Workload</legend>
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
          <Field label='Exam (Hrs)' required error={form.formState.errors.exam_duration?.message}>
            <Input type='number' min={0} max={8} {...form.register('exam_duration', { valueAsNumber: true })} />
          </Field>
          <Field label='Credits' required={!isYearBased} error={form.formState.errors.credit?.message}>
            <Input type='number' step='0.5' min={0} max={10} {...form.register('credit', { valueAsNumber: true })} />
          </Field>
          <Field label='Theory Hours' required={!isYearBased} error={form.formState.errors.theory_hours?.message}>
            <Input type='number' min={0} max={40} {...form.register('theory_hours', { valueAsNumber: true })} />
          </Field>
          {/* Tutorial Hours — optional (default 0); not every course has a
              tutorial component, so it carries no `required` flag. */}
          <Field label='Tutorial Hours' error={form.formState.errors.tutorial_hours?.message}>
            <Input type='number' min={0} max={40} {...form.register('tutorial_hours', { valueAsNumber: true })} />
          </Field>
          <Field label='Practical Hours' required={!isYearBased} error={form.formState.errors.practical_hours?.message}>
            <Input type='number' min={0} max={40} {...form.register('practical_hours', { valueAsNumber: true })} />
          </Field>
        </div>
      </fieldset>

      <fieldset className='space-y-3 rounded-lg border p-4'>
        <legend className='px-2 text-sm font-semibold'>Max Marks</legend>
        <div className='grid grid-cols-3 gap-3'>
          {/* These two bind to the CONVERTED marks, not the question-paper
              ceilings: what a BoS sets is the weightage each component carries
              in the total (CIA 50 + ESE-converted 50 = 100), while the ceiling
              an ESE paper is written for (100) stays COE-owned and untouched.
              No max cap — the total varies by subject, so only >= 0 is enforced. */}
          <Field label='Internal (CIA)' required={!isYearBased} error={form.formState.errors.internal_converted_mark?.message}>
            <Input type='number' min={0} {...form.register('internal_converted_mark', { valueAsNumber: true })} />
          </Field>
          <Field label='External (ESE)' required={!isYearBased} error={form.formState.errors.external_converted_mark?.message}>
            <Input type='number' min={0} {...form.register('external_converted_mark', { valueAsNumber: true })} />
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