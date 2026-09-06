'use client';
// ============================================
// CONTACT DETAILS FORM SECTION
// ============================================
// Created: 2025-01-18
// Updated: 2025-01-19 - Updated to match admissions form structure
// Purpose: Student contact information and address
// Changes:
// - Added searchable combobox for State, District, Taluk
// - Implemented cascading dropdown logic
// - Fixed field order (Street → State → District → Taluk → PIN)
// - Added form descriptions for all fields
// - Added proper input types (numeric for mobile and PIN code)
// ============================================


import { useState, useEffect, useMemo, useRef } from 'react';
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
import {
  PostalCodeField,
  type PostalCodeFetchers,
} from '@/components/learners/postal-code-field';
import { PostalCodeService } from '@/lib/services/postal-code-service';

// Admin-side data adapter (authenticated Supabase read; the public
// student-form injects a token-endpoint fetcher instead).
const postalFetchers: PostalCodeFetchers = {
  lookupPincode: (pin) => PostalCodeService.lookupPincode(pin),
};

interface ContactDetailsProps {
  form: UseFormReturn<any>;
  /**
   * Staff-only. College email is the learner's institutional identity, so it
   * stays off the self-service My Profile form — which reaches this section
   * with the course-selection tab (its previous home) hidden.
   */
  showCollegeEmail?: boolean;
}

export function ContactDetailsSection({ form, showCollegeEmail = false }: ContactDetailsProps) {
  // State for dropdown open/close states
  const [stateOpen, setStateOpen] = useState(false);
  const [districtOpen, setDistrictOpen] = useState(false);
  const [talukOpen, setTalukOpen] = useState(false);

  // Watch form values for cascading updates
  const selectedStateId = useWatch({
    control: form.control,
    name: 'permanent_address_state'
  });

  const selectedDistrictId = useWatch({
    control: form.control,
    name: 'permanent_address_district'
  });

  const postOfficeId = useWatch({
    control: form.control,
    name: 'post_office_id'
  });

  // Get available options based on selections - memoize to prevent recalculation
  const availableDistricts = useMemo(
    () => (selectedStateId ? getDistrictsByState(selectedStateId) : []),
    [selectedStateId]
  );

  const availableTaluks = useMemo(
    () =>
      selectedStateId && selectedDistrictId
        ? getTaluksByDistrict(selectedStateId, selectedDistrictId)
        : [],
    [selectedStateId, selectedDistrictId]
  );

  // Reset dependent fields when parent changes (but preserve values in edit mode)
  // These effects drop a child value that doesn't belong to the newly chosen
  // parent. They must fire ONLY on a real user change: legacy rows store
  // free-text the dataset never had (taluk 'KANAGAGRI' under SALEM), and
  // clearing on mount blanked a required field, which then forced the operator
  // to overwrite the stored value just to save. Seeded from the hydrated
  // values, so the first render is a no-op. defaultValues are complete at mount
  // (the edit page waits for the query, and the form never reset()s).
  const prevStateIdRef = useRef(selectedStateId);
  const prevDistrictIdRef = useRef(selectedDistrictId);

  useEffect(() => {
    if (prevStateIdRef.current === selectedStateId) return;
    prevStateIdRef.current = selectedStateId;

    if (selectedStateId) {
      // Check if current district is valid for the selected state
      const currentDistrict = form.getValues('permanent_address_district');

      if (currentDistrict) {
        const isDistrictValid = availableDistricts.some(d => d.id === currentDistrict);
        if (!isDistrictValid) {
          form.setValue('permanent_address_district', '');
          form.setValue('permanent_address_taluk', '');
        }
      }
    }
  }, [selectedStateId, form, availableDistricts]);

  useEffect(() => {
    if (prevDistrictIdRef.current === selectedDistrictId) return;
    prevDistrictIdRef.current = selectedDistrictId;

    if (selectedDistrictId) {
      // Check if current taluk is valid for the selected district
      const currentTaluk = form.getValues('permanent_address_taluk');

      if (currentTaluk) {
        const isTalukValid = availableTaluks.some(t => t.id === currentTaluk);
        if (!isTalukValid) {
          form.setValue('permanent_address_taluk', '');
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
              name='permanent_address_street'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address <span className="text-red-500">*</span></FormLabel>
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
            name='permanent_address_state'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>State <span className="text-red-500">*</span></FormLabel>
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
                            )?.name || field.value
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
            name='permanent_address_district'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>District <span className="text-red-500">*</span></FormLabel>
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
                            )?.name || field.value
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
            name='permanent_address_taluk'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>Taluk/Tehsil <span className="text-red-500">*</span></FormLabel>
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
                        {/* Fall back to the raw value: rows predating the taluk
                            dataset store names it doesn't contain, and showing
                            nothing made real data look missing. */}
                        {field.value
                          ? availableTaluks.find(
                              (taluk) => taluk.id === field.value
                            )?.name || field.value
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

          {/* PIN Code — postal-master lookup auto-fills District (and the
              optional Post Office pick links precise lat/long for maps) */}
          <FormField
            control={form.control}
            name='permanent_address_pin_code'
            render={({ field }) => (
              <FormItem>
                <FormLabel>PIN Code <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <PostalCodeField
                    pincode={field.value || ''}
                    postOfficeId={postOfficeId || null}
                    fetchers={postalFetchers}
                    onChange={({ pincode, postOfficeId: nextOffice, districtId }) => {
                      field.onChange(pincode);
                      form.setValue('post_office_id', nextOffice ?? '', { shouldDirty: true });
                      if (districtId) {
                        if (!form.getValues('permanent_address_state')) {
                          form.setValue('permanent_address_state', 'tamil_nadu', { shouldDirty: true });
                        }
                        if (form.getValues('permanent_address_district') !== districtId) {
                          form.setValue('permanent_address_district', districtId, { shouldDirty: true });
                          // Taluk belongs to the previous district — reset for re-pick
                          form.setValue('permanent_address_taluk', '', { shouldDirty: true });
                        }
                      }
                    }}
                  />
                </FormControl>
                <FormDescription>Must be exactly 6 digits — district auto-fills from the postal directory</FormDescription>
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
            name='student_mobile'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Student&apos;s Mobile Number <span className="text-red-500">*</span></FormLabel>
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
            name='student_email'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Student&apos;s Personal Email Address</FormLabel>
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

          {/* Sits here, next to the other two contact addresses, so the form
              matches the profile detail page's Contact Information block. */}
          {showCollegeEmail && (
            <FormField
              control={form.control}
              name='college_email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>College Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      type='email'
                      placeholder='student@jkkn.ac.in (optional)'
                      inputMode='email'
                    />
                  </FormControl>
                  <FormDescription>
                    College email must use @jkkn.ac.in domain (optional)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
