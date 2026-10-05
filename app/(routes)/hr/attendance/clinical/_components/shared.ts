import { format } from 'date-fns';

import type { ClinicalEligibilityStatus } from '@/types/hr-clinical-duty';

export interface InstitutionOption {
  id: string;
  name: string;
}

export const STATUS_VARIANT: Record<
  ClinicalEligibilityStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  revoked: 'outline',
};

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd MMM yyyy');
  } catch {
    return iso;
  }
};

export const mapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps?q=${lat},${lng}`;
