'use client';

import { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
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

interface ContactDetailsFormProps {
  form: UseFormReturn<any>;
}

// List of Indian states for the dropdown
const indianStates = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
];

export function ContactDetailsForm({ form }: ContactDetailsFormProps) {
  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>Contact Details</h2>
        <p className='text-sm text-muted-foreground'>
          Enter your permanent address and contact information.
        </p>
      </div>

      <div className='space-y-4'>
        <h3 className='text-lg font-medium'>Permanent Address</h3>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div className='md:col-span-2'>
            <FormField
              control={form.control}
              name='permanentAddressStreet'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder='Enter street address, house/flat number'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name='permanentAddressTaluk'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Taluk/Tehsil</FormLabel>
                <FormControl>
                  <Input {...field} placeholder='Enter taluk/tehsil' />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='permanentAddressDistrict'
            render={({ field }) => (
              <FormItem>
                <FormLabel>District</FormLabel>
                <FormControl>
                  <Input {...field} placeholder='Enter district' />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='permanentAddressPinCode'
            render={({ field }) => (
              <FormItem>
                <FormLabel>PIN Code</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder='Enter 6-digit PIN code'
                    maxLength={6}
                    minLength={6}
                    pattern='[0-9]{6}'
                    inputMode='numeric'
                  />
                </FormControl>
                <FormDescription>Must be exactly 6 digits</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='permanentAddressState'
            render={({ field }) => (
              <FormItem>
                <FormLabel>State</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select state' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {indianStates.map((state) => (
                      <SelectItem key={state} value={state.toLowerCase()}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <div className='space-y-4'>
        <h3 className='text-lg font-medium'>Contact Information</h3>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <FormField
            control={form.control}
            name='studentMobile'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Student&apos;s Mobile Number</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder='10-digit mobile number'
                    maxLength={10}
                    minLength={10}
                    pattern='[0-9]{10}'
                    inputMode='tel'
                  />
                </FormControl>
                <FormDescription>Must be exactly 10 digits</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='studentEmail'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Student&apos;s Email Address</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='email'
                    placeholder='Enter a valid email address'
                    inputMode='email'
                  />
                </FormControl>
                <FormDescription>
                  Must follow standard email format (user@domain)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
}
