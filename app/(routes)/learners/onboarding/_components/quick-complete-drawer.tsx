'use client';
/**
 * Quick Complete Drawer
 *
 * Opens from the right edge and renders ONLY the missing required fields for
 * a single learner. Optimised for fast triage — no full edit page, no form
 * state lost on tab switch (state is local to the drawer mount).
 *
 * Guardrails:
 *   - Double-submit protection via early-return on isPending (see
 *     feedback_react_query_disabled_prop_alone_isnt_enough — disabled prop
 *     alone leaves a ~16ms race window between mutateAsync and React commit).
 *   - College email must end in @jkkn.ac.in (mirrors the DB validation).
 *   - Cascading academic dropdowns: institution → year, program → semester →
 *     section. If institution_id or program_id is missing on the learner row,
 *     we surface a notice asking the admin to use the full edit form, since
 *     academic data can't be assigned without those base fields.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useUpdateLearnerProfile } from '@/hooks/use-learner-profiles';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import type { OnboardingProfileRow, QuickCompletePayload } from '@/types/learner-onboarding';

interface QuickCompleteDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learner: OnboardingProfileRow;
}

const COLLEGE_EMAIL_DOMAIN = '@jkkn.ac.in';

export function QuickCompleteDrawer({ open, onOpenChange, learner }: QuickCompleteDrawerProps) {
  const router = useRouter();
  const updateMutation = useUpdateLearnerProfile();

  const needsEmail = learner.missing_fields.includes('college_email');
  const needsYear = learner.missing_fields.includes('academic_year_id');
  const needsSemester = learner.missing_fields.includes('semester_id');
  const needsSection = learner.missing_fields.includes('section_id');

  // Academic data can't be assigned without the base institution+program assignments
  const missingBaseAcademic =
    (needsYear || needsSemester || needsSection) &&
    (!learner.institution_id || !learner.program_id);

  const [emailValue, setEmailValue] = useState('');
  const [academicYearId, setAcademicYearId] = useState<string | undefined>(undefined);
  const [semesterId, setSemesterId] = useState<string | undefined>(undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(undefined);

  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);

  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);

  // Reset form whenever the drawer opens for a new learner
  useEffect(() => {
    if (open) {
      setEmailValue('');
      setAcademicYearId(undefined);
      setSemesterId(undefined);
      setSectionId(undefined);
    }
  }, [open, learner.id]);

  // Load academic years for the learner's institution
  useEffect(() => {
    if (!open || !needsYear || !learner.institution_id) {
      setAcademicYears([]);
      return;
    }
    setLoadingYears(true);
    AcademicYearService.getAcademicYearsByInstitution(learner.institution_id)
      .then((data) => setAcademicYears(data || []))
      .catch((err) => {
        console.error('[quick-complete] academic years:', err);
        setAcademicYears([]);
      })
      .finally(() => setLoadingYears(false));
  }, [open, needsYear, learner.institution_id]);

  // Load semesters for the learner's program
  useEffect(() => {
    if (!open || !needsSemester || !learner.program_id) {
      setSemesters([]);
      return;
    }
    setLoadingSemesters(true);
    SemesterService.getSemestersByProgram(learner.program_id)
      .then((data) => setSemesters(data || []))
      .catch((err) => {
        console.error('[quick-complete] semesters:', err);
        setSemesters([]);
      })
      .finally(() => setLoadingSemesters(false));
  }, [open, needsSemester, learner.program_id]);

  // Load sections — depends on chosen semester (new) or existing semester (if only section is missing)
  const effectiveSemesterId = needsSemester ? semesterId : learner.semester_id;
  useEffect(() => {
    if (!open || !needsSection || !effectiveSemesterId) {
      setSections([]);
      return;
    }
    setLoadingSections(true);
    SectionService.getSections({
      semester_id: effectiveSemesterId,
      page: 1,
      limit: 1000,
      isActive: true
    })
      .then((res) => setSections(res.data || []))
      .catch((err) => {
        console.error('[quick-complete] sections:', err);
        setSections([]);
      })
      .finally(() => setLoadingSections(false));
  }, [open, needsSection, effectiveSemesterId]);

  // Reset section when semester changes
  useEffect(() => {
    setSectionId(undefined);
  }, [semesterId]);

  const validateAndBuildPayload = (): { payload: QuickCompletePayload } | { error: string } => {
    const payload: QuickCompletePayload = {};

    if (needsEmail) {
      const v = emailValue.trim();
      if (!v) return { error: 'College Email is required.' };
      if (!v.toLowerCase().endsWith(COLLEGE_EMAIL_DOMAIN)) {
        return { error: `College Email must end with ${COLLEGE_EMAIL_DOMAIN}.` };
      }
      payload.college_email = v;
    }
    if (needsYear) {
      if (!academicYearId) return { error: 'Academic Year is required.' };
      payload.academic_year_id = academicYearId;
    }
    if (needsSemester) {
      if (!semesterId) return { error: 'Semester is required.' };
      payload.semester_id = semesterId;
    }
    if (needsSection) {
      if (!sectionId) return { error: 'Section is required.' };
      payload.section_id = sectionId;
    }
    return { payload };
  };

  const handleSubmit = useCallback(async () => {
    // Double-submit guard — disabled prop alone has a ~16ms race window.
    if (updateMutation.isPending) return;

    const result = validateAndBuildPayload();
    if ('error' in result) {
      toast.error(result.error);
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: learner.id,
        dto: result.payload as any
      });
      toast.success(`${learner.first_name} ${learner.last_name || ''}'s profile updated`);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error('[quick-complete] update failed:', err);
      toast.error('Failed to update profile. Please try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailValue, academicYearId, semesterId, sectionId, learner.id, updateMutation.isPending]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Quick Complete
          </SheetTitle>
          <SheetDescription>
            Fill the missing onboarding fields for{' '}
            <span className="font-medium text-foreground">
              {learner.first_name} {learner.last_name || ''}
            </span>
            .
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-5">
          {/* Summary of what's missing */}
          <div className="flex flex-wrap gap-1.5">
            {learner.missing_field_labels.map((label) => (
              <Badge
                key={label}
                variant="outline"
                className="border-red-300 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 text-xs"
              >
                {label}
              </Badge>
            ))}
          </div>

          {missingBaseAcademic && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Base academic data missing</AlertTitle>
              <AlertDescription>
                This learner doesn&apos;t yet have an institution or program assigned, so academic
                year/semester/section can&apos;t be picked here. Use the full edit form instead.
              </AlertDescription>
            </Alert>
          )}

          {/* College Email */}
          {needsEmail && (
            <div className="space-y-2">
              <Label htmlFor="qc-email">
                College Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="qc-email"
                type="email"
                placeholder={`name${COLLEGE_EMAIL_DOMAIN}`}
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                disabled={updateMutation.isPending}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Must end with {COLLEGE_EMAIL_DOMAIN}.
              </p>
            </div>
          )}

          {/* Academic Year */}
          {needsYear && !missingBaseAcademic && (
            <div className="space-y-2">
              <Label htmlFor="qc-year">
                Academic Year <span className="text-red-500">*</span>
              </Label>
              <Select
                value={academicYearId}
                onValueChange={setAcademicYearId}
                disabled={loadingYears || updateMutation.isPending}
              >
                <SelectTrigger id="qc-year">
                  <SelectValue
                    placeholder={loadingYears ? 'Loading...' : 'Select Academic Year'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.academic_year_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Semester */}
          {needsSemester && !missingBaseAcademic && (
            <div className="space-y-2">
              <Label htmlFor="qc-sem">
                Semester <span className="text-red-500">*</span>
              </Label>
              <Select
                value={semesterId}
                onValueChange={setSemesterId}
                disabled={loadingSemesters || updateMutation.isPending}
              >
                <SelectTrigger id="qc-sem">
                  <SelectValue
                    placeholder={loadingSemesters ? 'Loading...' : 'Select Semester'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {semesters.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.semester_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Section */}
          {needsSection && !missingBaseAcademic && (
            <div className="space-y-2">
              <Label htmlFor="qc-sec">
                Section <span className="text-red-500">*</span>
              </Label>
              <Select
                value={sectionId}
                onValueChange={setSectionId}
                disabled={loadingSections || !effectiveSemesterId || updateMutation.isPending}
              >
                <SelectTrigger id="qc-sec">
                  <SelectValue
                    placeholder={
                      !effectiveSemesterId
                        ? 'Pick a semester first'
                        : loadingSections
                          ? 'Loading...'
                          : 'Select Section'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.section_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <SheetFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={updateMutation.isPending || missingBaseAcademic}>
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Save & Complete
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
