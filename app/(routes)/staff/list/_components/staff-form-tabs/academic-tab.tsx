'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RepeatingFieldArray, MarkdownField } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

interface AcademicTabProps {
  form: UseFormReturn<StaffFormValues>;
}

export function AcademicTab({ form }: AcademicTabProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Qualification Summary</h2>
        <MarkdownField
          control={form.control}
          name="qualification_summary"
          label="Summary"
          description="Short summary shown above the qualifications list (markdown OK)."
          rows={4}
        />
      </section>

      <RepeatingFieldArray
        control={form.control}
        name="qualifications"
        label="Qualifications"
        defaultItem={defaults.qualification()}
        addLabel="Add qualification"
        emptyMessage="No qualifications added yet."
        itemLabel={(item: any, i) =>
          item?.degree ? `${item.degree}${item.institution ? ' — ' + item.institution : ''}` : `Qualification ${i + 1}`
        }
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.degree` as any} render={({ field }) => (
              <FormItem>
                <FormLabel>Degree</FormLabel>
                <FormControl><Input placeholder="Ph.D." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name={`${base}.institution` as any} render={({ field }) => (
              <FormItem>
                <FormLabel>Institution</FormLabel>
                <FormControl><Input placeholder="IIT Madras" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem>
                <FormLabel>Year</FormLabel>
                <FormControl><Input placeholder="2018" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name={`${base}.specialization` as any} render={({ field }) => (
              <FormItem>
                <FormLabel>Specialization</FormLabel>
                <FormControl><Input placeholder="Optional" {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="specialisations"
        label="Specialisations"
        defaultItem={defaults.specialisation()}
        addLabel="Add specialisation"
        emptyMessage="No specialisations added yet."
        itemLabel={(item: any, i) => item?.name || `Specialisation ${i + 1}`}
        renderItem={(base) => (
          <FormField control={form.control} name={`${base}.name` as any} render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl><Input placeholder="Machine Learning" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        )}
      />
    </div>
  );
}
