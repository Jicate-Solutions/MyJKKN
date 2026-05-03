'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RepeatingFieldArray, MarkdownField } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

export function ExperienceTab({ form }: { form: UseFormReturn<StaffFormValues> }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Years of Experience</h2>
        <FormField control={form.control} name="experience_years" render={({ field }) => (
          <FormItem className="max-w-xs">
            <FormLabel>Total Years</FormLabel>
            <FormControl><Input type="number" min={0} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </section>

      <RepeatingFieldArray
        control={form.control}
        name="experience_entries"
        label="Experience Entries"
        defaultItem={defaults.experienceEntry()}
        addLabel="Add experience"
        emptyMessage="No experience added yet."
        itemLabel={(item: any, i) =>
          item?.role && item?.organisation ? `${item.role} @ ${item.organisation}` : `Entry ${i + 1}`
        }
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.role` as any} render={({ field }) => (
              <FormItem><FormLabel>Role</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.organisation` as any} render={({ field }) => (
              <FormItem><FormLabel>Organisation</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.from` as any} render={({ field }) => (
              <FormItem><FormLabel>From (year)</FormLabel><FormControl><Input placeholder="2015" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.to` as any} render={({ field }) => (
              <FormItem><FormLabel>To (year, blank if current)</FormLabel><FormControl><Input placeholder="Present" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.description` as any} render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea rows={3} {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        )}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Professional Summary</h2>
        <MarkdownField
          control={form.control}
          name="professional_summary"
          label="Summary"
          description="Long-form bio shown on the public profile (markdown supported)."
          rows={10}
        />
      </section>
    </div>
  );
}
