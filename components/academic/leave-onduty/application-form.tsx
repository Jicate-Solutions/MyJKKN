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

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  ApplicationFormData,
  LeaveOndutyCategory,
  LEAVE_SUB_CATEGORIES,
  ONDUTY_SUB_CATEGORIES,
  PeriodType,
  DEFAULT_VALIDATION_RULES,
} from '@/types/leave-onduty';

// Storage key for persisting form data
const FORM_STORAGE_KEY = 'leave-onduty-form-draft';

// Type for stored form data
interface StoredFormData {
  category: LeaveOndutyCategory;
  subCategory: string;
  startDate: string | null;
  endDate: string | null;
  periodType: PeriodType;
  selectedPeriods: string[];
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
import { useLeaveOndutySubCategories } from '@/hooks/academic/use-leave-onduty-sub-categories';
import { SponsorPicker } from './sponsor-picker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
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
  sub_category: z.string().min(1, 'Please select a sub-category'),
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
  const [subCategory, setSubCategory] = useState('');
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [periodType, setPeriodType] = useState<PeriodType>('fullday');
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [sponsorId, setSponsorId] = useState<string | null>(null);
  const [dayCount, setDayCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

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
          setSubCategory(data.subCategory);
          if (data.startDate) setStartDate(new Date(data.startDate));
          if (data.endDate) setEndDate(new Date(data.endDate));
          setPeriodType(data.periodType);
          setSelectedPeriods(data.selectedPeriods);
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
        subCategory,
        startDate: startDate?.toISOString() || null,
        endDate: endDate?.toISOString() || null,
        periodType,
        selectedPeriods,
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
  }, [category, subCategory, startDate, endDate, periodType, selectedPeriods, reason, attachmentFile, isInitialized]);

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

  // Reset sub-category when category changes (only after initialization)
  const [prevCategory, setPrevCategory] = useState<LeaveOndutyCategory | null>(null);
  useEffect(() => {
    if (isInitialized && prevCategory !== null && prevCategory !== category) {
      setSubCategory('');
    }
    setPrevCategory(category);
  }, [category, isInitialized, prevCategory]);

  // Fetch admin-managed sub-categories for this institution
  const { data: dbSubCategories, isLoading: dbSubCategoriesLoading } =
    useLeaveOndutySubCategories(
      institutionId,
      { activeOnly: true },
      { enabled: !!institutionId }
    );

  // Look up the full sub-category row (for sponsor requirement)
  const selectedSubCategoryRow = (dbSubCategories || []).find(
    (r) => r.category === category && r.code === subCategory
  );
  const requiresSponsorApproval = !!selectedSubCategoryRow?.requires_sponsor_approval;
  const sponsorRoleHint = selectedSubCategoryRow?.sponsor_role_hint || null;

  // Reset sponsor when category/sub-category changes (would be invalid anyway)
  useEffect(() => {
    if (isInitialized) {
      setSponsorId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subCategory, category]);

  const getSubCategories = () => {
    // While still fetching, show the hard-coded constants so the dropdown is
    // never empty on first paint. Once loaded, use only the DB rows — if the
    // admin has intentionally removed all options, the dropdown MUST reflect
    // that (do not silently revert to the constants).
    if (dbSubCategoriesLoading) {
      return category === 'leave' ? LEAVE_SUB_CATEGORIES : ONDUTY_SUB_CATEGORIES;
    }
    return (dbSubCategories || [])
      .filter((r) => r.category === category)
      .map((r) => ({ value: r.code, label: r.name }));
  };

  const getFileRequirements = () => {
    return LeaveOndutyApplicationService.getFileRequirements(
      category,
      subCategory,
      dayCount
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!startDate || !endDate) {
      return;
    }

    if (!subCategory) {
      return;
    }

    if (reason.length < 1) {
      return;
    }

    if (periodType === 'periodwise' && selectedPeriods.length === 0) {
      return;
    }

    const fileReq = getFileRequirements();
    if (fileReq.required && !attachmentFile) {
      return;
    }

    // Phase 2: sponsor requirement check
    if (requiresSponsorApproval && !sponsorId) {
      return;
    }

    const formData: ApplicationFormData = {
      category,
      sub_category: subCategory,
      start_date: format(startDate, 'yyyy-MM-dd'),
      end_date: format(endDate, 'yyyy-MM-dd'),
      period_type: periodType,
      selected_periods: selectedPeriods,
      reason,
      attachment_file: attachmentFile,
      sponsor_id: requiresSponsorApproval ? sponsorId : null,
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
          setSubCategory('');
          setStartDate(undefined);
          setEndDate(undefined);
          setPeriodType('fullday');
          setSelectedPeriods([]);
          setReason('');
          setAttachmentFile(null);
          setSponsorId(null);
          onSuccess?.();
        },
      }
    );
  };

  const isFormValid = () => {
    if (requiresSponsorApproval && !sponsorId) return false;
    return (
      category &&
      subCategory &&
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

      {/* Sub-category Selection */}
      <div className="space-y-2 sm:space-y-3">
        <Label htmlFor="sub-category" className="text-sm sm:text-base font-medium">
          {category === 'leave' ? 'Leave Type' : 'OnDuty Type'}
          <span className="text-red-500 ml-1">*</span>
        </Label>
        <Select value={subCategory} onValueChange={setSubCategory}>
          <SelectTrigger id="sub-category" className="h-10 sm:h-11">
            <SelectValue placeholder={`Select ${category} type`} />
          </SelectTrigger>
          <SelectContent>
            {getSubCategories().map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sponsor Picker — only shown when the selected sub-category requires it */}
      {requiresSponsorApproval && subCategory && (
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

      {/* Period Selection */}
      {startDate && (
        <PeriodSelector
          sectionId={sectionId}
          semesterId={semesterId}
          selectedDate={format(startDate, 'yyyy-MM-dd')}
          periodType={periodType}
          selectedPeriods={selectedPeriods}
          onPeriodTypeChange={setPeriodType}
          onPeriodsChange={setSelectedPeriods}
        />
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
      {subCategory && (
        <FileUpload
          onFileSelect={setAttachmentFile}
          requirements={getFileRequirements()}
          selectedFile={attachmentFile}
        />
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
