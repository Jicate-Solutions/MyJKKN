'use client';

/**
 * AudienceMultiSelect — the CDC bulletin "Post Opportunity" audience picker
 * (BUG-004080).
 *
 * The implementation moved to components/shared/crud-master/multi-select-combobox.tsx
 * when a second caller appeared (the joint departments picker on the community
 * engagement register). Nothing about this control changed: same props, same
 * named export, same default export, same behaviour. This file stays as the
 * name the bulletin form imports, so that page is untouched.
 */

import {
  MultiSelectCombobox,
  type MultiSelectComboboxProps,
  type MultiSelectOption,
} from '@/components/shared/crud-master/multi-select-combobox';

export type AudienceOption = MultiSelectOption;
export type AudienceMultiSelectProps = MultiSelectComboboxProps;

export const AudienceMultiSelect = MultiSelectCombobox;

export default AudienceMultiSelect;
