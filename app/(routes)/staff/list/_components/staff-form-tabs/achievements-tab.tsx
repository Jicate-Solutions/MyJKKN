'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RepeatingFieldArray } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

export function AchievementsTab({ form }: { form: UseFormReturn<StaffFormValues> }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Counts</h2>
        <FormField control={form.control} name="awards_won" render={({ field }) => (
          <FormItem className="max-w-xs">
            <FormLabel>Awards Won (count)</FormLabel>
            <FormControl><Input type="number" min={0} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </section>

      <RepeatingFieldArray
        control={form.control}
        name="badges"
        label="Badges"
        defaultItem={defaults.badge()}
        addLabel="Add badge"
        emptyMessage="No badges added yet."
        itemLabel={(item: any, i) => item?.label || `Badge ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.label` as any} render={({ field }) => (
              <FormItem><FormLabel>Label</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.color` as any} render={({ field }) => (
              <FormItem><FormLabel>Color (hex or token)</FormLabel><FormControl><Input placeholder="#ef4444" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="awards"
        label="Awards"
        defaultItem={defaults.award()}
        addLabel="Add award"
        emptyMessage="No awards added yet."
        itemLabel={(item: any, i) => item?.title || `Award ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.title` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.awarded_by` as any} render={({ field }) => (
              <FormItem><FormLabel>Awarded By</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem><FormLabel>Year</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.description` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Description</FormLabel><FormControl><Textarea rows={2} {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="certifications"
        label="Certifications"
        defaultItem={defaults.certification()}
        addLabel="Add certification"
        emptyMessage="No certifications added yet."
        itemLabel={(item: any, i) => item?.name || `Certification ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.name` as any} render={({ field }) => (
              <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.issuer` as any} render={({ field }) => (
              <FormItem><FormLabel>Issuer</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem><FormLabel>Year</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.credential_url` as any} render={({ field }) => (
              <FormItem><FormLabel>Credential URL</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="memberships"
        label="Memberships"
        defaultItem={defaults.membership()}
        addLabel="Add membership"
        emptyMessage="No memberships added yet."
        itemLabel={(item: any, i) => item?.body || `Membership ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FormField control={form.control} name={`${base}.body` as any} render={({ field }) => (
              <FormItem><FormLabel>Body</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.role` as any} render={({ field }) => (
              <FormItem><FormLabel>Role</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.since` as any} render={({ field }) => (
              <FormItem><FormLabel>Since (year)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="achievements"
        label="Achievements"
        defaultItem={defaults.achievement()}
        addLabel="Add achievement"
        emptyMessage="No achievements added yet."
        itemLabel={(item: any, i) => item?.title || `Achievement ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.title` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.date` as any} render={({ field }) => (
              <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.category` as any} render={({ field }) => (
              <FormItem><FormLabel>Category</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.description` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Description</FormLabel><FormControl><Textarea rows={3} {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.featured` as any} render={({ field }) => (
              <FormItem className="flex items-center gap-2 mt-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Featured</FormLabel><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />
    </div>
  );
}
