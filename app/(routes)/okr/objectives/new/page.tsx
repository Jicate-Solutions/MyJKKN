'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../../_components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ArrowLeft,
  ClipboardCheck,
  Target,
  Calendar,
  Hash,
  MessageSquare,
  Lightbulb,
  Loader2,
  Check
} from 'lucide-react';
import { useCreateElectiveOKR } from '@/hooks/okr/use-learner-okrs';
import { CreateLearnerElectiveOKRDTO } from '@/types/okr';
import { format, addMonths } from 'date-fns';

// ============================================================================
// ZOD VALIDATION SCHEMA
// ============================================================================

const electiveOKRSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().max(1000, 'Description cannot exceed 1000 characters').optional(),
  whyMatters: z.string().max(500, 'Why it matters cannot exceed 500 characters').optional(),
  baselineValue: z.number().min(0, 'Baseline value cannot be negative'),
  targetValue: z.number().min(1, 'Target value must be at least 1'),
  unit: z.string().max(50, 'Unit cannot exceed 50 characters').optional(),
  deadline: z.string().min(1, 'Deadline is required')
}).refine(
  (data) => data.targetValue > data.baselineValue,
  {
    message: 'Target value must be greater than baseline value',
    path: ['targetValue']
  }
);

type ElectiveOKRFormData = z.infer<typeof electiveOKRSchema>;

export default function CreateElectiveOKRPage() {
  const router = useRouter();
  const createElective = useCreateElectiveOKR();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [whyMatters, setWhyMatters] = useState('');
  const [baselineValue, setBaselineValue] = useState<number>(0);
  const [targetValue, setTargetValue] = useState<number>(100);
  const [unit, setUnit] = useState('');
  const [deadline, setDeadline] = useState(format(addMonths(new Date(), 3), 'yyyy-MM-dd'));

  // Compute validity for UI disable state
  const isValid = title.trim() && targetValue > 0 && deadline;

  // Submit with Zod validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate with Zod
    const formData = {
      title,
      description: description || undefined,
      whyMatters: whyMatters || undefined,
      baselineValue,
      targetValue,
      unit: unit || undefined,
      deadline
    };

    const result = electiveOKRSchema.safeParse(formData);

    if (!result.success) {
      const errors = result.error.errors;
      const firstError = errors[0];
      toast.error(firstError.message);
      return;
    }

    try {
      const data: CreateLearnerElectiveOKRDTO = {
        title: title.trim(),
        description: description.trim() || undefined,
        why_matters: whyMatters.trim() || undefined,
        baseline_value: baselineValue,
        target_value: targetValue,
        unit: unit.trim() || '%',
        deadline
      };

      await createElective.mutateAsync(data);
      toast.success('Elective OKR created successfully!');
      router.push('/okr/objectives');
    } catch (error) {
      console.error('Error creating elective OKR:', error);
      toast.error('Failed to create elective OKR');
    }
  };

  return (
    <ContentLayout title="Create Elective OKR">
      <OKRErrorBoundary>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back Link */}
        <Button variant="ghost" size="sm" asChild>
          <Link href="/okr/objectives">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Objectives
          </Link>
        </Button>

        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#0b6d41' }}>
                <ClipboardCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle>Create Your Personal OKR</CardTitle>
                <CardDescription>
                  Set a meaningful goal that will help you grow personally or professionally
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Tips */}
        <Card className="bg-amber-500/10 border-amber-500/30 dark:bg-amber-500/5 dark:border-amber-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-700 dark:text-amber-400 mb-2">Tips for Great OKRs</h4>
                <ul className="text-sm text-amber-800 dark:text-amber-300/90 space-y-1">
                  <li>• Be specific and measurable (use numbers)</li>
                  <li>• Make it challenging but achievable</li>
                  <li>• Focus on outcomes, not activities</li>
                  <li>• Write down why this matters to you</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form */}
        <form onSubmit={handleSubmit} data-testid="okr-create-form">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Goal Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  data-testid="okr-title-input"
                  placeholder="e.g., Learn Python Programming"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Write a clear, concise title that describes what you want to achieve
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Description
                </Label>
                <Textarea
                  id="description"
                  data-testid="okr-description-input"
                  placeholder="Describe your goal in more detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Why It Matters */}
              <div className="space-y-2">
                <Label htmlFor="whyMatters" className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Why This Matters
                </Label>
                <Textarea
                  id="whyMatters"
                  data-testid="okr-why-matters-input"
                  placeholder="Why is achieving this goal important to you?"
                  value={whyMatters}
                  onChange={(e) => setWhyMatters(e.target.value)}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Writing this down helps you stay motivated
                </p>
              </div>

              {/* Measurement */}
              <div className="p-4 bg-muted/50 border rounded-lg space-y-4">
                <h4 className="font-medium flex items-center gap-2 text-foreground">
                  <Hash className="h-4 w-4" />
                  How will you measure success?
                </h4>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="baselineValue" className="text-foreground">Starting Value</Label>
                    <Input
                      id="baselineValue"
                      data-testid="okr-baseline-input"
                      type="number"
                      value={baselineValue}
                      onChange={(e) => setBaselineValue(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetValue" className="text-foreground">
                      Target Value <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="targetValue"
                      data-testid="okr-target-input"
                      type="number"
                      value={targetValue}
                      onChange={(e) => setTargetValue(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit" className="text-foreground">Unit</Label>
                    <Input
                      id="unit"
                      data-testid="okr-unit-input"
                      placeholder="e.g., %, hours, lessons"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Example: Start at 0 lessons, target 50 lessons → &quot;Complete 50 Python lessons&quot;
                </p>
              </div>

              {/* Deadline */}
              <div className="space-y-2">
                <Label htmlFor="deadline" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Deadline <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="deadline"
                  data-testid="okr-deadline-input"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
                <p className="text-xs text-muted-foreground">When do you want to achieve this by?</p>
              </div>

              {/* Preview */}
              {title && (
                <div className="p-4 border rounded-lg bg-card">
                  <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                  <p className="font-medium text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    From {baselineValue} to {targetValue} {unit || '%'} by{' '}
                    {deadline ? format(new Date(deadline), 'MMM d, yyyy') : 'TBD'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 mt-6">
            <Button type="button" variant="outline" asChild data-testid="okr-cancel-button">
              <Link href="/okr/objectives">Cancel</Link>
            </Button>
            <Button
              type="submit"
              data-testid="okr-submit-button"
              disabled={!isValid || createElective.isPending}
              style={{ backgroundColor: isValid ? '#0b6d41' : undefined }}
            >
              {createElective.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Create OKR
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
