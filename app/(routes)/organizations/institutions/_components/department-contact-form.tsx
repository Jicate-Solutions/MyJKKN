// app/(routes)/organizations/institutions/_components/department-contact-form.tsx

'use client';

import { DepartmentContact } from '@/types/organizations';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { UseFormReturn } from 'react-hook-form';

interface DepartmentContactFormProps {
  form: UseFormReturn<any>;
  department: string;
  label: string;
}

export function DepartmentContactForm({
  form,
  department,
  label
}: DepartmentContactFormProps) {
  return (
    <div className='space-y-4'>
      <h3 className='text-lg font-semibold'>{label}</h3>
      <div className='grid gap-4 md:grid-cols-2'>
        <FormField
          control={form.control}
          name={`departments.${department}.contact_name`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder='Enter contact name' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`departments.${department}.designation`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Designation</FormLabel>
              <FormControl>
                <Input placeholder='Enter designation' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`departments.${department}.email`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type='email' placeholder='Enter email' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`departments.${department}.mobile`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mobile</FormLabel>
              <FormControl>
                <Input placeholder='Enter mobile number' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
