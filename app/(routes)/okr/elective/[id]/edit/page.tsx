'use client';

// ============================================================================
// Elective OKR Edit Page
// Edit form for learner's self-set elective OKRs
// ============================================================================

import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

// Hooks
import { useElectiveOKR, useUpdateElectiveOKR, useUpdateElectiveProgress } from '@/hooks/okr';
import { toast } from 'react-hot-toast';
import { useEffect } from 'react';

// ============================================================================
// FORM SCHEMA
// ============================================================================

const editElectiveOKRSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().optional(),
  why_matters: z.string().optional(),
  baseline_value: z.coerce.number().min(0).optional(),
  target_value: z.coerce.number().min(1).optional(),
  current_value: z.coerce.number().min(0),
  unit: z.string().optional(),
  deadline: z.string().min(1, 'Deadline is required')
});

type EditElectiveOKRFormData = z.infer<typeof editElectiveOKRSchema>;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EditElectiveOKRPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: okr, isLoading, error } = useElectiveOKR(id);
  const updateMutation = useUpdateElectiveOKR(id);
  const updateProgressMutation = useUpdateElectiveProgress();

  const form = useForm<EditElectiveOKRFormData>({
    resolver: zodResolver(editElectiveOKRSchema),
    defaultValues: {
      title: '',
      description: '',
      why_matters: '',
      baseline_value: 0,
      target_value: 100,
      current_value: 0,
      unit: 'percent',
      deadline: ''
    }
  });

  // Populate form when data loads
  useEffect(() => {
    if (okr) {
      form.reset({
        title: okr.title,
        description: okr.description || '',
        why_matters: okr.why_matters || '',
        baseline_value: okr.baseline_value || 0,
        target_value: okr.target_value || 100,
        current_value: okr.current_value,
        unit: okr.unit || 'percent',
        deadline: okr.deadline ? format(new Date(okr.deadline), 'yyyy-MM-dd') : ''
      });
    }
  }, [okr, form]);

  const onSubmit = async (data: EditElectiveOKRFormData) => {
    try {
      // If current_value changed, use the progress mutation
      if (okr && data.current_value !== okr.current_value) {
        await updateProgressMutation.mutateAsync({
          id,
          newValue: data.current_value
        });
      }

      // Update other fields
      await updateMutation.mutateAsync({
        title: data.title,
        description: data.description,
        why_matters: data.why_matters,
        baseline_value: data.baseline_value,
        target_value: data.target_value,
        unit: data.unit,
        deadline: data.deadline
      });

      toast.success('OKR updated successfully');
      router.push(`/okr/elective/${id}`);
    } catch (err) {
      toast.error('Failed to update OKR');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto py-6 max-w-2xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !okr) {
    return (
      <div className="container mx-auto py-6 max-w-2xl">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">OKR Not Found</h2>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'The elective OKR you are trying to edit does not exist or you do not have permission to edit it.'}
            </p>
            <Button onClick={() => router.push('/okr/objectives')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Objectives
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSubmitting = updateMutation.isPending || updateProgressMutation.isPending;

  return (
    <div className="container mx-auto py-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/okr/elective/${id}`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Edit Elective OKR</h1>
      </div>

      {/* Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>OKR Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="What do you want to achieve?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your objective in detail..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="why_matters"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Why It Matters</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Why is this objective important to you?"
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Explain the significance and impact of achieving this objective
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Progress Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="baseline_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Baseline</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>Starting point</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="current_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>Where you are now</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="target_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>Goal to reach</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit of Measure</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="percent">Percentage (%)</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="items">Items</SelectItem>
                        <SelectItem value="points">Points</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/okr/elective/${id}`)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
