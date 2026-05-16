'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RepeatingFieldArray } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

export function ResearchTab({ form }: { form: UseFormReturn<StaffFormValues> }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Counts</h2>
        <FormField control={form.control} name="research_papers" render={({ field }) => (
          <FormItem className="max-w-xs">
            <FormLabel>Research Papers Count</FormLabel>
            <FormControl><Input type="number" min={0} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </section>

      <RepeatingFieldArray
        control={form.control}
        name="publications"
        label="Publications"
        defaultItem={defaults.publication()}
        addLabel="Add publication"
        emptyMessage="No publications added yet."
        itemLabel={(item: any, i) => item?.title || `Publication ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.title` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.journal` as any} render={({ field }) => (
              <FormItem><FormLabel>Journal / Venue</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem><FormLabel>Year</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.doi` as any} render={({ field }) => (
              <FormItem><FormLabel>DOI</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.url` as any} render={({ field }) => (
              <FormItem><FormLabel>URL</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.type` as any} render={({ field }) => (
              <FormItem><FormLabel>Type</FormLabel><FormControl><Input placeholder="journal | conference | book" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="research_focus_areas"
        label="Research Focus Areas"
        defaultItem={defaults.researchFocus()}
        addLabel="Add focus area"
        emptyMessage="No focus areas added yet."
        itemLabel={(item: any, i) => item?.area || `Area ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.area` as any} render={({ field }) => (
              <FormItem><FormLabel>Area</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.description` as any} render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="funded_projects"
        label="Funded Projects"
        defaultItem={defaults.fundedProject()}
        addLabel="Add project"
        emptyMessage="No funded projects added yet."
        itemLabel={(item: any, i) => item?.title || `Project ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.title` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.agency` as any} render={({ field }) => (
              <FormItem><FormLabel>Agency</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.amount` as any} render={({ field }) => (
              <FormItem><FormLabel>Amount</FormLabel><FormControl><Input placeholder="₹ 12,00,000" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Scholar URLs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField control={form.control} name="google_scholar_url" render={({ field }) => (
            <FormItem><FormLabel>Google Scholar</FormLabel><FormControl><Input placeholder="https://scholar.google.com/..." {...field} value={field.value ?? ''} /></FormControl><FormDescription>Full URL.</FormDescription><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="researchgate_url" render={({ field }) => (
            <FormItem><FormLabel>ResearchGate</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="orcid_url" render={({ field }) => (
            <FormItem><FormLabel>ORCID</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
      </section>
    </div>
  );
}
