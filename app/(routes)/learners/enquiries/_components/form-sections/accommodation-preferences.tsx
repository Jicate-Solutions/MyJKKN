'use client';
// ============================================
// ACCOMMODATION PREFERENCES FORM SECTION
// ============================================
// Created: 2025-01-18
// Updated: 2025-01-19 - Updated to match admissions form structure
// Updated: 2026-05-21 - Removed the legacy "Reference Information" block
//   (reference_type / reference_name / reference_contact). Referral
//   attribution is now captured in the leads module's "Referral & Consultant"
//   section using the FK-based referral_type / referred_by_id /
//   referred_by_name columns and flows into learners_profiles via
//   /api/admission/bridge/convert. The DB columns + form-schema entries are
//   kept (2,066 historical rows in production + 9 API integration files
//   reference them, including B2A endpoints), so this is a UI-only removal.
// Purpose: Hostel + food preferences only
// ============================================


import { UseFormReturn, useWatch } from 'react-hook-form';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useEffect } from 'react';
import {
  useHostelCategoriesForGender,
  useMessCategoriesForGender
} from '@/hooks/campus-living/use-gender-categories';

interface AccommodationPreferencesProps {
  form: UseFormReturn<any>;
  isStudentView?: boolean;
}

export function AccommodationPreferencesSection({
  form,
  isStudentView: _isStudentView = false
}: AccommodationPreferencesProps) {
  // Watch for accommodation type to show conditional fields
  const accommodationType = useWatch({
    control: form.control,
    name: 'accommodation_type'
  });

  // Gender drives which hostel room / mess categories are offered (boys vs
  // girls + mixed). Captured on the Basic Details tab earlier in the flow.
  const gender = useWatch({ control: form.control, name: 'gender' });
  const { categories: hostelCategories, loading: loadingHostelCategories } =
    useHostelCategoriesForGender(gender);
  const { categories: messCategories, loading: loadingMessCategories } =
    useMessCategoriesForGender(gender);

  // Reset dependent fields when selection changes
  useEffect(() => {
    if (accommodationType !== 'HOSTEL') {
      // Reset hostel-specific category fields when accommodation isn't a hostel
      form.setValue('hostel_category_id', undefined);
      form.setValue('mess_category_id', undefined);
    }
  }, [accommodationType, form]);

  // Clear a previously-chosen category if it's no longer valid for the current
  // gender (e.g. operator changed gender after picking). Guarded on load + on
  // membership so a valid prefilled selection on edit is preserved.
  useEffect(() => {
    if (loadingHostelCategories) return;
    const cur = form.getValues('hostel_category_id');
    if (cur && !hostelCategories.some((c) => c.id === cur)) {
      form.setValue('hostel_category_id', undefined);
    }
  }, [gender, hostelCategories, loadingHostelCategories, form]);

  useEffect(() => {
    if (loadingMessCategories) return;
    const cur = form.getValues('mess_category_id');
    if (cur && !messCategories.some((c) => c.id === cur)) {
      form.setValue('mess_category_id', undefined);
    }
  }, [gender, messCategories, loadingMessCategories, form]);

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>
          Accommodation Preferences
        </h2>
        <p className='text-sm text-muted-foreground'>
          Specify your accommodation needs.
        </p>
      </div>

      <div className='space-y-6'>
        <FormField
          control={form.control}
          name='accommodation_type'
          render={({ field }) => (
            <FormItem className='space-y-3'>
              <FormLabel>Accommodation Type <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value || ''}
                  className='flex flex-col space-y-1'
                >
                  <div className='flex items-center space-x-2'>
                    <RadioGroupItem value='HOSTEL' id='hostel' />
                    <Label htmlFor='hostel'>Hostel</Label>
                  </div>
                  <div className='flex items-center space-x-2'>
                    <RadioGroupItem value='DAY SCHOLAR' id='day_scholar' />
                    <Label htmlFor='day_scholar'>Day Scholar</Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {accommodationType === 'HOSTEL' && (
          <>
            {/* Hostel Room Category — sourced from campus-living
                hostel_categories, filtered to the learner's gender (+ mixed). */}
            <FormField
              control={form.control}
              name='hostel_category_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hostel Room Category</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ''}
                    disabled={loadingHostelCategories || hostelCategories.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingHostelCategories
                              ? 'Loading...'
                              : hostelCategories.length === 0
                              ? 'No categories available'
                              : 'Select room category'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className='max-h-60 overflow-y-auto'>
                      {hostelCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Room category for your hostel stay (varies by gender)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Mess Category — sourced from campus-living mess_categories,
                filtered to the learner's gender (+ mixed). */}
            <FormField
              control={form.control}
              name='mess_category_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mess Category</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ''}
                    disabled={loadingMessCategories || messCategories.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingMessCategories
                              ? 'Loading...'
                              : messCategories.length === 0
                              ? 'No categories available'
                              : 'Select mess category'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className='max-h-60 overflow-y-auto'>
                      {messCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Mess plan for your hostel stay (varies by gender)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {/* Legacy "Reference Information" section removed 2026-05-21.
         *  Referral attribution now lives on the leads module under the
         *  Referral & Consultant section and propagates to learners_profiles
         *  via /api/admission/bridge/convert (referral_type, referred_by_id,
         *  referred_by_name). The DB columns reference_type / reference_name
         *  / reference_contact are kept for historical data + B2A API
         *  compatibility but are no longer user-editable from the enquiry
         *  form. */}
      </div>
    </div>
  );
}
