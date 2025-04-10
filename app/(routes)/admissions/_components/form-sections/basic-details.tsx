'use client';

import { UseFormReturn } from 'react-hook-form';
import { format, subYears } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface BasicDetailsFormProps {
  form: UseFormReturn<any>;
}

export function BasicDetailsForm({ form }: BasicDetailsFormProps) {
  // Log the form values for this section
  console.log('Basic details form state:', {
    studentName: form.getValues('studentName'),
    fatherName: form.getValues('fatherName'),
    religion: form.getValues('religion'),
    community: form.getValues('community')
  });

  // Calculate date 15 years ago for date of birth restrictions
  const fifteenYearsAgo = subYears(new Date(), 15);

  // Religion options
  const religionOptions = [
    { value: 'Hindu', label: 'Hindu' },
    { value: 'Christian', label: 'Christian' },
    { value: 'Muslim', label: 'Muslim' },
    { value: 'Others', label: 'Others' }
  ];

  // Community options
  const communityOptions = [
    { value: 'OC', label: 'OC' },
    { value: 'BC', label: 'BC' },
    { value: 'BCM', label: 'BCM' },
    { value: 'MBC', label: 'MBC' },
    { value: 'DNC', label: 'DNC' },
    { value: 'BC-CC', label: 'BC-CC' },
    { value: 'SC', label: 'SC' },
    { value: 'ST', label: 'ST' },
    { value: 'SC (A)', label: 'SC (A)' }
  ];

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>Basic Details</h2>
        <p className='text-sm text-muted-foreground'>
          Enter the applicant&apos;s personal and family information.
        </p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <FormField
          control={form.control}
          name='enquiryDate'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enquiry Date</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='date'
                  value={field.value || format(new Date(), 'yyyy-MM-dd')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='studentName'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Student Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder='Full name of the applicant' />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='fatherName'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Father&apos;s Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder='Full name of father' />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='fatherOccupation'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Father&apos;s Occupation</FormLabel>
              <FormControl>
                <Input {...field} placeholder='Occupation of father' />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='fatherMobile'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Father&apos;s Mobile Number</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder='10 digit mobile number'
                  maxLength={10}
                  type='tel'
                />
              </FormControl>
              <FormDescription>Must be exactly 10 digits</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='motherName'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mother&apos;s Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder='Full name of mother' />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='motherOccupation'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mother&apos;s Occupation</FormLabel>
              <FormControl>
                <Input {...field} placeholder='Occupation of mother' />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='motherMobile'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mother&apos;s Mobile Number</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder='10 digit mobile number'
                  maxLength={10}
                  type='tel'
                />
              </FormControl>
              <FormDescription>Must be exactly 10 digits</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='dateOfBirth'
          render={({ field }) => (
            <FormItem className='flex flex-col'>
              <FormLabel>Date of Birth</FormLabel>
              <div className='flex gap-2'>
                <FormControl>
                  <Input
                    type='date'
                    {...field}
                    max={format(fifteenYearsAgo, 'yyyy-MM-dd')}
                    className='w-full'
                  />
                </FormControl>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant='outline' size='icon'>
                      <CalendarIcon className='h-4 w-4' />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className='w-auto p-0' align='start'>
                    <Calendar
                      mode='single'
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          field.onChange(format(date, 'yyyy-MM-dd'));
                        }
                      }}
                      fromDate={new Date(1950, 0, 1)}
                      toDate={fifteenYearsAgo}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <FormDescription>
                Applicant must be at least 15 years old
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='gender'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Gender</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select gender' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='male'>Male</SelectItem>
                  <SelectItem value='female'>Female</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='religion'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Religion</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select religion' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {religionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='community'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Community</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select community' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {communityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='caste'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Caste</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder='Specific caste within community'
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='annualIncome'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Annual Income</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='number'
                  placeholder="Family's annual income"
                  min={0}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
