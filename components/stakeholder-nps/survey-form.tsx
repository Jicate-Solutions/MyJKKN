'use client';

import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import {
  createSurveySchema,
  type CreateSurveyFormValues,
} from '@/lib/validations/stakeholder-nps';
import type {
  StakeholderType,
  QuestionType,
  NPSSurvey,
} from '@/types/stakeholder-nps';

// Stakeholder options for the select
const stakeholderOptions: { value: StakeholderType; label: string }[] = [
  { value: 'parent', label: 'Parents' },
  { value: 'learner', label: 'Learners' },
  { value: 'student', label: 'Students' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'industry', label: 'Industry Partners' },
  { value: 'employer', label: 'Employers' },
  { value: 'staff', label: 'Staff' },
  { value: 'community', label: 'Community' },
];

// Question type options
const questionTypeOptions: { value: QuestionType; label: string }[] = [
  { value: 'nps', label: 'NPS (0-10 Scale)' },
  { value: 'rating', label: 'Rating (1-5 Stars)' },
  { value: 'text', label: 'Text Response' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'yes_no', label: 'Yes/No' },
];

interface SurveyFormProps {
  institutionId: string;
  initialData?: NPSSurvey;
  onSubmit: (data: CreateSurveyFormValues) => Promise<void>;
  loading?: boolean;
  mode?: 'create' | 'edit';
}

export function SurveyForm({
  institutionId,
  initialData,
  onSubmit,
  loading = false,
  mode = 'create',
}: SurveyFormProps) {
  const router = useRouter();

  // Calculate default dates
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const form = useForm<CreateSurveyFormValues>({
    resolver: zodResolver(createSurveySchema),
    defaultValues: initialData
      ? {
          institution_id: initialData.institution_id,
          title: initialData.title,
          description: initialData.description || '',
          stakeholder_type: initialData.stakeholder_types?.[0] || 'learner',
          start_date: initialData.start_date.split('T')[0],
          end_date: initialData.end_date.split('T')[0],
          questions: [
            {
              id: uuidv4(),
              type: 'nps' as QuestionType,
              question: initialData.question || 'How likely are you to recommend JKKN to others?',
              required: true,
            },
          ],
        }
      : {
          institution_id: institutionId,
          title: '',
          description: '',
          stakeholder_type: 'learner',
          start_date: today,
          end_date: thirtyDaysFromNow,
          questions: [
            {
              id: uuidv4(),
              type: 'nps' as QuestionType,
              question: 'How likely are you to recommend JKKN to others?',
              required: true,
            },
          ],
        },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'questions',
  });

  const handleSubmit = async (data: CreateSurveyFormValues) => {
    try {
      await onSubmit({
        ...data,
        institution_id: institutionId,
      });
    } catch (error) {
      // Error handled by parent
    }
  };

  const addQuestion = () => {
    append({
      id: uuidv4(),
      type: 'text',
      question: '',
      required: false,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Basic Details */}
        <Card>
          <CardHeader>
            <CardTitle>Survey Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Q1 2026 Parent Satisfaction Survey"
                      {...field}
                    />
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
                      placeholder="Brief description of the survey purpose..."
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="stakeholder_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stakeholder Type *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select stakeholder type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stakeholderOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    The type of stakeholder this survey targets
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Questions</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addQuestion}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Question
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="p-4 border rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Question {index + 1}</span>
                    {index === 0 && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        Primary NPS
                      </span>
                    )}
                  </div>
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name={`questions.${index}.type`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Question Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={index === 0} // First question must be NPS
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {questionTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {index === 0 && (
                        <FormDescription>
                          The first question must be the NPS question
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`questions.${index}.question`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Question Text</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your question..."
                          {...field}
                          disabled={index === 0}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`questions.${index}.required`}
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Required</FormLabel>
                        <FormDescription>
                          Respondents must answer this question
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={index === 0}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            ))}

            {fields.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                No questions added yet. Click "Add Question" to get started.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === 'create' ? 'Creating...' : 'Saving...'}
              </>
            ) : mode === 'create' ? (
              'Create Survey'
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
