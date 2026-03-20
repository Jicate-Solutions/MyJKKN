// ============================================
// FINANCE DETAILS FORM SECTION
// ============================================
// Created: 2026-03-04
// Purpose: Fee structure fields with conditional rendering
// based on fee_structure_type dropdown selection
// ============================================

'use client';

import { UseFormReturn, useWatch } from 'react-hook-form';
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
import { useEffect } from 'react';
import { IndianRupee } from 'lucide-react';

interface FinanceDetailsProps {
  form: UseFormReturn<any>;
  readOnly?: boolean;
}

export function FinanceDetailsSection({
  form,
  readOnly = false
}: FinanceDetailsProps) {
  // Watch fee_structure_type for conditional rendering
  const feeStructureType = useWatch({
    control: form.control,
    name: 'fee_structure_type'
  });

  // Reset dependent fields when fee structure type changes
  useEffect(() => {
    if (feeStructureType === 'tuition_hostel') {
      form.setValue('dayscholar_fee', null);
    } else if (feeStructureType === 'dayscholar') {
      form.setValue('tuition_fee', null);
      form.setValue('hostel_fee', null);
    }
  }, [feeStructureType, form]);

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>Finance Details</h2>
        <p className='text-sm text-muted-foreground'>
          Fee structure and payment details for the learner.
        </p>
      </div>

      {/* Common Fees */}
      <div className='space-y-4'>
        <h3 className='text-sm font-semibold flex items-center gap-2'>
          <IndianRupee className='h-4 w-4' />
          Common Fees
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <FormField
            control={form.control}
            name='application_fee'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Application Fee</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='Enter application fee'
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    disabled={readOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='university_reg_fee'
            render={({ field }) => (
              <FormItem>
                <FormLabel>University Registration Fee</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='Enter university registration fee'
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    disabled={readOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Fee Structure Type */}
      <div className='space-y-4 pt-4 border-t border-border'>
        <h3 className='text-sm font-semibold flex items-center gap-2'>
          <IndianRupee className='h-4 w-4' />
          Fee Structure
        </h3>
        <FormField
          control={form.control}
          name='fee_structure_type'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fee Structure Type</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
                disabled={readOnly}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select fee structure type' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='tuition_hostel'>Tuition + Hostel Fee</SelectItem>
                  <SelectItem value='dayscholar'>Day Scholar Fee</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Choose between separate tuition + hostel fees or a combined day scholar fee.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tuition + Hostel (conditional) */}
        {feeStructureType === 'tuition_hostel' && (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <FormField
              control={form.control}
              name='tuition_fee'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tuition Fee</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      step='0.01'
                      min='0'
                      placeholder='Enter tuition fee'
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='hostel_fee'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hostel Fee</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      step='0.01'
                      min='0'
                      placeholder='Enter hostel fee'
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Day Scholar Fee (conditional) */}
        {feeStructureType === 'dayscholar' && (
          <FormField
            control={form.control}
            name='dayscholar_fee'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Day Scholar Fee</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='Enter combined day scholar fee'
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    disabled={readOnly}
                  />
                </FormControl>
                <FormDescription>
                  Combined tuition and hostel fee for day scholars.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      {/* Optional Fees */}
      <div className='space-y-4 pt-4 border-t border-border'>
        <h3 className='text-sm font-semibold flex items-center gap-2'>
          <IndianRupee className='h-4 w-4' />
          Optional Fees
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <FormField
            control={form.control}
            name='uniform_fee'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Uniform Fee (Optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='Enter uniform fee'
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    disabled={readOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='hospital_training_fee'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hospital Training Fee (Optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='Enter hospital training fee'
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    disabled={readOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='placement_fee'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Placement Fee (Optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='number'
                  step='0.01'
                  min='0'
                  placeholder='Enter placement fee'
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                  disabled={readOnly}
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
