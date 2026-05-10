// Site type catalog — shipped substrate (lib/services/internships/types.ts) defines
// SiteType as a hand-authored enum: 'hospital' | 'clinic' | 'community' | 'industry' | 'other'.
// Per Q1 extensibility rule, the longer-term plan is `internship_site_types` table; the
// substrate locked the enum first. UI mirrors that enum 1:1 and labels the human-readable form.

import type { SiteType } from '@/lib/services/internships/types';

export const SITE_TYPE_OPTIONS: { value: SiteType; label: string }[] = [
  { value: 'hospital', label: 'Hospital' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'community', label: 'Community' },
  { value: 'industry', label: 'Industry' },
  { value: 'other', label: 'Other' },
];

export const SITE_TYPE_LABELS: Record<SiteType, string> = SITE_TYPE_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value] = opt.label;
    return acc;
  },
  {} as Record<SiteType, string>
);
