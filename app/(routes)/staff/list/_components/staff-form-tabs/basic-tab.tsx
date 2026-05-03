'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StaffFormValues } from '../staff-form-schema';

interface BasicTabProps {
  form: UseFormReturn<StaffFormValues>;
  /** Slices of existing JSX from the parent form, rendered as-is */
  personalSection: React.ReactNode;
  contactSection: React.ReactNode;
  additionalSection: React.ReactNode;
  employmentSection: React.ReactNode;
  statusSection: React.ReactNode;
  /** Whether to show the extended-profile toggle in Profile Settings */
  canEnableExtended: boolean;
}

export function BasicTab(props: BasicTabProps) {
  const { form, canEnableExtended } = props;

  return (
    <div className="space-y-8">
      {props.personalSection}
      {props.contactSection}
      {props.additionalSection}
      {props.employmentSection}

      {/* New: Profile Settings */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Profile Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL Slug</FormLabel>
                <FormControl>
                  <Input
                    placeholder="dr-firstname-lastname"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>Used in the public website URL.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profile Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>Published profiles appear on the website.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="display_order"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display Order</FormLabel>
                <FormControl>
                  <Input type="number" min={0} {...field} value={field.value ?? 0} />
                </FormControl>
                <FormDescription>Lower numbers appear first.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {canEnableExtended && (
          <FormField
            control={form.control}
            name="has_extended_profile"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Extended Faculty Profile</FormLabel>
                  <FormDescription>
                    Enable to fill out academic, research, and mentoring details for the public website.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        )}
      </section>

      {props.statusSection}
    </div>
  );
}
