'use client';

import { useQuery } from '@tanstack/react-query';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useBillingCategories } from '@/hooks/billing/use-billing-categories';
import type { BillCoverageFilters } from '@/types/billing-coverage';
import { LEARNER_SCOPE_DEFAULT, GENDER_UNSET } from '@/types/billing-coverage';

interface CoverageFilterBarProps {
  filters: BillCoverageFilters;
  onChange: (next: Partial<BillCoverageFilters>) => void;
}

const ALL = '__all__';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  reserved: 'Reserved',
  admitted: 'Admitted',
  account: 'Account'
};

export function CoverageFilterBar({
  filters,
  onChange
}: CoverageFilterBarProps) {
  const { institutions, loading: institutionsLoading } =
    useUserInstitutionAccess();

  // Only one institution selected at a time. Academic years are per-institution
  // (the name '2026-2027' exists once per college, each with its own UUID), so
  // a specific academic_year_id is only meaningful within one institution.
  const selectedInstitutionId = filters.institution_ids?.[0];

  const { data: academicYears } = useAcademicYears(selectedInstitutionId);
  const { categories } = useBillingCategories({ isActive: true, limit: 1000 });

  // accommodation_types is a small global lookup (4 active rows) — no
  // institution scoping, so it is safe to cache for the session.
  const { data: accommodationTypes } = useQuery({
    queryKey: ['accommodation-types', 'active'],
    queryFn: () => LookupService.listAccommodationTypes(true),
    staleTime: 30 * 60 * 1000
  });

  const selectedAccommodationId = filters.accommodation_type_ids?.[0];

  const statuses = filters.lifecycle_statuses ?? [...LEARNER_SCOPE_DEFAULT];

  const toggleStatus = (status: string) => {
    const next = statuses.includes(status)
      ? statuses.filter((s) => s !== status)
      : [...statuses, status];
    // Never let the scope go empty — an empty array would return no learners
    // and read as "no gaps", which is the opposite of the truth.
    if (next.length === 0) return;
    onChange({ lifecycle_statuses: next });
  };

  return (
    <div className='space-y-4 rounded-lg border p-4'>
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {/* Institution */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Institution</Label>
          <Select
            value={selectedInstitutionId ?? ALL}
            onValueChange={(v) =>
              onChange({
                institution_ids: v === ALL ? null : [v],
                // The previous year belongs to the previous institution.
                academic_year_id: null
              })
            }
            disabled={institutionsLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder='All accessible institutions' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All accessible institutions</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.institution_id} value={i.institution_id}>
                  {i.institution_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Academic year */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Academic Year</Label>
          <Select
            value={filters.academic_year_id ?? ALL}
            onValueChange={(v) =>
              onChange({ academic_year_id: v === ALL ? null : v })
            }
            disabled={!selectedInstitutionId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Each learner's own year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Each learner&apos;s own year</SelectItem>
              {(academicYears?.data ?? []).map((y: any) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.academic_year_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedInstitutionId && (
            <p className='text-[11px] text-muted-foreground'>
              Pick an institution to choose a specific year
            </p>
          )}
        </div>

        {/* Billing category */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Billing Category</Label>
          <Select
            value={filters.billing_category_id ?? ALL}
            onValueChange={(v) =>
              onChange({ billing_category_id: v === ALL ? null : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Any category' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any category</SelectItem>
              {(categories ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.category_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Accommodation */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Accommodation</Label>
          <Select
            value={selectedAccommodationId ?? ALL}
            onValueChange={(v) =>
              onChange({ accommodation_type_ids: v === ALL ? null : [v] })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Any accommodation' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any accommodation</SelectItem>
              {(accommodationTypes ?? []).map((a: any) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Transport — a separate dimension, not an accommodation value.
            Day scholars and hostellers both appear under "Uses bus", so this
            composes with the accommodation filter rather than replacing it. */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Transport</Label>
          <Select
            value={filters.transport ?? 'any'}
            onValueChange={(v) =>
              onChange({ transport: v as BillCoverageFilters['transport'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='any'>Any transport</SelectItem>
              <SelectItem value='bus'>Uses bus</SelectItem>
              <SelectItem value='no_bus'>No bus</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Gender */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Gender</Label>
          <Select
            value={filters.gender ?? ALL}
            onValueChange={(v) => onChange({ gender: v === ALL ? null : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder='Any gender' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any gender</SelectItem>
              <SelectItem value='MALE'>Male</SelectItem>
              <SelectItem value='FEMALE'>Female</SelectItem>
              {/* gender is TEXT NOT NULL holding '' for unrecorded learners,
                  so this needs its own sentinel rather than a null value. */}
              <SelectItem value={GENDER_UNSET}>Not recorded</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Coverage state */}
        <div className='space-y-1.5'>
          <Label className='text-xs'>Show</Label>
          <Select
            value={filters.coverage_state ?? 'not_generated'}
            onValueChange={(v) =>
              onChange({
                coverage_state: v as BillCoverageFilters['coverage_state']
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='not_generated'>Not generated</SelectItem>
              <SelectItem value='generated'>Generated</SelectItem>
              <SelectItem value='cannot_evaluate'>Cannot evaluate</SelectItem>
              <SelectItem value='all'>All learners</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lifecycle statuses */}
      <div className='space-y-1.5'>
        <Label className='text-xs'>Lifecycle Status</Label>
        <div className='flex flex-wrap gap-2'>
          {LEARNER_SCOPE_DEFAULT.map((s) => (
            <Button
              key={s}
              type='button'
              size='sm'
              variant={statuses.includes(s) ? 'default' : 'outline'}
              onClick={() => toggleStatus(s)}
            >
              {STATUS_LABELS[s] ?? s}
            </Button>
          ))}
        </div>
      </div>

      {/* Search, sorting, paging and export live in the DataTable toolbar. */}
      <div className='flex items-center gap-2'>
        <Switch
          id='include-non-billing'
          checked={filters.include_non_billing_institutions ?? false}
          onCheckedChange={(checked) =>
            onChange({ include_non_billing_institutions: checked })
          }
        />
        <Label htmlFor='include-non-billing' className='text-xs'>
          Include institutions that have never billed
        </Label>
      </div>
    </div>
  );
}
