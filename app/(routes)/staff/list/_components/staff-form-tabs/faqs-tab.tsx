'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RepeatingFieldArray } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

export function FaqsTab({ form }: { form: UseFormReturn<StaffFormValues> }) {
  return (
    <RepeatingFieldArray
      control={form.control}
      name="faqs"
      label="Frequently Asked Questions"
      defaultItem={defaults.faq()}
      addLabel="Add FAQ"
      emptyMessage="No FAQs added yet."
      itemLabel={(item: any, i) => item?.question || `FAQ ${i + 1}`}
      renderItem={(base) => (
        <div className="space-y-3">
          <FormField control={form.control} name={`${base}.question` as any} render={({ field }) => (
            <FormItem><FormLabel>Question</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name={`${base}.answer` as any} render={({ field }) => (
            <FormItem><FormLabel>Answer</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
      )}
    />
  );
}
