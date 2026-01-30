"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, Copy } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

import { StaffPlanningService } from "@/lib/services/academic/staff-planning-service";
import type { StaffPlan } from "@/types/academic/staff-planning";
import type { AcademicYear } from "@/types/academic";

// Form validation schema
const cloneStaffPlanSchema = z.object({
  target_academic_year_id: z.string().min(1, "Target academic year is required"),
  adjust_dates: z.boolean().default(true),
  preserve_inactive: z.boolean().default(false),
});

type CloneStaffPlanFormValues = z.infer<typeof cloneStaffPlanSchema>;

interface CloneStaffPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcePlan: StaffPlan;
  onSuccess?: () => void;
}

export function CloneStaffPlanDialog({
  open,
  onOpenChange,
  sourcePlan,
  onSuccess,
}: CloneStaffPlanDialogProps) {
  const router = useRouter();
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [isLoadingYears, setIsLoadingYears] = React.useState(false);

  const form = useForm<CloneStaffPlanFormValues>({
    resolver: zodResolver(cloneStaffPlanSchema),
    defaultValues: {
      target_academic_year_id: "",
      adjust_dates: true,
      preserve_inactive: false,
    },
  });

  // Fetch academic years when dialog opens
  React.useEffect(() => {
    if (open) {
      loadAcademicYears();
    }
  }, [open]);

  const loadAcademicYears = async () => {
    setIsLoadingYears(true);
    try {
      const years = await StaffPlanningService.getAcademicYears(
        sourcePlan.institution_id
      );
      // Filter out the source academic year
      const filteredYears = years.filter(
        (year) => year.id !== sourcePlan.academic_year_id
      );
      setAcademicYears(filteredYears);
    } catch (error) {
      console.error("[staff-planning] Failed to load academic years:", error);
      toast.error("Failed to load academic years");
    } finally {
      setIsLoadingYears(false);
    }
  };

  const onSubmit = async (values: CloneStaffPlanFormValues) => {
    try {
      const result = await StaffPlanningService.cloneStaffPlan(
        sourcePlan.id,
        values.target_academic_year_id,
        {
          adjust_dates: values.adjust_dates,
          preserve_inactive: values.preserve_inactive,
        }
      );

      // Show appropriate toast based on result
      if (result.skipped_count > 0) {
        toast.info(
          `Plan cloned successfully. ${result.skipped_count} inactive assignment(s) skipped.`,
          {
            description: `Created ${result.cloned_count} assignment(s)`,
          }
        );
      } else {
        toast.success("Staff plan cloned successfully", {
          description: `Created ${result.cloned_count} assignment(s)`,
        });
      }

      // Close dialog and reset form
      onOpenChange(false);
      form.reset();

      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }

      // Navigate to the new plan
      router.push(
        `/academic/staff-planning/${result.new_plan_id}?cloned=true`
      );
    } catch (error) {
      console.error("[staff-planning] Failed to clone staff plan:", error);
      toast.error("Failed to clone staff plan", {
        description:
          error instanceof Error ? error.message : "An unexpected error occurred",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clone Staff Plan
          </DialogTitle>
          <DialogDescription>
            Create a copy of this staff plan for a different academic year.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source plan details */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
            <p className="text-sm font-medium">Source Plan</p>
            <p className="text-sm text-muted-foreground">
              {sourcePlan.plan_name}
            </p>
            <p className="text-xs text-muted-foreground">
              Academic Year: {sourcePlan.academic_year?.year_name}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Target Academic Year */}
              <FormField
                control={form.control}
                name="target_academic_year_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Academic Year</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isLoadingYears || form.formState.isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select target academic year" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingYears ? (
                          <div className="flex items-center justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : academicYears.length === 0 ? (
                          <div className="py-2 text-center text-sm text-muted-foreground">
                            No other academic years available
                          </div>
                        ) : (
                          academicYears.map((year) => (
                            <SelectItem key={year.id} value={year.id}>
                              {year.year_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The academic year for the cloned plan
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Adjust Dates */}
              <FormField
                control={form.control}
                name="adjust_dates"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Adjust Dates</FormLabel>
                      <FormDescription>
                        Automatically adjust start and end dates to the new
                        academic year
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={form.formState.isSubmitting}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Preserve Inactive */}
              <FormField
                control={form.control}
                name="preserve_inactive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Preserve Inactive Assignments</FormLabel>
                      <FormDescription>
                        Include inactive staff assignments in the cloned plan
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={form.formState.isSubmitting}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={form.formState.isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting || isLoadingYears}
                >
                  {form.formState.isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Clone Plan
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
