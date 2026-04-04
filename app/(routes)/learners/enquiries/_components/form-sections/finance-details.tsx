'use client';
// ============================================
// FINANCE DETAILS FORM SECTION
// ============================================
// Created: 2026-03-04
// Updated: 2026-03-13 - Restructured to 5 fee structure types
//          with config-driven conditional optional fees
// ============================================


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
import {
  FEE_STRUCTURE_CONFIG,
  OPTIONAL_FEE_LABELS,
  ALL_CONDITIONAL_FEE_FIELDS,
  type FeeStructureType
} from '@/lib/constants/fee-structure';

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
  }) as FeeStructureType | null;

  const config = feeStructureType
    ? FEE_STRUCTURE_CONFIG[feeStructureType]
    : null;

  // Reset non-active fields when fee structure type changes
  useEffect(() => {
    if (!feeStructureType || !config) return;

    const activeFields = new Set([
      ...config.primaryFields.map((f) => f.name),
      ...config.optionalFees,
    ]);

    ALL_CONDITIONAL_FEE_FIELDS.forEach((field) => {
      if (!activeFields.has(field)) {
        form.setValue(field, null);
      }
    });
  }, [feeStructureType, config, form]);

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
                  {Object.entries(FEE_STRUCTURE_CONFIG).map(([value, cfg]) => (
                    <SelectItem key={value} value={value}>
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Select the applicable fee structure for this learner.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Primary Fee Fields (dynamic based on selected type) */}
        {config && (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            {config.primaryFields.map((primaryField) => (
              <FormField
                key={primaryField.name}
                control={form.control}
                name={primaryField.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{primaryField.label}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        step='0.01'
                        min='0'
                        placeholder={`Enter ${primaryField.label.toLowerCase()}`}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                        disabled={readOnly}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Optional Fees (dynamic based on selected type) */}
      {config && config.optionalFees.length > 0 && (
        <div className='space-y-4 pt-4 border-t border-border'>
          <h3 className='text-sm font-semibold flex items-center gap-2'>
            <IndianRupee className='h-4 w-4' />
            Optional Fees
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            {config.optionalFees.map((feeName) => (
              <FormField
                key={feeName}
                control={form.control}
                name={feeName}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{OPTIONAL_FEE_LABELS[feeName]} (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        step='0.01'
                        min='0'
                        placeholder={`Enter ${OPTIONAL_FEE_LABELS[feeName]?.toLowerCase()}`}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                        disabled={readOnly}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
