'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { assessmentFormSchema, type AssessmentFormInput } from '@/lib/validations/maturity-assessment';
import type { MaturityFramework, MaturityDimension, MaturityStage } from '@/types/maturity-assessment';
import { MATURITY_DIMENSIONS, MATURITY_STAGE_NAMES } from '@/types/maturity-assessment';
import { useCreateMaturityAssessment, useUpdateMaturityAssessment } from '@/hooks/maturity-assessment';
import { MaturityRadarChart } from './maturity-radar-chart';

interface DimensionScoreInputProps {
  dimension: MaturityDimension;
  value: MaturityStage;
  onChange: (value: MaturityStage) => void;
}

function DimensionScoreInput({ dimension, value, onChange }: DimensionScoreInputProps) {
  const criteria = [
    dimension.stage_1_criteria,
    dimension.stage_2_criteria,
    dimension.stage_3_criteria,
    dimension.stage_4_criteria
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{dimension.name}</span>
          <span className="text-sm font-normal text-muted-foreground">
            Stage {value}: {MATURITY_STAGE_NAMES[value]}
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{dimension.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Slider
          value={[value]}
          onValueChange={([v]) => onChange(v as MaturityStage)}
          min={1}
          max={4}
          step={1}
          className="w-full"
        />
        <div className="grid grid-cols-2 gap-2 text-xs">
          {criteria.map((c, i) => (
            <div
              key={i}
              className={`p-2 rounded border ${
                value === i + 1
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent bg-muted/50'
              }`}
            >
              <span className="font-medium">Stage {i + 1}:</span> {c}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface AssessmentFormProps {
  framework: MaturityFramework;
  institutionId: string;
  departments: { id: string; name: string }[];
  existingAssessment?: {
    id: string;
    department_id: string | null;
    assessment_date: string;
    dimension_scores: Record<string, MaturityStage>;
    evidence: string | null;
    improvement_plan: string | null;
    target_stage: MaturityStage | null;
    target_date: string | null;
  };
}

export function AssessmentForm({
  framework,
  institutionId,
  departments,
  existingAssessment
}: AssessmentFormProps) {
  const router = useRouter();
  const createMutation = useCreateMaturityAssessment();
  const updateMutation = useUpdateMaturityAssessment();

  const isEditing = !!existingAssessment;
  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Initialize default scores
  const defaultScores: Record<string, MaturityStage> = {};
  MATURITY_DIMENSIONS.forEach((dim) => {
    defaultScores[dim] = existingAssessment?.dimension_scores?.[dim] || 1;
  });

  const form = useForm<AssessmentFormInput>({
    resolver: zodResolver(assessmentFormSchema),
    defaultValues: {
      framework_id: framework.id,
      department_id: existingAssessment?.department_id || null,
      assessment_date:
        existingAssessment?.assessment_date ||
        new Date().toISOString().split('T')[0],
      dimension_scores: defaultScores as any,
      evidence: existingAssessment?.evidence || '',
      improvement_plan: existingAssessment?.improvement_plan || '',
      target_stage: existingAssessment?.target_stage || undefined,
      target_date: existingAssessment?.target_date || null
    }
  });

  const watchedScores = form.watch('dimension_scores');

  async function onSubmit(data: AssessmentFormInput) {
    try {
      if (isEditing && existingAssessment) {
        await updateMutation.mutateAsync({
          id: existingAssessment.id,
          dto: {
            department_id: data.department_id,
            assessment_date: data.assessment_date,
            dimension_scores: data.dimension_scores as Record<string, MaturityStage>,
            evidence: data.evidence,
            improvement_plan: data.improvement_plan,
            target_stage: data.target_stage as MaturityStage | undefined,
            target_date: data.target_date
          }
        });
        router.push(`/maturity-assessment/${existingAssessment.id}`);
      } else {
        const result = await createMutation.mutateAsync({
          institution_id: institutionId,
          framework_id: data.framework_id,
          department_id: data.department_id,
          assessment_date: data.assessment_date,
          dimension_scores: data.dimension_scores as Record<string, MaturityStage>,
          evidence: data.evidence,
          improvement_plan: data.improvement_plan,
          target_stage: data.target_stage as MaturityStage | undefined,
          target_date: data.target_date || undefined
        });
        router.push(`/maturity-assessment/${result.id}`);
      }
    } catch (error) {
      console.error('Failed to save assessment:', error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Form fields */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Assessment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="assessment_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assessment Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="department_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === '__all__' ? '' : val)}
                          value={field.value || '__all__'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Institution-wide" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__all__">Institution-wide</SelectItem>
                            {departments.map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Leave empty for institution-wide assessment
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="target_stage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Stage</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(parseInt(v))}
                          value={field.value?.toString() || ''}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select target" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {[1, 2, 3, 4].map((stage) => (
                              <SelectItem key={stage} value={stage.toString()}>
                                Stage {stage}: {MATURITY_STAGE_NAMES[stage as MaturityStage]}
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
                    name="target_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Dimension Scores */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Dimension Scores</h3>
              <p className="text-sm text-muted-foreground">
                Rate each dimension based on where your department/institution currently stands.
                Use the criteria to guide your assessment.
              </p>

              {framework.dimensions.map((dimension) => (
                <FormField
                  key={dimension.name}
                  control={form.control}
                  name={`dimension_scores.${dimension.name}` as any}
                  render={({ field }) => (
                    <DimensionScoreInput
                      dimension={dimension}
                      value={field.value || 1}
                      onChange={field.onChange}
                    />
                  )}
                />
              ))}
            </div>

            {/* Evidence & Plans */}
            <Card>
              <CardHeader>
                <CardTitle>Evidence & Improvement Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="evidence"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supporting Evidence</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Describe the evidence supporting your scores..."
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>
                        Document observations, metrics, or examples that justify your ratings
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="improvement_plan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Improvement Plan</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Outline key improvement actions..."
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>
                        What actions will be taken to improve maturity levels?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right: Preview */}
          <div className="space-y-6">
            <div className="sticky top-4">
              <MaturityRadarChart
                dimensionScores={watchedScores as Record<string, MaturityStage>}
                targetStage={form.watch('target_stage') as MaturityStage}
                title="Assessment Preview"
                showLegend={false}
              />

              <div className="mt-6 space-y-3">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing ? 'Update Assessment' : 'Create Assessment'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
