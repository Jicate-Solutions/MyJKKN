'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { ProgramService } from '@/lib/services/organization/program-service';
import type { VACCourse, VACCourseCategory, VACCourseTrack } from '@/types/vac';

// ── Fink's Taxonomy must sum to 100 ──────────────────────────────────────

const finksSchema = z
  .object({
    foundational_knowledge: z.number().min(0).max(100),
    application: z.number().min(0).max(100),
    integration: z.number().min(0).max(100),
    human_dimension: z.number().min(0).max(100),
    caring: z.number().min(0).max(100),
    learning_how_to_learn: z.number().min(0).max(100),
  })
  .refine(
    (data) => {
      const sum =
        data.foundational_knowledge +
        data.application +
        data.integration +
        data.human_dimension +
        data.caring +
        data.learning_how_to_learn;
      return sum === 100;
    },
    { message: "Fink's taxonomy percentages must sum to 100%", path: ['foundational_knowledge'] }
  );

const courseFormSchema = z.object({
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(20, 'Code must be at most 20 characters')
    .transform((v) => v.toUpperCase()),
  name: z.string().min(2, 'Course name is required'),
  description: z.string().optional(),
  track: z.string().default('general'),
  course_category: z.enum(['add_on', 'value_add']).default('value_add'),
  duration_hours: z.coerce.number().min(1, 'Duration is required'),
  weeks: z.coerce.number().min(1, 'Weeks is required'),
  fee: z.coerce.number().min(0, 'Fee must be non-negative'),
  nsqf_level: z.coerce.number().min(1).max(10).optional().nullable(),
  nheqf_level: z.coerce.number().min(4).max(10).optional().nullable(),
  ncrf_credits: z.coerce.number().min(0).optional().nullable(),
  ncrf_credit_hours: z.coerce.number().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
  faculty_eligible: z.boolean().default(false),
  overall_finks_profile: finksSchema.optional(),
  programme_ids: z.array(z.string()).default([]),
});

type CourseFormValues = z.infer<typeof courseFormSchema>;

const TRACKS: { value: VACCourseTrack; label: string }[] = [
  { value: 'AI-1', label: 'AI-1 (Foundations)' },
  { value: 'AI-2', label: 'AI-2 (Application)' },
  { value: 'AI-3', label: 'AI-3 (Advanced)' },
  { value: 'AI-4', label: 'AI-4 (Mastery)' },
  { value: 'H-1', label: 'H-1 (Human Excellence I)' },
  { value: 'H-2', label: 'H-2 (Human Excellence II)' },
  { value: 'general', label: 'General' },
];

const FINKS_LABELS: Record<string, string> = {
  foundational_knowledge: 'Foundational Knowledge',
  application: 'Application',
  integration: 'Integration',
  human_dimension: 'Human Dimension',
  caring: 'Caring',
  learning_how_to_learn: 'Learning How to Learn',
};

interface VACCourseFormProps {
  course?: VACCourse;
  onSubmit: (data: CourseFormValues) => void;
  isSubmitting: boolean;
}

export function VACCourseForm({ course, onSubmit, isSubmitting }: VACCourseFormProps) {
  const [programmes, setProgrammes] = useState<{ id: string; program_name: string }[]>([]);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);

  const defaultFinks = course?.overall_finks_profile ?? {
    foundational_knowledge: 20,
    application: 20,
    integration: 15,
    human_dimension: 15,
    caring: 15,
    learning_how_to_learn: 15,
  };

  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      code: course?.code ?? '',
      name: course?.name ?? '',
      description: course?.description ?? '',
      track: course?.track ?? 'general',
      course_category: (course?.course_category as VACCourseCategory) ?? 'value_add',
      duration_hours: course?.duration_hours ?? 30,
      weeks: course?.weeks ?? 15,
      fee: course?.fee ?? 0,
      nsqf_level: course?.nsqf_level ?? null,
      nheqf_level: course?.nheqf_level ?? null,
      ncrf_credits: course?.ncrf_credits ?? null,
      ncrf_credit_hours: course?.ncrf_credit_hours ?? null,
      is_active: course?.is_active ?? true,
      faculty_eligible: course?.faculty_eligible ?? false,
      overall_finks_profile: defaultFinks,
      programme_ids: [],
    },
  });

  const finksValues = form.watch('overall_finks_profile');
  const finksSum = finksValues
    ? Object.values(finksValues).reduce((a, b) => a + b, 0)
    : 0;

  // Load programmes
  useEffect(() => {
    async function load() {
      setLoadingProgrammes(true);
      try {
        const res = await ProgramService.getPrograms({ is_active: true, limit: 200 });
        setProgrammes(res.data ?? []);
      } catch {
        setProgrammes([]);
      } finally {
        setLoadingProgrammes(false);
      }
    }
    load();
  }, []);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* ── Basic Info ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course Code *</FormLabel>
                  <FormControl>
                    <Input placeholder="VAC-AI1-01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Introduction to AI" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Course description..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Academic Details ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Academic Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="track"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Track</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select track" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TRACKS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
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
              name="course_category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex gap-4 pt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="value_add" id="cat-value" />
                        <Label htmlFor="cat-value">Value-Add</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="add_on" id="cat-addon" />
                        <Label htmlFor="cat-addon">Add-On</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="duration_hours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (hours) *</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="weeks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Weeks *</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fee (INR)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step={0.01} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Credential Framework ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credential Framework</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="nsqf_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NSQF Level (1-10)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nheqf_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NHEQF Level (4-10)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={4}
                      max={10}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ncrf_credits"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NCRF Credits</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ncrf_credit_hours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NCRF Credit Hours</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Toggles ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <FormDescription>Course is visible and available for enrollment</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="faculty_eligible"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Faculty Eligible</FormLabel>
                    <FormDescription>Faculty members can enroll in this course</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Fink's Taxonomy ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Fink&apos;s Taxonomy Profile
              <span
                className={`ml-2 text-sm font-normal ${
                  finksSum === 100 ? 'text-green-600' : 'text-red-500'
                }`}
              >
                (Total: {finksSum}%)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(FINKS_LABELS).map(([key, label]) => (
              <FormField
                key={key}
                control={form.control}
                name={`overall_finks_profile.${key}` as any}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </CardContent>
        </Card>

        {/* ── Programme Mapping ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Programme Mapping</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingProgrammes ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading programmes...
              </div>
            ) : programmes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No programmes available.</p>
            ) : (
              <FormField
                control={form.control}
                name="programme_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormDescription>
                      Select which programmes this course is mapped to.
                    </FormDescription>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                      {programmes.map((prog) => {
                        const checked = field.value?.includes(prog.id) ?? false;
                        return (
                          <label
                            key={prog.id}
                            className="flex items-center space-x-2 rounded-md border p-2 cursor-pointer hover:bg-accent transition-colors"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(isChecked) => {
                                const current = field.value ?? [];
                                field.onChange(
                                  isChecked
                                    ? [...current, prog.id]
                                    : current.filter((id: string) => id !== prog.id)
                                );
                              }}
                            />
                            <span className="text-sm">{prog.program_name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* ── Actions ────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {course ? 'Update Course' : 'Create Course'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
