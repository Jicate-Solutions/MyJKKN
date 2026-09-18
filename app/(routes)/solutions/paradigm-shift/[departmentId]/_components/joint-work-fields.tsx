'use client';

/**
 * The two optional fields the record form gained when one initiative stopped
 * meaning one department: who else ran it, and which event it was run as.
 *
 * MOUNTED ONLY WHILE THE DIALOG IS OPEN. Both fields fetch a list, and both
 * lists are useless until somebody is actually typing an entry. Keeping them in
 * their own components means the department detail page does not pay for a
 * solution-department list and an events list on every load — the same reason
 * useDepartmentSolutionOptions takes an `enabled` flag.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MultiSelectCombobox } from '@/components/shared/crud-master/multi-select-combobox';
import { EventBaseService } from '@/lib/services/events/core/event-base-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { Event } from '@/types/events';
import { useSolutionDepartmentRows } from './engagement-participants';

/** Radix Select rejects value=""; this is the "not linked to an event" option. */
export const NO_EVENT = '__no_event__';

function formatEventDate(event: Event): string {
  const raw = event.event_date ?? event.start_date;
  if (!raw) return 'date not set';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============================================
// WHO ELSE RAN IT
// ============================================

interface JointDepartmentsFieldProps {
  /** The department recording the entry. It is implicit and never offered. */
  recordingDepartmentId: string;
  selectedDepartmentIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** False when this build has no way to save the names — say so, don't pretend. */
  supported: boolean;
}

export function JointDepartmentsField({
  recordingDepartmentId,
  selectedDepartmentIds,
  onChange,
  disabled = false,
  supported,
}: JointDepartmentsFieldProps) {
  const {
    data: departments = [],
    isLoading: loading,
    error,
  } = useSolutionDepartmentRows(supported);

  /**
   * `department_id` is the option value, not the `sh_solution_departments.id`
   * surrogate key: the participants table's own department_id references
   * public.departments, which is also what the recording department and the
   * confirming approver's profile are keyed by. Offering the surrogate key here
   * would make every name unsaveable and no head of department would ever match
   * their own row.
   */
  const options = useMemo(() => {
    const seen = new Set<string>([recordingDepartmentId]);
    const list: Array<{ id: string; label: string }> = [];

    for (const row of departments) {
      const departmentId = row.department_id;
      if (!departmentId || seen.has(departmentId)) continue;
      seen.add(departmentId);

      // `display_name` first, then the formal name — the order
      // SocietalService.mapParticipantRow and fn_community_college_totals()
      // both use. A department picked here is the same department that appears
      // on the confirmation screen, and it must read identically in both.
      const name =
        row.department?.display_name || row.department?.department_name || 'Unnamed department';
      const code = row.department?.department_code;
      const college = row.institution?.display_name || row.institution?.name;
      const label = [code ? `${name} (${code})` : name, college].filter(Boolean).join(' — ');

      list.push({ id: departmentId, label });
    }

    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [departments, recordingDepartmentId]);

  if (!supported) {
    return (
      <div className="space-y-2">
        <Label>Other departments that ran this with us</Label>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This version of the application cannot yet save the names of other departments, so the
            picker is not offered rather than shown and quietly ignored. Record the entry under
            this department; the others can be added to it once that part is rolled out.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="engagement-joint-departments">
        Other departments that ran this with us (optional)
      </Label>
      <MultiSelectCombobox
        className="w-full"
        options={options}
        selectedIds={selectedDepartmentIds}
        onSelectionChange={onChange}
        placeholder="Nobody else — this department ran it alone"
        searchPlaceholder="Search departments…"
        emptyText={
          loading ? 'Loading departments…' : 'No other solution department is available to name.'
        }
        loading={loading}
        disabled={disabled}
      />

      {error ? (
        // An empty picker because the list failed and an empty picker because
        // there is nobody to name look identical and mean opposite things.
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The list of departments could not be loaded, so this picker is empty for a reason that is
          not &ldquo;there are none&rdquo;. You can still save the entry without naming anyone.
        </p>
      ) : null}

      {/*
        THE ANTI-GAMING SENTENCE. Naming a department here awards it nothing.
        Every named department's own head confirms their own part, and an
        unconfirmed name counts nowhere. A coordinator who believes the opposite
        will name six departments and expect six colleges to show the work.
      */}
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
        <Info className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        <AlertDescription className="text-amber-700 dark:text-amber-400">
          Naming a department here does not give it credit. Each one is added as{' '}
          <strong>waiting</strong>, and the head of that department confirms their own part. Until
          they do, it does not count towards them anywhere.
        </AlertDescription>
      </Alert>

      {selectedDepartmentIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedDepartmentIds.length} department
          {selectedDepartmentIds.length === 1 ? '' : 's'} will be asked to confirm.
        </p>
      )}
    </div>
  );
}

// ============================================
// WHICH EVENT IT WAS RUN AS
// ============================================

interface EngagementEventFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** False when this build cannot store the link — say so, don't pretend. */
  supported: boolean;
}

export function EngagementEventField({
  value,
  onChange,
  disabled = false,
  supported,
}: EngagementEventFieldProps) {
  const {
    data: events = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['solutions-hub', 'community-engagements', 'linkable-events'],
    // Every event RLS lets this person see. Deliberately NOT narrowed to
    // "general" events: a charity marathon and an outreach camp run under a
    // tournament are exactly the joint community work this register is for.
    queryFn: () => EventBaseService.getEvents({}),
    enabled: supported,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
    // After the spread on purpose — SEMI_STABLE_DATA carries `retry: 1`, which
    // would silently win if this line sat above it. One attempt is enough: the
    // link is optional and a retry only delays the form.
    retry: false,
  });

  const options = useMemo(() => {
    const rows = [...events];
    rows.sort((a, b) => {
      const aDate = a.event_date ?? a.start_date ?? '';
      const bDate = b.event_date ?? b.start_date ?? '';
      return bDate.localeCompare(aDate);
    });
    return rows;
  }, [events]);

  if (!supported) return null;

  return (
    <div className="space-y-2">
      <Label htmlFor="engagement-event">Was this also an event? (optional)</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="engagement-event">
          <SelectValue placeholder="Not linked to an event" />
        </SelectTrigger>
        <SelectContent>
          {/* Never value="" — Radix rejects it and a CI gate checks for it. */}
          <SelectItem value={NO_EVENT}>Not linked to an event</SelectItem>
          {options.map((event) => (
            <SelectItem key={event.id} value={event.id}>
              {event.name} — {formatEventDate(event)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The list of events could not be loaded, so this picker is empty for a reason that is not
          &ldquo;there are none&rdquo;. You can still save the entry without linking an event.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isLoading
            ? 'Loading events…'
            : 'Link a camp that was also on the events calendar, so it is never typed twice. Most community work was never an event — leave this alone if that is the case.'}
        </p>
      )}
    </div>
  );
}
