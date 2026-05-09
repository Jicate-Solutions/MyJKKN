'use client';

import { useEffect } from 'react';
import { useForm, type UseFormReturn, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  courseFormSchema,
  COURSE_PART_VALUES,
  COURSE_CATEGORY_VALUES,
  COURSE_TYPE_VALUES,
  type CourseFormInput,
} from '@/lib/services/bos/courses-schemas';

interface Props {
  defaultValues?: Partial<CourseFormInput>;
  onSubmit: (values: CourseFormInput) => Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
}

export function CourseForm({ defaultValues, onSubmit, submitting, submitLabel = 'Save' }: Props) {
  const form = useForm<CourseFormInput>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      course_code: '',
      course_name: '',
      course_category: 'Theory',
      course_part_master: 'Part III',
      course_type: 'Core',
      exam_duration: 3,
      credit: 3,
      theory_hours: 0,
      practical_hours: 0,
      internal_max_mark: 25,
      external_max_mark: 75,
      total_max_mark: 100,
      ...defaultValues,
    },
  });

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
        <div className='grid grid-cols-2 gap-3'>
          <Field label='Course Code' error={form.formState.errors.course_code?.message}>
            <Input {...form.register('course_code')} placeholder='24UCSC01' className='font-mono uppercase' />
          </Field>
          <Field label='Course Name' error={form.formState.errors.course_name?.message}>
            <Input {...form.register('course_name')} />
          </Field>
        </div>
        <div className='grid grid-cols-3 gap-3'>
          <SelectField name='course_category' form={form} label='Category' options={COURSE_CATEGORY_VALUES} />
          <SelectField name='course_part_master' form={form} label='Part' options={COURSE_PART_VALUES} />
          <SelectField name='course_type' form={form} label='Type' options={COURSE_TYPE_VALUES} />
        </div>
      </fieldset>

      <fieldset className='space-y-3 rounded-lg border p-4'>
        <legend className='px-2 text-sm font-semibold'>Workload</legend>
        <div className='grid grid-cols-4 gap-3'>
          <Field label='Exam (Hrs)' error={form.formState.errors.exam_duration?.message}>
            <Input type='number' min={0} max={8} {...form.register('exam_duration', { valueAsNumber: true })} />
          </Field>
          <Field label='Credits' error={form.formState.errors.credit?.message}>
            <Input type='number' step='0.5' min={0} max={10} {...form.register('credit', { valueAsNumber: true })} />
          </Field>
          <Field label='Theory Hours' error={form.formState.errors.theory_hours?.message}>
            <Input type='number' min={0} max={40} {...form.register('theory_hours', { valueAsNumber: true })} />
          </Field>
          <Field label='Practical Hours' error={form.formState.errors.practical_hours?.message}>
            <Input type='number' min={0} max={40} {...form.register('practical_hours', { valueAsNumber: true })} />
          </Field>
        </div>
      </fieldset>

      <fieldset className='space-y-3 rounded-lg border p-4'>
        <legend className='px-2 text-sm font-semibold'>Max Marks</legend>
        <div className='grid grid-cols-3 gap-3'>
          <Field label='Internal (CIA)' error={form.formState.errors.internal_max_mark?.message}>
            <Input type='number' min={0} max={100} {...form.register('internal_max_mark', { valueAsNumber: true })} />
          </Field>
          <Field label='External (ESE)' error={form.formState.errors.external_max_mark?.message}>
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

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className='space-y-1'>
      <Label className='text-xs'>{label}</Label>
      {children}
      {error && <p className='text-xs text-red-600'>{error}</p>}
    </div>
  );
}

function SelectField({
  name, form, label, options,
}: {
  name: FieldPath<CourseFormInput>;
  form: UseFormReturn<CourseFormInput>;
  label: string;
  options: readonly string[];
}) {
  const value = form.watch(name) as string | undefined;
  const error = form.formState.errors[name]?.message as string | undefined;
  return (
    <Field label={label} error={error}>
      <Select value={value} onValueChange={(v) => form.setValue(name, v as never)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}
