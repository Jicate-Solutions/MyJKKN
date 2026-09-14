'use client';

import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useDepartments } from '@/hooks/organization/use-departments';
import { InsightsAccessError } from '@/lib/services/academic/faculty-calendar-insights-service';

export interface InsightsSelection {
  institutionId: string | null;
  departmentId: string | null;
  /** 'YYYY-MM-DD' */
  date: string;
}

interface Props {
  institutions: Array<{ id: string; name: string }>;
  institutionsLoading: boolean;
  value: InsightsSelection;
  onChange: (next: InsightsSelection) => void;
  dateLabel: string;
  adapt: (label: string) => string;
  children?: ReactNode;
}

const ALL = 'all';

/** Institution, department and date, shared by the Availability, Workload and Conflicts tabs. */
export function InsightsScopeBar({
  institutions,
  institutionsLoading,
  value,
  onChange,
  dateLabel,
  adapt,
  children
}: Props) {
  const { data: departments } = useDepartments({
    institution_id: value.institutionId ?? undefined,
    isActive: true
  });

  return (
    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      <div className='space-y-1.5'>
        <Label>Institution</Label>
        <Select
          value={value.institutionId ?? undefined}
          onValueChange={(id) => onChange({ ...value, institutionId: id, departmentId: null })}
          disabled={institutionsLoading || institutions.length === 0}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                institutionsLoading
                  ? 'Loading institutions…'
                  : institutions.length === 0
                    ? 'No institutions available to you'
                    : 'Choose an institution'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {institutions.map((inst) => (
              <SelectItem key={inst.id} value={inst.id}>
                {inst.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <Label>{adapt('Department')}</Label>
        <Select
          value={value.departmentId ?? ALL}
          onValueChange={(id) => onChange({ ...value, departmentId: id === ALL ? null : id })}
          disabled={!value.institutionId}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{adapt('All Departments')}</SelectItem>
            {departments?.data?.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.department_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <Label htmlFor='senior-learner-insights-date'>{dateLabel}</Label>
        <Input
          id='senior-learner-insights-date'
          type='date'
          value={value.date}
          onChange={(e) => e.target.value && onChange({ ...value, date: e.target.value })}
        />
      </div>

      {children}
    </div>
  );
}

/** 'YYYY-MM-DD' → 'Mon 14 Sep' without time-zone drift. */
export function formatDay(date: string, pattern = 'EEE d MMM'): string {
  return format(new Date(`${date}T12:00:00`), pattern);
}

export function InsightsNotice({
  tone = 'info',
  children
}: {
  tone?: 'info' | 'warning';
  children: ReactNode;
}) {
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      className={
        tone === 'warning'
          ? 'flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200'
          : 'flex gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground'
      }
    >
      <Icon className='mt-0.5 h-4 w-4 shrink-0' />
      <div>{children}</div>
    </div>
  );
}

export function InsightsLoading({ message }: { message: string }) {
  return (
    <div className='flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground'>
      <Loader2 className='h-4 w-4 animate-spin' />
      {message}
    </div>
  );
}

export function InsightsEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className='rounded-lg border-2 border-dashed py-10 text-center'>
      <p className='font-medium'>{title}</p>
      {hint && <p className='mt-1 text-sm text-muted-foreground'>{hint}</p>}
    </div>
  );
}

export function InsightsError({ error, what }: { error: unknown; what: string }) {
  if (error instanceof InsightsAccessError) {
    return (
      <InsightsEmpty
        title="You don't have access to this institution."
        hint='Choose one of your own institutions, or ask your administrator for access.'
      />
    );
  }
  const detail = error instanceof Error ? error.message : '';
  return (
    <InsightsEmpty
      title={`Could not load ${what}.`}
      hint={detail ? `${detail} Try again, or refresh the page.` : 'Try again, or refresh the page.'}
    />
  );
}
