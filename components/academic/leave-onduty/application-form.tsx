'use client';

/**
 * Leave/OnDuty Application Form
 *
 * Complete form for creating leave and onduty applications with:
 * - Category and sub-category selection
 * - Date range selection
 * - Timetable-based period selection
 * - File attachment with validation
 * - Real-time validation
 *
 * @module components/academic/leave-onduty/application-form
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  ApplicationFormData,
  LeaveOndutyCategory,
  PeriodType,
  DEFAULT_VALIDATION_RULES,
} from '@/types/leave-onduty';
import type { LearnerLeaveType } from '@/types/learner-leave-types';

// Storage key for persisting form data
const FORM_STORAGE_KEY = 'leave-onduty-form-draft';

// Type for stored form data
interface StoredFormData {
  category: LeaveOndutyCategory;
  leaveTypeId: string;
  startDate: string | null;
  endDate: string | null;
  periodType: PeriodType;
  // Flat list kept for backward compat with older saved drafts; derived from
  // selectedPeriodsByDate going forward.
  selectedPeriods: string[];
  selectedPeriodsByDate?: Record<string, string[]>;
  reason: string;
  savedAt: number;
  // Persisted file as base64 for recovery after mobile page reload
  attachmentData?: {
    name: string;
    type: string;
    size: number;
    base64: string;
  } | null;
}

// Convert File to base64 data URL for sessionStorage persistence
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Reconstruct File from base64 data URL
function base64ToFile(data: { name: string; type: string; base64: string }): File {
  const arr = data.base64.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || data.type;
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new File([u8arr], data.name, { type: mime });
}
import { LeaveOndutyApplicationService } from '@/lib/services/academic/leave-onduty-application-service';
import { useCreateLeaveOndutyApplication } from '@/hooks/academic/use-leave-onduty';
import { useLearnerResidency, useEligibleLeaveTypes } from '@/hooks/learners/use-learner-leave-types';
import { SponsorPicker } from './sponsor-picker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, Home, Building2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { FileUpload } from './file-upload';
import { PeriodSelector } from './period-selector';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const formSchema = z.object({
  category: z.enum(['leave', 'onduty']),
  leave_type_id: z.string().min(1, 'Please select a type'),
  start_date: z.string().min(1, 'Please select start date'),
  end_date: z.string().min(1, 'Please select end date'),
  period_type: z.enum(['fullday', 'forenoon', 'afternoon', 'periodwise']),
  selected_periods: z.array(z.string()),
  reason: z
    .string()
    .min(1, 'Please provide a reason'),
});

interface ApplicationFormProps {
  learnerId: string;
  institutionId: string;
  sectionId: string;
  semesterId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ApplicationForm({
  learnerId,
  institutionId,
  sectionId,
  semesterId,
  onSuccess,
  onCancel,
}: ApplicationFormProps) {
  const [category, setCategory] = useState<LeaveOndutyCategory>('leave');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [periodType, setPeriodType] = useState<PeriodType>('fullday');
  // BUG-003209: store selected periods per-date so a multi-day leave picks hours
  // for every day, not just startDate. The legacy flat `selectedPeriods` string[]
  // is kept as a derived value (see useMemo below) for backend submission compat.
  const [selectedPeriodsByDate, setSelectedPeriodsByDate] = useState<
    Record<string, string[]>
  >({});
  // Per-date "can this be applied for?" reported by each PeriodSelector. The
  // server throws when period detection fails, so a date with no detectable
  // periods must block submission instead of failing after the learner has
  // filled the whole form.
  const [dateAvailability, setDateAvailability] = useState<
    Record<string, boolean>
  >({});
  const [reason, setReason] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [sponsorId, setSponsorId] = useState<string | null>(null);
  const [exitTime, setExitTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [dayCount, setDayCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // BUG-003209: build an inclusive date range from startDate→endDate so the
  // form can render a PeriodSelector per day of a multi-day leave.
  const daysInRange = useMemo<string[]>(() => {
    if (!startDate) return [];
    const end = endDate && endDate >= startDate ? endDate : startDate;
    const out: string[] = [];
    const cur = new Date(startDate);
    cur.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);
    while (cur <= last) {
      out.push(format(cur, 'yyyy-MM-dd'));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [startDate, endDate]);

  // Flat array submitted to the backend (legacy contract). Flattens each day's
  // selections in chronological order.
  const selectedPeriods = useMemo<string[]>(
    () => daysInRange.flatMap((d) => selectedPeriodsByDate[d] || []),
    [daysInRange, selectedPeriodsByDate]
  );

  const createApplication = useCreateLeaveOndutyApplication();

  // Load saved form data from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(FORM_STORAGE_KEY);
      if (saved) {
        const data: StoredFormData = JSON.parse(saved);

        // Check if saved data is less than 24 hours old
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (Date.now() - data.savedAt < maxAge) {
          console.log('[ApplicationForm] Restoring saved form data');
          setCategory(data.category);
          setLeaveTypeId(data.leaveTypeId || '');
          if (data.startDate) setStartDate(new Date(data.startDate));
          if (data.endDate) setEndDate(new Date(data.endDate));
          setPeriodType(data.periodType);
          // Prefer the new per-day map; fall back to legacy flat array under startDate.
          if (data.selectedPeriodsByDate) {
            setSelectedPeriodsByDate(data.selectedPeriodsByDate);
          } else if (data.selectedPeriods && data.startDate) {
            const legacyKey = format(new Date(data.startDate), 'yyyy-MM-dd');
            setSelectedPeriodsByDate({ [legacyKey]: data.selectedPeriods });
          }
          setReason(data.reason);
          // Restore file from base64 if available (survives mobile page reload)
          if (data.attachmentData) {
            try {
              const restoredFile = base64ToFile(data.attachmentData);
              setAttachmentFile(restoredFile);
            } catch {
              // Ignore corrupt data — user can re-upload
            }
          }
        } else {
          // Clear old data
          sessionStorage.removeItem(FORM_STORAGE_KEY);
        }
      }
    } catch (err) {
      console.warn('[ApplicationForm] Failed to restore saved form data:', err);
    }
    setIsInitialized(true);
  }, []);

  // Save form data to sessionStorage whenever it changes
  useEffect(() => {
    if (!isInitialized) return; // Don't save during initial load

    try {
      const dataToSave: StoredFormData = {
        category,
        leaveTypeId,
        startDate: startDate?.toISOString() || null,
        endDate: endDate?.toISOString() || null,
        periodType,
        selectedPeriods,
        selectedPeriodsByDate,
        reason,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(dataToSave));

      // Persist file as base64 asynchronously (survives mobile page reload)
      if (attachmentFile && attachmentFile.size <= 5 * 1024 * 1024) {
        fileToBase64(attachmentFile).then(base64 => {
          try {
            const current = sessionStorage.getItem(FORM_STORAGE_KEY);
            if (current) {
              const parsed = JSON.parse(current);
              parsed.attachmentData = {
                name: attachmentFile.name,
                type: attachmentFile.type,
                size: attachmentFile.size,
                base64,
              };
              sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(parsed));
            }
          } catch { /* quota exceeded — skip file persistence */ }
        }).catch(() => {});
      } else if (!attachmentFile) {
        // Clear stored file if removed
        try {
          const current = sessionStorage.getItem(FORM_STORAGE_KEY);
          if (current) {
            const parsed = JSON.parse(current);
            if (parsed.attachmentData) {
              parsed.attachmentData = null;
              sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(parsed));
            }
          }
        } catch { /* ignore */ }
      }
    } catch (err) {
      console.warn('[ApplicationForm] Failed to save form data:', err);
    }
  }, [category, leaveTypeId, startDate, endDate, periodType, selectedPeriods, reason, attachmentFile, isInitialized]);

  // Clear saved form data
  const clearSavedFormData = useCallback(() => {
    try {
      sessionStorage.removeItem(FORM_STORAGE_KEY);
    } catch (err) {
      console.warn('[ApplicationForm] Failed to clear saved form data:', err);
    }
  }, []);

  // Calculate day count when dates change
  useEffect(() => {
    if (startDate && endDate) {
      const days =
        Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      setDayCount(days);
    } else {
      setDayCount(0);
    }
  }, [startDate, endDate]);

  // Reset leave type when category changes (only after initialization)
  const [prevCategory, setPrevCategory] = useState<LeaveOndutyCategory | null>(null);
  useEffect(() => {
    if (isInitialized && prevCategory !== null && prevCategory !== category) {
      setLeaveTypeId('');
    }
    setPrevCategory(category);
  }, [category, isInitialized, prevCategory]);

  // Learner's residency drives which leave types are eligible — hostel/day
  // scholar rules differ (e.g. hostel-only leave types). fn_lo_seed_approvals
  // is the authoritative check server-side; this only filters the dropdown.
  const { data: residency, isLoading: residencyLoading } = useLearnerResidency(learnerId);
  const { data: eligibleTypes, isLoading: eligibleTypesLoading } = useEligibleLeaveTypes(
    residency,
    category
  );

  // Look up the full leave type row (for rules display + sponsor requirement)
  const selectedType: LearnerLeaveType | undefined = (eligibleTypes || []).find(
    (t) => t.id === leaveTypeId
  );
  const requiresSponsorApproval = !!selectedType?.requires_sponsor_approval;
  // A hostel learner leaving campus gets a gate pass on approval; the pass needs a
  // real exit/return time. The DB decides who actually gets one (fn_lo_sync_gate_pass).
  const needsGatePassTimes = residency === 'hostel' && !!selectedType?.issues_gate_pass;
  const sponsorRoleHint = selectedType?.sponsor_role_hint || null;

  // Reset sponsor when category/leave type changes (would be invalid anyway)
  useEffect(() => {
    if (isInitialized) {
      setSponsorId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveTypeId, category]);

  // If the selected period type is no longer allowed by the newly-chosen
  // type's rules, fall back to fullday rather than submit an invalid combo.
  useEffect(() => {
    if (!selectedType) return;
    if (periodType === 'periodwise' && !selectedType.allow_periodwise) {
      setPeriodType('fullday');
    } else if (
      (periodType === 'forenoon' || periodType === 'afternoon') &&
      !selectedType.allow_half_day
    ) {
      setPeriodType('fullday');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);

  // Which period-type options the selected leave type permits. Undefined
  // (nothing chosen yet) leaves PeriodSelector's own defaults untouched.
  const allowedPeriodTypes = useMemo<PeriodType[] | undefined>(() => {
    if (!selectedType) return undefined;
    const types: PeriodType[] = ['fullday'];
    if (selectedType.allow_half_day) types.push('forenoon', 'afternoon');
    if (selectedType.allow_periodwise) types.push('periodwise');
    return types;
  }, [selectedType]);

  const getFileRequirements = () => {
    const base = LeaveOndutyApplicationService.getFileRequirements(
      category,
      selectedType?.code || '',
      dayCount
    );
    if (selectedType?.requires_attachment) {
      return { ...base, required: true, reason: 'This leave type requires a supporting document.' };
    }
    return base;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation — BUG-003236: previously every branch here bare-returned with
    // no user feedback, so students saw the submit button do nothing and
    // assumed the form was broken. Surface each failure as a toast.
    if (!startDate || !endDate) {
      toast.error('Please pick both start and end dates.');
      return;
    }

    if (!leaveTypeId || !selectedType) {
      toast.error(`Please select a ${category === 'leave' ? 'leave' : 'on-duty'} type.`);
      return;
    }

    if (reason.length < 1) {
      toast.error('Please enter a reason for your application.');
      return;
    }

    if (periodType === 'periodwise' && selectedPeriods.length === 0) {
      toast.error('Please select at least one period.');
      return;
    }

    // The server rejects any date whose periods could not be detected. Stop here
    // with a clear message rather than surfacing the raw service error.
    if (blockedDates.length > 0) {
      toast.error(
        `No classes found on ${blockedDates
          .map((d) => format(new Date(d), 'dd MMM'))
          .join(', ')}. Please choose another date or contact your administrator.`
      );
      return;
    }

    // UX-only checks mirroring the type's rules — fn_lo_seed_approvals is the
    // authoritative enforcement server-side.
    if (selectedType.max_duration_days && dayCount > selectedType.max_duration_days) {
      toast.error(
        `${selectedType.name} allows at most ${selectedType.max_duration_days} day${selectedType.max_duration_days > 1 ? 's' : ''}. You selected ${dayCount}.`
      );
      return;
    }

    if (selectedType.advance_notice_hours > 0) {
      const minStart = new Date();
      minStart.setHours(0, 0, 0, 0);
      minStart.setDate(minStart.getDate() + Math.ceil(selectedType.advance_notice_hours / 24));
      const startCompare = new Date(startDate);
      startCompare.setHours(0, 0, 0, 0);
      if (startCompare < minStart) {
        toast.error(
          `${selectedType.name} must be applied at least ${selectedType.advance_notice_hours} hour${selectedType.advance_notice_hours > 1 ? 's' : ''} in advance.`
        );
        return;
      }
    }

    const fileReq = getFileRequirements();
    if (fileReq.required && !attachmentFile) {
      toast.error('This leave type requires a supporting document. Please attach a file.');
      return;
    }

    // Phase 2: sponsor requirement check
    if (requiresSponsorApproval && !sponsorId) {
      toast.error('Please tag the staff member who is supervising this activity.');
      return;
    }

    if (needsGatePassTimes) {
      if (!exitTime || !returnTime) {
        toast.error('Please enter the time you will leave and the time you will return.');
        return;
      }
      if (format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd') && returnTime <= exitTime) {
        toast.error('Return time must be after the exit time.');
        return;
      }
    }

    const formData: ApplicationFormData = {
      category,
      leave_type_id: leaveTypeId,
      sub_category: selectedType.code,
      start_date: format(startDate, 'yyyy-MM-dd'),
      end_date: format(endDate, 'yyyy-MM-dd'),
      period_type: periodType,
      selected_periods: selectedPeriods,
      reason,
      attachment_file: attachmentFile,
      exit_time: needsGatePassTimes ? exitTime : null,
      return_time: needsGatePassTimes ? returnTime : null,
      sponsor_id: requiresSponsorApproval ? sponsorId : null,
      applicable_type: 'individual',
      team_member_ids: [],
    };

    createApplication.mutate(
      {
        data: formData,
        learnerId,
        institutionId,
      },
      {
        onSuccess: () => {
          // Clear saved form data from sessionStorage
          clearSavedFormData();

          // Reset form
          setCategory('leave');
          setLeaveTypeId('');
          setStartDate(undefined);
          setEndDate(undefined);
          setPeriodType('fullday');
          // BUG: previously called setSelectedPeriods([]) — selectedPeriods is
          // a useMemo derived from selectedPeriodsByDate, so it had no setter.
          // Reset the source-of-truth instead.
          setSelectedPeriodsByDate({});
          setReason('');
          setAttachmentFile(null);
          setSponsorId(null);
          setExitTime('');
          setReturnTime('');
          onSuccess?.();
        },
      }
    );
  };

  // Dates whose periods could not be detected. `undefined` means "not reported
  // yet" (still loading) and must not block — only an explicit false does.
  const blockedDates = daysInRange.filter((d) => dateAvailability[d] === false);

  const isFormValid = () => {
    if (requiresSponsorApproval && !sponsorId) return false;
    if (needsGatePassTimes && (!exitTime || !returnTime)) return false;
    if (blockedDates.length > 0) return false;
    if (selectedType?.max_duration_days && dayCount > selectedType.max_duration_days) return false;
    return (
      category &&
      leaveTypeId &&
      startDate &&
      endDate &&
      periodType &&
      reason.length >= 1 &&
      (periodType !== 'periodwise' || selectedPeriods.length > 0) &&
      (!getFileRequirements().required || attachmentFile !== null)
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
      {/* Category Selection */}
      <div className="space-y-3">
        <Label className="text-sm sm:text-base font-medium">Application Type</Label>
        <RadioGroup
          value={category}
          onValueChange={(value) => setCategory(value as LeaveOndutyCategory)}
          className="grid grid-cols-2 gap-2 sm:gap-4"
        >
          <label
            className={cn(
              'flex items-center gap-2 sm:gap-3 rounded-lg border-2 p-3 sm:p-4 cursor-pointer transition-all',
              category === 'leave'
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary/50'
            )}
          >
            <RadioGroupItem value="leave" id="leave" className="h-4 w-4" />
            <div className="min-w-0">
              <div className="font-medium text-sm sm:text-base text-gray-900 dark:text-gray-100">Leave</div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                Leave of absence
              </div>
            </div>
          </label>
          <label
            className={cn(
              'flex items-center gap-2 sm:gap-3 rounded-lg border-2 p-3 sm:p-4 cursor-pointer transition-all',
              category === 'onduty'
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary/50'
            )}
          >
            <RadioGroupItem value="onduty" id="onduty" className="h-4 w-4" />
            <div className="min-w-0">
              <div className="font-medium text-sm sm:text-base text-gray-900 dark:text-gray-100">OnDuty</div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                Official duty
              </div>
            </div>
          </label>
        </RadioGroup>
      </div>

      {/* Residency badge — leave types are filtered by hostel vs day scholar */}
      {residencyLoading ? (
        <Skeleton className="h-6 w-40" />
      ) : residency ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            {residency === 'hostel' ? (
              <Building2 className="h-3.5 w-3.5" />
            ) : (
              <Home className="h-3.5 w-3.5" />
            )}
            {residency === 'hostel' ? 'Hostel learner' : 'Day scholar'}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Only leave types for your residency are shown.
          </span>
        </div>
      ) : null}

      {/* Leave/OnDuty Type Selection */}
      <div className="space-y-2 sm:space-y-3">
        <Label htmlFor="leave-type" className="text-sm sm:text-base font-medium">
          {category === 'leave' ? 'Leave type' : 'On-duty type'}
          <span className="text-red-500 ml-1">*</span>
        </Label>
        {residencyLoading || eligibleTypesLoading ? (
          <Skeleton className="h-10 sm:h-11 w-full" />
        ) : !residency ? null : (eligibleTypes || []).length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No leave types are available for you yet. Please contact the office.
            </AlertDescription>
          </Alert>
        ) : (
          <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
            <SelectTrigger id="leave-type" className="h-10 sm:h-11">
              <SelectValue placeholder={`Select ${category === 'leave' ? 'leave' : 'on-duty'} type`} />
            </SelectTrigger>
            <SelectContent>
              {(eligibleTypes || []).map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: type.color_code }}
                    />
                    {type.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Selected type's rules — UX hints only; the server is authoritative. */}
        {selectedType && (
          <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 pl-1">
            {selectedType.description && <li>{selectedType.description}</li>}
            {selectedType.max_duration_days && (
              <li>
                Max {selectedType.max_duration_days} day{selectedType.max_duration_days > 1 ? 's' : ''}
              </li>
            )}
            {selectedType.advance_notice_hours > 0 && (
              <li>
                Apply at least {selectedType.advance_notice_hours} hour
                {selectedType.advance_notice_hours > 1 ? 's' : ''} in advance
              </li>
            )}
            {selectedType.requires_attachment && <li>Supporting document required</li>}
            {selectedType.requires_sponsor_approval && (
              <li>
                Needs sponsor approval
                {sponsorRoleHint ? ` (${sponsorRoleHint})` : ''}
              </li>
            )}
            {!selectedType.affects_attendance && <li>Does not change class attendance</li>}
            {needsGatePassTimes && (
              <li>A gate pass is generated once the Chief Warden approves; it is valid for 12 hours from your exit time</li>
            )}
          </ul>
        )}
      </div>

      {/* Sponsor Picker — only shown when the selected leave type requires it */}
      {requiresSponsorApproval && leaveTypeId && (
        <SponsorPicker
          institutionId={institutionId}
          value={sponsorId}
          onChange={(id) => setSponsorId(id)}
          hint={sponsorRoleHint}
          categoryLabel={category === 'onduty' ? 'OnDuty' : 'Leave'}
        />
      )}

      {/* Date Range Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2 sm:space-y-3">
          <Label className="text-sm sm:text-base font-medium">
            Start Date<span className="text-red-500 ml-1">*</span>
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal h-10 sm:h-11 text-sm',
                  !startDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                {startDate ? format(startDate, 'MMM dd, yyyy') : <span>Select date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const maxBackdate = new Date(today);
                  maxBackdate.setDate(maxBackdate.getDate() - DEFAULT_VALIDATION_RULES.dates.maxBackdate);

                  const compareDate = new Date(date);
                  compareDate.setHours(0, 0, 0, 0);

                  return compareDate < maxBackdate;
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2 sm:space-y-3">
          <Label className="text-sm sm:text-base font-medium">
            End Date<span className="text-red-500 ml-1">*</span>
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal h-10 sm:h-11 text-sm',
                  !endDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                {endDate ? format(endDate, 'MMM dd, yyyy') : <span>Select date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
                disabled={(date) => {
                  if (!startDate) return true;

                  // Compare dates without time
                  const compareDate = new Date(date);
                  compareDate.setHours(0, 0, 0, 0);

                  const startCompare = new Date(startDate);
                  startCompare.setHours(0, 0, 0, 0);

                  return compareDate < startCompare;
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {dayCount > 0 && (
        <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 -mt-2 sm:-mt-4 bg-primary/5 px-3 py-2 rounded-lg inline-block">
          Total: <span className="font-medium">{dayCount} day{dayCount > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Period Selection — one PeriodSelector per day in the range.
          BUG-003209: previously rendered only for startDate, leaving day 2+
          with no period picker. */}
      {startDate && daysInRange.map((dateStr, idx) => (
        <div key={dateStr} className="space-y-2">
          {daysInRange.length > 1 && (
            <div className="text-xs sm:text-sm font-medium text-muted-foreground">
              Day {idx + 1} of {daysInRange.length}: {format(new Date(dateStr), 'EEEE, dd MMM yyyy')}
            </div>
          )}
          <PeriodSelector
            sectionId={sectionId}
            semesterId={semesterId}
            selectedDate={dateStr}
            periodType={periodType}
            allowedPeriodTypes={allowedPeriodTypes}
            selectedPeriods={selectedPeriodsByDate[dateStr] || []}
            onPeriodTypeChange={setPeriodType}
            onPeriodsChange={(periods) =>
              setSelectedPeriodsByDate((prev) => ({ ...prev, [dateStr]: periods }))
            }
            onAvailabilityChange={(available) =>
              setDateAvailability((prev) =>
                prev[dateStr] === available ? prev : { ...prev, [dateStr]: available }
              )
            }
          />
        </div>
      ))}

      {/* Gate pass times — hostel learners on an off-campus type */}
      {needsGatePassTimes && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="exit-time" className="text-sm sm:text-base font-medium">
              Exit time (start date)<span className="text-red-500 ml-1">*</span>
            </Label>
            <Input
              id="exit-time"
              type="time"
              value={exitTime}
              onChange={(e) => setExitTime(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="return-time" className="text-sm sm:text-base font-medium">
              Return time (end date)<span className="text-red-500 ml-1">*</span>
            </Label>
            <Input
              id="return-time"
              type="time"
              value={returnTime}
              onChange={(e) => setReturnTime(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Reason */}
      <div className="space-y-2 sm:space-y-3">
        <Label htmlFor="reason" className="text-sm sm:text-base font-medium">
          Reason<span className="text-red-500 ml-1">*</span>
        </Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Please provide a detailed reason for your application..."
          className="min-h-[100px] sm:min-h-[120px] resize-none text-sm"
        />
      </div>

      {/* File Attachment */}
      {leaveTypeId && (
        <FileUpload
          onFileSelect={setAttachmentFile}
          requirements={getFileRequirements()}
          selectedFile={attachmentFile}
        />
      )}

      {/* Why submit is disabled. Without this a multi-day range gives no clue
          which day is the blocker. */}
      {blockedDates.length > 0 && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-xs sm:text-sm text-red-800 dark:text-red-200">
          No classes found on{' '}
          <span className="font-medium">
            {blockedDates.map((d) => format(new Date(d), 'dd MMM yyyy')).join(', ')}
          </span>
          . You cannot submit until every day in the range has a timetable.
        </div>
      )}

      {/* Form Actions - Stack on mobile */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={createApplication.isPending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={!isFormValid() || createApplication.isPending}
          className="w-full sm:flex-1"
        >
          {createApplication.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Submit Application
        </Button>
      </div>
    </form>
  );
}
