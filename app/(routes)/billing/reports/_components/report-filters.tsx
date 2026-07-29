'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Filter, RotateCcw, X, ChevronDown } from 'lucide-react';
import {
  useAcademicHierarchyFilters,
  type HierarchyOption,
} from '@/hooks/organization/use-academic-hierarchy-filters';
import { ACADEMIC_YEAR_UNSPECIFIED } from '@/lib/services/billing/reports/report-filter-params';
import {
  ACCOMMODATION_TYPE_OPTIONS,
  REPORT_SCHEME_OPTIONS,
  type BillingReportFilters,
  type ReportSchemeKey,
  type AccommodationCode,
} from '@/types/billing-schedule';

interface ReportFiltersProps {
  filters: BillingReportFilters;
  onFilterChange: (patch: Partial<BillingReportFilters>) => void;
}

const ALL = '_all_';

function FilterSelect({
  label, value, options, onChange, disabled, allLabel, extraItem,
}: {
  label: string;
  value: string | undefined;
  options: HierarchyOption[];
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
  allLabel: string;
  extraItem?: { value: string; label: string };
}) {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <Select
        value={value || ALL}
        onValueChange={(v) => onChange(v === ALL ? undefined : v)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent className='max-h-60 overflow-y-auto'>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {extraItem && (
            <SelectItem value={extraItem.value}>{extraItem.label}</SelectItem>
          )}
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ReportFilters({ filters, onFilterChange }: ReportFiltersProps) {
  const [collapsed, setCollapsed] = useState(false);
  const h = useAcademicHierarchyFilters(filters);

  // Single-institution users never see the Institution select (rendered
  // only when hasMultiInstitutionAccess below), so nothing else would ever
  // assign institution_id — leaving every dependent select permanently
  // disabled. Auto-pin it once the accessible institution list resolves.
  useEffect(() => {
    if (!h.loading.institutions && h.institutions.length === 1 && !filters.institution_id) {
      onFilterChange({ institution_id: h.institutions[0].id });
    }
  }, [h.loading.institutions, h.institutions, filters.institution_id, onFilterChange]);

  const set = (key: string, value: string | undefined) =>
    onFilterChange(h.cascadeClear(key, value) as Partial<BillingReportFilters>);

  const schemes = filters.schemes ?? [];
  const toggleScheme = (key: ReportSchemeKey, on: boolean) =>
    onFilterChange({
      schemes: on ? [...schemes, key] : schemes.filter((s) => s !== key),
    });

  const accommodationCodes = filters.accommodation_codes ?? [];
  const toggleAccommodation = (code: AccommodationCode, on: boolean) =>
    onFilterChange({
      accommodation_codes: on
        ? [...accommodationCodes, code]
        : accommodationCodes.filter((c) => c !== code),
    });

  const nameOf = (list: HierarchyOption[], id?: string) =>
    list.find((o) => o.id === id)?.name ?? 'Unknown';

  // `value` discriminates multi-select chips (schemes, accommodation_codes)
  // from single-value ones so dismissal can target the exact option that was
  // ticked instead of matching on the (possibly non-unique) rendered label.
  const chips = useMemo(() => {
    const out: { key: keyof BillingReportFilters; label: string; value?: string }[] = [];
    if (filters.institution_id) out.push({ key: 'institution_id', label: `Institution: ${nameOf(h.institutions, filters.institution_id)}` });
    if (filters.academic_year_id) out.push({
      key: 'academic_year_id',
      label: `Academic Year: ${filters.academic_year_id === ACADEMIC_YEAR_UNSPECIFIED
        ? 'Unspecified' : nameOf(h.academicYears, filters.academic_year_id)}`,
    });
    if (filters.degree_id) out.push({ key: 'degree_id', label: `Degree: ${nameOf(h.degrees, filters.degree_id)}` });
    if (filters.department_id) out.push({ key: 'department_id', label: `Department: ${nameOf(h.departments, filters.department_id)}` });
    if (filters.program_id) out.push({ key: 'program_id', label: `Program: ${nameOf(h.programs, filters.program_id)}` });
    if (filters.semester_id) out.push({ key: 'semester_id', label: `Semester: ${nameOf(h.semesters, filters.semester_id)}` });
    if (filters.section_id) out.push({ key: 'section_id', label: `Section: ${nameOf(h.sections, filters.section_id)}` });
    if (filters.item_category_id) out.push({ key: 'item_category_id', label: `Category: ${nameOf(h.categories, filters.item_category_id)}` });
    for (const s of schemes) {
      out.push({ key: 'schemes', value: s, label: REPORT_SCHEME_OPTIONS.find((o) => o.value === s)?.label ?? s });
    }
    for (const a of accommodationCodes) {
      out.push({
        key: 'accommodation_codes',
        value: a,
        label: `Accommodation: ${ACCOMMODATION_TYPE_OPTIONS.find((o) => o.value === a)?.label ?? a}`
      });
    }
    return out;
    // `h` is a fresh object literal every render (useAcademicHierarchyFilters
    // doesn't memoise its return value), so depending on it here would never
    // actually memoise anything. Depend on the specific option arrays this
    // callback reads instead — each is individually stable between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters, schemes, accommodationCodes,
    h.institutions, h.academicYears, h.degrees, h.departments,
    h.programs, h.semesters, h.sections, h.categories,
  ]);

  const clearAll = () =>
    onFilterChange({
      institution_id: undefined, academic_year_id: undefined,
      degree_id: undefined, department_id: undefined, program_id: undefined,
      semester_id: undefined, section_id: undefined, item_category_id: undefined,
      schemes: [], accommodation_codes: [], student_id: undefined,
      date_from: undefined, date_to: undefined,
    });

  const schemeLabel =
    schemes.length === 0 ? 'All Students'
      : schemes.length === 1
        ? REPORT_SCHEME_OPTIONS.find((o) => o.value === schemes[0])?.label
        : `${schemes.length} categories`;

  const accommodationLabel =
    accommodationCodes.length === 0 ? 'All Accommodation'
      : accommodationCodes.length === 1
        ? ACCOMMODATION_TYPE_OPTIONS.find((o) => o.value === accommodationCodes[0])?.label
        : `${accommodationCodes.length} types`;

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Filter className='h-4 w-4' />
          <span className='font-medium'>Report Filters</span>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='ghost' size='sm' onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? 'Expand' : 'Collapse'}
          </Button>
          {chips.length > 0 && (
            <Button variant='ghost' size='sm' onClick={clearAll}>
              <RotateCcw className='mr-2 h-4 w-4' />
              Reset All
            </Button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {chips.map((c) => (
            <Badge key={`${c.key}-${c.value ?? c.label}`} variant='secondary' className='flex items-center gap-1'>
              {c.label}
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 text-current'
                onClick={() => {
                  if (c.key === 'schemes') {
                    onFilterChange({ schemes: schemes.filter((s) => s !== c.value) });
                  } else if (c.key === 'accommodation_codes') {
                    onFilterChange({ accommodation_codes: accommodationCodes.filter((a) => a !== c.value) });
                  } else {
                    set(c.key as string, undefined);
                  }
                }}
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {!collapsed && (
        <>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {h.hasMultiInstitutionAccess && (
              <FilterSelect
                label='Institution' allLabel='All Institutions'
                value={filters.institution_id} options={h.institutions}
                disabled={h.loading.institutions}
                onChange={(v) => set('institution_id', v)}
              />
            )}

            <div className='space-y-2'>
              <FilterSelect
                label='Academic Year' allLabel='All Academic Years'
                value={filters.academic_year_id} options={h.academicYears}
                disabled={!filters.institution_id || h.loading.academicYears}
                extraItem={{ value: ACADEMIC_YEAR_UNSPECIFIED, label: 'Unspecified' }}
                onChange={(v) => set('academic_year_id', v)}
              />
              {filters.academic_year_id &&
                filters.academic_year_id !== ACADEMIC_YEAR_UNSPECIFIED && (
                  <p className='text-muted-foreground text-xs'>
                    Bills with no academic year recorded are excluded. Choose
                    &ldquo;Unspecified&rdquo; to see them.
                  </p>
                )}
            </div>

            <FilterSelect
              label='Degree' allLabel='All Degrees'
              value={filters.degree_id} options={h.degrees}
              disabled={!filters.institution_id || h.loading.degrees}
              onChange={(v) => set('degree_id', v)}
            />
            <FilterSelect
              label='Department' allLabel='All Departments'
              value={filters.department_id} options={h.departments}
              disabled={!filters.degree_id || h.loading.departments}
              onChange={(v) => set('department_id', v)}
            />
            <FilterSelect
              label='Program' allLabel='All Programs'
              value={filters.program_id} options={h.programs}
              disabled={!filters.department_id || h.loading.programs}
              onChange={(v) => set('program_id', v)}
            />
            <FilterSelect
              label='Semester' allLabel='All Semesters'
              value={filters.semester_id} options={h.semesters}
              disabled={!filters.program_id || h.loading.semesters}
              onChange={(v) => set('semester_id', v)}
            />
            <FilterSelect
              label='Section' allLabel='All Sections'
              value={filters.section_id} options={h.sections}
              disabled={!filters.semester_id || h.loading.sections}
              onChange={(v) => set('section_id', v)}
            />
            <FilterSelect
              label='Category' allLabel='All Categories'
              value={filters.item_category_id} options={h.categories}
              onChange={(v) => set('item_category_id', v)}
            />

            <div className='space-y-2'>
              <Label>Student Category</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant='outline' className='w-full justify-between font-normal'>
                    {schemeLabel}
                    <ChevronDown className='h-4 w-4 opacity-50' />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-56 space-y-2' align='start'>
                  {REPORT_SCHEME_OPTIONS.map((o) => (
                    <label key={o.value} className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={schemes.includes(o.value)}
                        onCheckedChange={(c) => toggleScheme(o.value, c === true)}
                      />
                      {o.label}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            <div className='space-y-2'>
              <Label>Accommodation</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant='outline' className='w-full justify-between font-normal'>
                    {accommodationLabel}
                    <ChevronDown className='h-4 w-4 opacity-50' />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-56 space-y-2' align='start'>
                  {ACCOMMODATION_TYPE_OPTIONS.map((o) => (
                    <label key={o.value} className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={accommodationCodes.includes(o.value)}
                        onCheckedChange={(c) => toggleAccommodation(o.value, c === true)}
                      />
                      {o.label}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
              {accommodationCodes.length > 0 && (
                <p className='text-muted-foreground text-xs'>
                  Learners with no accommodation recorded are excluded. Untick
                  all to include them.
                </p>
              )}
            </div>

            <div className='space-y-2'>
              <Label htmlFor='date_from'>Date From</Label>
              <Input
                id='date_from' type='date' value={filters.date_from || ''}
                max={filters.date_to || undefined}
                onChange={(e) => onFilterChange({ date_from: e.target.value || undefined })}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='date_to'>Date To</Label>
              <Input
                id='date_to' type='date' value={filters.date_to || ''}
                min={filters.date_from || undefined}
                onChange={(e) => onFilterChange({ date_to: e.target.value || undefined })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
