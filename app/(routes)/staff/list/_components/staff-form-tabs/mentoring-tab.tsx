'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RepeatingFieldArray, MarkdownField } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

export function MentoringTab({ form }: { form: UseFormReturn<StaffFormValues> }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">About Mentoring</h2>
        <MarkdownField
          control={form.control}
          name="mentoring_description"
          label="Mentoring Approach"
          description="Markdown supported."
          rows={6}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Counts</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField control={form.control} name="phd_scholars" render={({ field }) => (
            <FormItem><FormLabel>PhD Scholars (count)</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="pg_dissertations_guided" render={({ field }) => (
            <FormItem><FormLabel>PG Dissertations Guided</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="ug_projects_guided" render={({ field }) => (
            <FormItem><FormLabel>UG Projects Guided</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
      </section>

      <RepeatingFieldArray
        control={form.control}
        name="phd_scholars_list"
        label="PhD Scholars List"
        defaultItem={defaults.phdScholar()}
        addLabel="Add scholar"
        emptyMessage="No scholars added yet."
        itemLabel={(item: any, i) => item?.name || `Scholar ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.name` as any} render={({ field }) => (
              <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.topic` as any} render={({ field }) => (
              <FormItem><FormLabel>Research Topic</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem><FormLabel>Year</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.status` as any} render={({ field }) => (
              <FormItem><FormLabel>Status</FormLabel><FormControl><Input placeholder="ongoing | completed" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />
    </div>
  );
}
