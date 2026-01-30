'use client';

import { useState } from 'react';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { CopyPlus, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StaffPlanService, CloneStaffPlanResult } from '@/lib/services/academic/staff-plan-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { logger } from '@/lib/utils/enhanced-logger';

const bulkCloneFormSchema = z.object({
  semester_id: z.string().min(1, 'Please select a semester'),
  source_academic_year_id: z.string().min(1, 'Please select source academic year'),
  target_academic_year_id: z.string().min(1, 'Please select target academic year'),
  adjust_dates: z.boolean().default(true),
  preserve_inactive: z.boolean().default(false),
});

type BulkCloneFormValues = z.infer<typeof bulkCloneFormSchema>;

interface BulkCloneStaffPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  onSuccess?: () => void;
}

export function BulkCloneStaffPlanDialog({
  open,
  onOpenChange,
  institutionId,
  onSuccess,
}: BulkCloneStaffPlanDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [cloneProgress, setCloneProgress] = useState(0);
  const [cloneResults, setCloneResults] = useState<CloneStaffPlanResult[]>([]);
  const [academicYears, setAcademicYears] = useState<
    Array<{ id: string; academic_year_name: string; is_active: boolean }>
  >([]);
  const [semesters, setSemesters] = useState<
    Array<{ id: string; semester_name: string }>
  >([]);

  const form = useForm<BulkCloneFormValues>({
    resolver: zodResolver(bulkCloneFormSchema),
    defaultValues: {
      semester_id: '',
      source_academic_year_id: '',
      target_academic_year_id: '',
      adjust_dates: true,
      preserve_inactive: false,
    },
  });

  React.useEffect(() => {
    if (open && institutionId) {
      fetchAcademicYears();
      fetchSemesters();
    }
  }, [open, institutionId]);

  const fetchAcademicYears = async () => {
    try {
      const { data } = await AcademicYearService.getAcademicYears({
        institution_id: institutionId,
        limit: 50,
      });

      if (data) {
        setAcademicYears(data);
      }
    } catch (error) {
      logger.error('academic/staff-planning', 'Error fetching academic years', error);
    }
  };

  const fetchSemesters = async () => {
    try {
      const { data } = await SemesterService.getSemesters({
        institution_id: institutionId,
        isActive: true,
        limit: 100,
      });

      if (data) {
        setSemesters(data);
      }
    } catch (error) {
      logger.error('academic/staff-planning', 'Error fetching semesters', error);
    }
  };

  const onSubmit = async (values: BulkCloneFormValues) => {
    try {
      setIsLoading(true);
      setCloneProgress(0);
      setCloneResults([]);

      // Get all programs that have staff plans for this semester
      const { data: staffPlans } = await StaffPlanService.getStaffPlans({
        institution_id: institutionId,
        semester_id: values.semester_id,
        academic_year_id: values.source_academic_year_id,
        limit: 1000,
        disableConsolidation: true,
      });

      if (!staffPlans || staffPlans.length === 0) {
        toast.error('No staff plans found for the selected semester and academic year');
        setIsLoading(false);
        return;
      }

      // Get unique program IDs from staff plans
      const programIds = [...new Set(staffPlans.map(plan => plan.program_id))];
      const totalPrograms = programIds.length;
      const allResults: CloneStaffPlanResult[] = [];

      // Clone each program's staff plans
      for (let i = 0; i < programIds.length; i++) {
        const programId = programIds[i];

        try {
          const results = await StaffPlanService.cloneSemesterToNewYear(
            institutionId,
            programId,
            values.semester_id,
            values.source_academic_year_id,
            values.target_academic_year_id,
            {
              adjustDates: values.adjust_dates,
              preserveInactive: values.preserve_inactive,
              excludeInactiveAssignments: true,
            }
          );

          allResults.push(...results);
        } catch (error) {
          logger.error('academic/staff-planning', `Error cloning program ${programId}`, error);
          allResults.push({
            success: false,
            message: `Failed to clone program: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }

        // Update progress
        const progress = ((i + 1) / totalPrograms) * 100;
        setCloneProgress(progress);
      }

      setCloneResults(allResults);
      setCloneProgress(100);

      const successCount = allResults.filter((r) => r.success).length;
      const failCount = allResults.filter((r) => !r.success).length;

      if (successCount > 0) {
        toast.success(`Successfully cloned ${successCount} staff plan(s)`);
      }

      if (failCount > 0) {
        toast.error(`Failed to clone ${failCount} staff plan(s)`);
      }

      if (onSuccess && successCount > 0) {
        onSuccess();
      }
    } catch (error) {
      logger.error('academic/staff-planning', 'Error in bulk clone', error);
      toast.error('Failed to clone staff plans');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CopyPlus className="h-5 w-5" />
            Bulk Clone Staff Plans
          </DialogTitle>
          <DialogDescription>
            Clone all staff plans for a semester to a new academic year. This will
            copy all programs and their course assignments.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="semester_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Semester *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select semester" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {semesters.map((semester) => (
                        <SelectItem key={semester.id} value={semester.id}>
                          {semester.semester_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="source_academic_year_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source Academic Year *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="From year" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {academicYears.map((year) => (
                          <SelectItem key={year.id} value={year.id}>
                            {year.academic_year_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target_academic_year_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Academic Year *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="To year" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {academicYears
                          .filter((y) => y.id !== form.watch('source_academic_year_id'))
                          .map((year) => (
                            <SelectItem key={year.id} value={year.id}>
                              {year.academic_year_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="adjust_dates"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Auto-adjust Dates</FormLabel>
                    <FormDescription>
                      Set dates to match target academic year calendar
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isLoading}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="preserve_inactive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Include Inactive Staff</FormLabel>
                    <FormDescription>
                      Include inactive staff members in cloned plans
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isLoading}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {isLoading && (
              <div className="space-y-2">
                <Progress value={cloneProgress} />
                <p className="text-sm text-muted-foreground text-center">
                  Cloning staff plans...
                </p>
              </div>
            )}

            {cloneResults.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto space-y-2 border rounded-md p-4">
                <h4 className="text-sm font-medium mb-2">Clone Results:</h4>
                {cloneResults.map((result, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 text-sm"
                  >
                    {result.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    )}
                    <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                      {result.message}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  setCloneResults([]);
                  form.reset();
                }}
                disabled={isLoading}
              >
                {cloneResults.length > 0 ? 'Close' : 'Cancel'}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Clone All Plans
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
