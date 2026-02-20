'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Hammer, BookOpen, Video, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Prospect,
  SourceType,
  SolutionType,
  PipelineStage,
} from '@/lib/services/solutions/types';
import type { CreateProspectInput } from '@/lib/services/solutions/types';
import { PIPELINE_STAGE_LABELS } from '@/lib/services/solutions/prospects-service';

// ============================================
// SCHEMA
// ============================================

const prospectFormSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  contact_person: z.string().min(1, 'Contact person is required'),
  contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
  contact_phone: z.string().min(1, 'Phone number is required'),
  source_type: z.enum(['placement', 'alumni', 'clinical', 'referral', 'direct', 'yi', 'intent']),
  source_detail: z.string().optional(),
  pipeline_stage: z.enum(['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'dormant']).optional(),
  expected_deal_size: z.coerce.number().min(0).optional(),
  expected_close_date: z.string().optional(),
  solution_type_interest: z.enum(['software', 'training', 'content']).optional(),
  assigned_to: z.string().optional(),
  next_action: z.string().optional(),
  next_action_date: z.string().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(), // comma-separated, parsed on submit
});

type ProspectFormValues = z.infer<typeof prospectFormSchema>;

// ============================================
// CONSTANTS
// ============================================

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'placement', label: 'Placement Cell' },
  { value: 'alumni', label: 'Alumni Network' },
  { value: 'clinical', label: 'Clinical Partners' },
  { value: 'referral', label: 'Referral' },
  { value: 'direct', label: 'Direct Inquiry' },
  { value: 'yi', label: 'Young Indians (YI)' },
  { value: 'intent', label: 'Intent Agency' },
];

const SOLUTION_OPTIONS: { value: SolutionType; label: string; description: string; icon: React.ElementType; color: string }[] = [
  { value: 'software', label: 'Software', description: 'Custom software, apps, integrations', icon: Hammer, color: 'text-blue-600 border-blue-200 bg-blue-50' },
  { value: 'training', label: 'Training', description: 'Workshops, bootcamps, certifications', icon: BookOpen, color: 'text-green-600 border-green-200 bg-green-50' },
  { value: 'content', label: 'Content', description: 'Videos, graphics, documents', icon: Video, color: 'text-purple-600 border-purple-200 bg-purple-50' },
];

// ============================================
// COMPONENT
// ============================================

interface ProspectFormProps {
  defaultValues?: Partial<Prospect>;
  onSubmit: (data: CreateProspectInput) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function ProspectForm({
  defaultValues,
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Create Prospect',
}: ProspectFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProspectFormValues>({
    resolver: zodResolver(prospectFormSchema),
    defaultValues: {
      company_name: defaultValues?.company_name || '',
      contact_person: defaultValues?.contact_person || '',
      contact_email: defaultValues?.contact_email || '',
      contact_phone: defaultValues?.contact_phone || '',
      source_type: defaultValues?.source_type || 'direct',
      source_detail: defaultValues?.source_detail || '',
      pipeline_stage: defaultValues?.pipeline_stage || 'lead',
      expected_deal_size: defaultValues?.expected_deal_size || undefined,
      expected_close_date: defaultValues?.expected_close_date || '',
      solution_type_interest: defaultValues?.solution_type_interest || undefined,
      assigned_to: defaultValues?.assigned_to || '',
      next_action: defaultValues?.next_action || '',
      next_action_date: defaultValues?.next_action_date || '',
      notes: defaultValues?.notes || '',
      tags: defaultValues?.tags?.join(', ') || '',
    },
  });

  const selectedSolution = watch('solution_type_interest');

  const handleFormSubmit = (values: ProspectFormValues) => {
    const input: CreateProspectInput = {
      company_name: values.company_name,
      contact_person: values.contact_person,
      contact_email: values.contact_email || undefined,
      contact_phone: values.contact_phone,
      source_type: values.source_type,
      source_detail: values.source_detail || undefined,
      pipeline_stage: values.pipeline_stage as PipelineStage | undefined,
      expected_deal_size: values.expected_deal_size || undefined,
      expected_close_date: values.expected_close_date || undefined,
      solution_type_interest: values.solution_type_interest as SolutionType | undefined,
      assigned_to: values.assigned_to || undefined,
      next_action: values.next_action || undefined,
      next_action_date: values.next_action_date || undefined,
      notes: values.notes || undefined,
      tags: values.tags
        ? values.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined,
    };
    onSubmit(input);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Section 1: Prospect Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Prospect Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">
                Company Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="company_name"
                placeholder="e.g. Acme Corp"
                {...register('company_name')}
              />
              {errors.company_name && (
                <p className="text-xs text-red-500">{errors.company_name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_person">
                Contact Person <span className="text-red-500">*</span>
              </Label>
              <Input
                id="contact_person"
                placeholder="e.g. Rajesh Kumar"
                {...register('contact_person')}
              />
              {errors.contact_person && (
                <p className="text-xs text-red-500">{errors.contact_person.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_email">Email</Label>
              <Input
                id="contact_email"
                type="email"
                placeholder="e.g. rajesh@acme.com"
                {...register('contact_email')}
              />
              {errors.contact_email && (
                <p className="text-xs text-red-500">{errors.contact_email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">
                Phone <span className="text-red-500">*</span>
              </Label>
              <Input
                id="contact_phone"
                placeholder="e.g. +91 98765 43210"
                {...register('contact_phone')}
              />
              {errors.contact_phone && (
                <p className="text-xs text-red-500">{errors.contact_phone.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select
                defaultValue={defaultValues?.source_type || 'direct'}
                onValueChange={(val) => setValue('source_type', val as SourceType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source_detail">Source Detail</Label>
              <Input
                id="source_detail"
                placeholder="e.g. Referred by Dr. Sharma"
                {...register('source_detail')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pipeline Stage</Label>
              <Select
                defaultValue={defaultValues?.pipeline_stage || 'lead'}
                onValueChange={(val) => setValue('pipeline_stage', val as PipelineStage)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PIPELINE_STAGE_LABELS) as [PipelineStage, string][]).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected_deal_size">Expected Deal Size (INR)</Label>
              <Input
                id="expected_deal_size"
                type="number"
                min="0"
                placeholder="e.g. 500000"
                {...register('expected_deal_size')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expected_close_date">Expected Close Date</Label>
              <Input
                id="expected_close_date"
                type="date"
                {...register('expected_close_date')}
              />
            </div>
          </div>

          {/* Solution Type Interest - Radio Cards */}
          <div className="space-y-2">
            <Label>Solution Type Interest</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SOLUTION_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedSolution === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setValue(
                        'solution_type_interest',
                        isSelected ? undefined : (opt.value as SolutionType)
                      )
                    }
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3 text-left transition-all',
                      isSelected
                        ? opt.color + ' ring-2 ring-offset-1'
                        : 'border-muted hover:border-muted-foreground/50'
                    )}
                  >
                    <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', isSelected ? '' : 'text-muted-foreground')} />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Assignment & Follow-up */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assignment & Follow-up</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="next_action">Next Action</Label>
              <Input
                id="next_action"
                placeholder="e.g. Send proposal document"
                {...register('next_action')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_action_date">Next Action Date</Label>
              <Input
                id="next_action_date"
                type="date"
                {...register('next_action_date')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              placeholder="e.g. healthcare, urgent, q1-target"
              {...register('tags')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="notes"
            placeholder="Any additional notes about this prospect..."
            rows={4}
            {...register('notes')}
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
