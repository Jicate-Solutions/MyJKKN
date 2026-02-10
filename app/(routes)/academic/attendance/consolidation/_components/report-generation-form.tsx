'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, FileText, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useCreateConsolidationReport } from '@/hooks/academic/use-attendance-consolidation';
import type { GroupByType, ReportFormat } from '@/types/attendance';

// Form schema
const formSchema = z.object({
  reportName: z.string().min(3, 'Report name must be at least 3 characters'),
  reportDescription: z.string().optional(),
  dateFrom: z.date({
    required_error: 'Start date is required',
  }),
  dateTo: z.date({
    required_error: 'End date is required',
  }),
  groupBy: z.enum(['program', 'semester', 'section', 'student']),
  format: z.enum(['pdf', 'excel', 'csv']),
  includeAbsentDetails: z.boolean().default(false),
  includePeriodBreakdown: z.boolean().default(false),
  programs: z.array(z.string()).optional(),
  semesters: z.array(z.string()).optional(),
  sections: z.array(z.string()).optional(),
}).refine((data) => data.dateTo >= data.dateFrom, {
  message: 'End date must be after or equal to start date',
  path: ['dateTo'],
});

type FormValues = z.infer<typeof formSchema>;

interface ReportGenerationFormProps {
  institutionId: string;
  onSuccess?: () => void;
}

export function ReportGenerationForm({
  institutionId,
  onSuccess,
}: ReportGenerationFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fromDateOpen, setFromDateOpen] = useState(false);
  const [toDateOpen, setToDateOpen] = useState(false);
  const createReport = useCreateConsolidationReport();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reportName: `Attendance Report - ${format(new Date(), 'MMM yyyy')}`,
      reportDescription: '',
      groupBy: 'section',
      format: 'pdf',
      includeAbsentDetails: false,
      includePeriodBreakdown: false,
      programs: [],
      semesters: [],
      sections: [],
    },
  });

  // Handler for From Date selection
  const handleFromDateSelect = (date: Date | undefined) => {
    if (date) {
      form.setValue('dateFrom', date);
      setFromDateOpen(false);
    }
  };

  // Handler for To Date selection
  const handleToDateSelect = (date: Date | undefined) => {
    if (date) {
      form.setValue('dateTo', date);
      setToDateOpen(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    // Filter out empty strings from filter arrays to avoid UUID errors
    const cleanPrograms = values.programs?.filter(id => id && id.trim() !== '') || [];
    const cleanSemesters = values.semesters?.filter(id => id && id.trim() !== '') || [];
    const cleanSections = values.sections?.filter(id => id && id.trim() !== '') || [];

    const dto = {
      reportName: values.reportName,
      reportDescription: values.reportDescription,
      institutionId,
      format: values.format as ReportFormat,
      reportParams: {
        dateFrom: format(values.dateFrom, 'yyyy-MM-dd'),
        dateTo: format(values.dateTo, 'yyyy-MM-dd'),
        groupBy: values.groupBy as GroupByType,
        includeAbsentDetails: values.includeAbsentDetails,
        includePeriodBreakdown: values.includePeriodBreakdown,
        programs: cleanPrograms,
        semesters: cleanSemesters,
        sections: cleanSections,
      },
    };

    const result = await createReport.mutateAsync(dto);
    if (result && onSuccess) {
      form.reset();
      onSuccess();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Basic Information</h3>

          <FormField
            control={form.control}
            name="reportName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Report Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter report name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="reportDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter report description"
                    className="resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Date Range */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Date Range</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dateFrom"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>From Date</FormLabel>
                  <Popover open={fromDateOpen} onOpenChange={setFromDateOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => setFromDateOpen(true)}
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[200]" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={handleFromDateSelect}
                        disabled={(date) =>
                          date > new Date() || date < new Date('1900-01-01')
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateTo"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>To Date</FormLabel>
                  <Popover open={toDateOpen} onOpenChange={setToDateOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => setToDateOpen(true)}
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[200]" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={handleToDateSelect}
                        disabled={(date) =>
                          date > new Date() || date < new Date('1900-01-01')
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Report Configuration */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Report Configuration</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="groupBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group By</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select grouping" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="program">Program</SelectItem>
                      <SelectItem value="semester">Semester</SelectItem>
                      <SelectItem value="section">Section</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    How to organize the attendance data in the report
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="format"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Output Format</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Additional Options */}
          <div className="space-y-3 pt-2">
            <FormField
              control={form.control}
              name="includeAbsentDetails"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Include Absent Details</FormLabel>
                    <FormDescription>
                      Show specific dates when students were absent
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="includePeriodBreakdown"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Include Period Breakdown</FormLabel>
                    <FormDescription>
                      Show attendance statistics for each period
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Advanced Filters (Collapsed by default) */}
        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
          </Button>

          {showAdvanced && (
            <div className="space-y-4 p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">
                Leave filters empty to include all programs, semesters, and sections.
                Specific program, semester, and section filtering is available through the
                Group By option above -- select the appropriate grouping level to narrow
                your report scope.
              </p>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
          >
            Reset
          </Button>
          <Button
            type="submit"
            disabled={createReport.isPending}
          >
            {createReport.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate Report
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
