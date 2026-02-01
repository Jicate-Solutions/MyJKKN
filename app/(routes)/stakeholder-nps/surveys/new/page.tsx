'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { v4 as uuidv4 } from 'uuid';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useCreateNPSSurvey } from '@/hooks/stakeholder-nps';
import { createSurveySchema, type CreateSurveyFormValues } from '@/lib/validations/stakeholder-nps';
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
import { ArrowLeft, Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import type { StakeholderType, QuestionType, NPSQuestion } from '@/types/stakeholder-nps';

const stakeholderOptions: { value: StakeholderType; label: string }[] = [
  { value: 'parent', label: 'Parents' },
  { value: 'learner', label: 'Learners' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'industry', label: 'Industry Partners' },
  { value: 'staff', label: 'Staff' }
];

const questionTypeOptions: { value: QuestionType; label: string }[] = [
  { value: 'nps', label: 'NPS (0-10 Scale)' },
  { value: 'rating', label: 'Rating (1-5 Stars)' },
  { value: 'text', label: 'Text Response' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'yes_no', label: 'Yes/No' }
];

export default function NewSurveyPage() {
  const router = useRouter();
  const { selectedInstitutionId: institutionId } = useUserInstitutionAccess();
  const { createSurvey, loading } = useCreateNPSSurvey();

  const form = useForm<CreateSurveyFormValues>({
    resolver: zodResolver(createSurveySchema),
    defaultValues: {
      institution_id: institutionId || '',
      title: '',
      description: '',
      stakeholder_type: 'learner',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      questions: [
        {
          id: uuidv4(),
          type: 'nps',
          question: 'How likely are you to recommend JKKN to others?',
          required: true
        }
      ]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'questions'
  });

  const onSubmit = async (data: CreateSurveyFormValues) => {
    try {
      // Ensure all required fields are set
      await createSurvey({
        institution_id: institutionId || data.institution_id,
        title: data.title,
        description: data.description ?? undefined,
        stakeholder_type: data.stakeholder_type,
        start_date: data.start_date,
        end_date: data.end_date,
        program_id: data.program_id ?? undefined,
        department_id: data.department_id ?? undefined,
        questions: (data.questions ?? []) as any
      });
      router.push('/stakeholder-nps');
    } catch (error) {
      // Error handled by hook
    }
  };

  const addQuestion = () => {
    append({
      id: uuidv4(),
      type: 'text',
      question: '',
      required: false
    });
  };

  return (
    <ContentLayout title="Create Survey">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Stakeholder NPS', href: '/stakeholder-nps' },
          { label: 'Create Survey', href: '/stakeholder-nps/surveys/new' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/stakeholder-nps">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create NPS Survey</h1>
            <p className="text-muted-foreground">
              Create a new survey to collect stakeholder feedback
            </p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        <Input placeholder="e.g., Q1 2026 Parent Satisfaction Survey" {...field} />
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
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
                <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
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
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>Required</FormLabel>
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
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" asChild>
                <Link href="/stakeholder-nps">Cancel</Link>
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Survey'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </ContentLayout>
  );
}
