'use client';

import { useState, useEffect } from 'react';
import { UseFormReturn, useWatch } from 'react-hook-form';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { cn } from '@/lib/utils';
import {
  indianStates,
  getDistrictsByState,
  getTaluksByDistrict,
  type State,
  type District,
  type Taluk
} from '@/lib/data/locations';

interface ContactDetailsFormProps {
  form: UseFormReturn<any>;
}

export function ContactDetailsForm({ form }: ContactDetailsFormProps) {
  // State for dropdown open/close states
  const [stateOpen, setStateOpen] = useState(false);
  const [districtOpen, setDistrictOpen] = useState(false);
  const [talukOpen, setTalukOpen] = useState(false);

  // Watch form values for cascading updates
  const selectedStateId = useWatch({
    control: form.control,
    name: 'permanentAddressState'
  });

  const selectedDistrictId = useWatch({
    control: form.control,
    name: 'permanentAddressDistrict'
  });

  // Get available options based on selections
  const availableDistricts = selectedStateId
    ? getDistrictsByState(selectedStateId)
    : [];
  const availableTaluks =
    selectedStateId && selectedDistrictId
      ? getTaluksByDistrict(selectedStateId, selectedDistrictId)
      : [];

  // Reset dependent fields when parent changes (but preserve values in edit mode)
  useEffect(() => {
    if (selectedStateId) {
      // Check if current district is valid for the selected state
      const currentDistrict = form.getValues('permanentAddressDistrict');
      const currentTaluk = form.getValues('permanentAddressTaluk');

      if (currentDistrict) {
        const isDistrictValid = availableDistricts.some(d => d.id === currentDistrict);
        if (!isDistrictValid) {
          form.setValue('permanentAddressDistrict', '');
          form.setValue('permanentAddressTaluk', '');
        }
      }
    }
  }, [selectedStateId, form, availableDistricts]);

  useEffect(() => {
    if (selectedDistrictId) {
      // Check if current taluk is valid for the selected district
      const currentTaluk = form.getValues('permanentAddressTaluk');

      if (currentTaluk) {
        const isTalukValid = availableTaluks.some(t => t.id === currentTaluk);
        if (!isTalukValid) {
          form.setValue('permanentAddressTaluk', '');
        }
      }
    }
  }, [selectedDistrictId, form, availableTaluks]);
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

          {/* State Selection - First in order */}
          <FormField
            control={form.control}
            name='permanentAddressState'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>State</FormLabel>
                <Popover open={stateOpen} onOpenChange={setStateOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant='outline'
                        role='combobox'
                        aria-expanded={stateOpen}
                        className={cn(
                          'w-full justify-between',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value
                          ? indianStates.find(
                              (state) => state.id === field.value
                            )?.name
                          : 'Select state...'}
                        <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className='w-full p-0'>
                    <Command>
                      <CommandInput placeholder='Search state...' />
                      <CommandList>
                        <CommandEmpty>No state found.</CommandEmpty>
                        <CommandGroup>
                          {indianStates.map((state) => (
                            <CommandItem
                              key={state.id}
                              value={state.name}
                              onSelect={() => {
                                field.onChange(state.id);
                                setStateOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  field.value === state.id
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              {state.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* District Selection - Second in order */}
          <FormField
            control={form.control}
            name='permanentAddressDistrict'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>District</FormLabel>
                <Popover open={districtOpen} onOpenChange={setDistrictOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant='outline'
                        role='combobox'
                        aria-expanded={districtOpen}
                        disabled={!selectedStateId}
                        className={cn(
                          'w-full justify-between',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value
                          ? availableDistricts.find(
                              (district) => district.id === field.value
                            )?.name
                          : selectedStateId
                          ? 'Select district...'
                          : 'First select state'}
                        <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className='w-full p-0'>
                    <Command>
                      <CommandInput placeholder='Search district...' />
                      <CommandList>
                        <CommandEmpty>No district found.</CommandEmpty>
                        <CommandGroup>
                          {availableDistricts.map((district) => (
                            <CommandItem
                              key={district.id}
                              value={district.name}
                              onSelect={() => {
                                field.onChange(district.id);
                                setDistrictOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  field.value === district.id
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              {district.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  {!selectedStateId && 'Select a state first'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Taluk Selection - Third in order */}
          <FormField
            control={form.control}
            name='permanentAddressTaluk'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>Taluk/Tehsil</FormLabel>
                <Popover open={talukOpen} onOpenChange={setTalukOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant='outline'
                        role='combobox'
                        aria-expanded={talukOpen}
                        disabled={!selectedDistrictId}
                        className={cn(
                          'w-full justify-between',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value
                          ? availableTaluks.find(
                              (taluk) => taluk.id === field.value
                            )?.name
                          : selectedDistrictId
                          ? 'Select taluk...'
                          : 'First select district'}
                        <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className='w-full p-0'>
                    <Command>
                      <CommandInput placeholder='Search taluk...' />
                      <CommandList>
                        <CommandEmpty>No taluk found.</CommandEmpty>
                        <CommandGroup>
                          {availableTaluks.map((taluk) => (
                            <CommandItem
                              key={taluk.id}
                              value={taluk.name}
                              onSelect={() => {
                                field.onChange(taluk.id);
                                setTalukOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  field.value === taluk.id
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              {taluk.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  {!selectedDistrictId && 'Select a district first'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* PIN Code with numeric input */}
          <FormField
            control={form.control}
            name='permanentAddressPinCode'
            render={({ field }) => (
              <FormItem>
                <FormLabel>PIN Code</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    placeholder='Enter 6-digit PIN code'
                    maxLength={6}
                    minLength={6}
                    inputMode='numeric'
                  />
                </FormControl>
                <FormDescription>Must be exactly 6 digits</FormDescription>
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
                    type='number'
                    placeholder='10-digit mobile number'
                    maxLength={10}
                    minLength={10}
                    inputMode='numeric'
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
