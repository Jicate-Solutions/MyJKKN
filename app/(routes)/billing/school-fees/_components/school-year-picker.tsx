'use client';

// school-year-picker.tsx
//
// Presentational school + academic-year selector. All state lives in
// useSchoolYearSelection; this component only renders it, so the term calendar
// and the fee-plan grid stay in step.

import { CalendarDays } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SchoolYearOption } from '@/hooks/school-fees/use-school-year-selection';
import { cn } from '@/lib/utils';

import { SECTION_THEMES, type SchoolFeeSection } from './section-theme';

interface SchoolYearPickerProps {
  title?: string;
  institutions: Array<{ id: string; name: string }>;
  institutionId: string;
  onInstitutionChange: (id: string) => void;
  yearOptions: SchoolYearOption[];
  academicYearId: string;
  onYearChange: (id: string) => void;
  loadingInstitutions: boolean;
  loadingYears: boolean;
  /** Rendered on the right of the header — clone buttons, "New plan", etc. */
  actions?: React.ReactNode;
  /** Section colour for the card header strip. */
  section?: SchoolFeeSection;
}

export function SchoolYearPicker({
  title = 'Select school and year',
  institutions,
  institutionId,
  onInstitutionChange,
  yearOptions,
  academicYearId,
  onYearChange,
  loadingInstitutions,
  loadingYears,
  actions,
  section,
}: SchoolYearPickerProps) {
  const theme = section ? SECTION_THEMES[section] : null;
  return (
    <Card className={cn(theme?.cardBorder)}>
      <CardHeader className={cn('pb-3', theme?.cardHeader)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md',
                theme?.iconTileSm ?? 'bg-muted text-muted-foreground',
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </span>
            {title}
          </CardTitle>
          {actions}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sy-institution">School</Label>
            <Select
              value={institutionId}
              onValueChange={onInstitutionChange}
              disabled={loadingInstitutions}
            >
              <SelectTrigger id="sy-institution">
                <SelectValue placeholder={loadingInstitutions ? 'Loading…' : 'Select a school'} />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingInstitutions && institutions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                You do not have access to any school. School fees apply only to institutions with
                entity type &quot;school&quot;.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sy-year">Academic year</Label>
            <Select
              value={academicYearId}
              onValueChange={onYearChange}
              disabled={!institutionId || loadingYears}
            >
              <SelectTrigger id="sy-year">
                <SelectValue
                  placeholder={
                    !institutionId
                      ? 'Select a school first'
                      : loadingYears
                        ? 'Loading…'
                        : 'Select an academic year'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.academic_year_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
