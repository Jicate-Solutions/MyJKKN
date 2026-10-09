'use client';

import Link from 'next/link';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useScholarshipSetup } from '@/hooks/billing/use-scholarship-setup';
import {
  selectableCategories,
  selectableTypes
} from '@/lib/billing/scholarship-type-defaults';
import type { ScholarshipType } from '@/types/billing-schedule';

interface ScholarshipSelectFieldsProps {
  categoryId?: string;
  typeId?: string;
  onCategoryChange: (categoryId: string) => void;
  onTypeChange: (type: ScholarshipType) => void;
  /** On the edit form: the record's current pair stays selectable even if it
   *  has since been deactivated, so opening the form never blanks the field. */
  originalCategoryId?: string;
  originalTypeId?: string;
  /** Show a link to the setup page when a category has no types yet. */
  canManageSetup?: boolean;
}

/** Scholarship Category + Scholarship Type, as two cells of the form grid. */
export function ScholarshipSelectFields({
  categoryId,
  typeId,
  onCategoryChange,
  onTypeChange,
  originalCategoryId,
  originalTypeId,
  canManageSetup = false
}: ScholarshipSelectFieldsProps) {
  const { data: tree = [], isLoading, error } = useScholarshipSetup();

  const categories = selectableCategories(tree, originalCategoryId);
  const types = selectableTypes(tree, categoryId, originalTypeId);
  const categoryHasNoTypes = !!categoryId && !isLoading && types.length === 0;

  return (
    <>
      <div className='space-y-2'>
        <Label htmlFor='scholarship_category_id'>Scholarship Category *</Label>
        <Select
          value={categoryId || ''}
          onValueChange={onCategoryChange}
          disabled={isLoading}
        >
          <SelectTrigger id='scholarship_category_id'>
            <SelectValue
              placeholder={
                isLoading ? 'Loading categories…' : 'Select scholarship category'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
                {category.is_active ? '' : ' (inactive)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && (
          <p className='text-xs text-destructive'>
            Could not load scholarship categories. Reload the page to retry.
          </p>
        )}
        {!isLoading && !error && categories.length === 0 && (
          <p className='text-xs text-muted-foreground'>
            No scholarship categories are set up yet.
          </p>
        )}
      </div>

      <div className='space-y-2'>
        <Label htmlFor='scholarship_type_id'>Scholarship Type *</Label>
        <Select
          value={typeId || ''}
          onValueChange={(value) => {
            const picked = types.find((t) => t.id === value);
            if (picked) onTypeChange(picked);
          }}
          disabled={!categoryId || isLoading}
        >
          <SelectTrigger id='scholarship_type_id'>
            <SelectValue
              placeholder={
                categoryId
                  ? 'Select scholarship type'
                  : 'Select a category first'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {types.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
                {type.is_active ? '' : ' (inactive)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categoryHasNoTypes && (
          <p className='text-xs text-muted-foreground'>
            This category has no active types.{' '}
            {canManageSetup && (
              <Link
                href='/billing/scholarships/setup'
                className='underline underline-offset-2'
              >
                Add one
              </Link>
            )}
          </p>
        )}
      </div>
    </>
  );
}
