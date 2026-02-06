'use client';

// ============================================================================
// Competency Form Component
// Reusable form for creating and editing competencies
// ============================================================================

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Save, X, Plus } from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
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

// Components
import { ProficiencyLevelBuilder } from './proficiency-level-builder';
import { FinksDimensionInput } from './finks-dimension-input';

// Types
import type {
  Competency,
  CompetencyType,
  ProficiencyLevelDefinition,
  FinksDimensions,
  CreateCompetencyDTO,
  UpdateCompetencyDTO
} from '@/types/competency';
import { useState } from 'react';

// ============================================================================
// CONSTANTS
// ============================================================================

const COMPETENCY_TYPES: { value: CompetencyType; label: string; description: string }[] = [
  { value: 'technical', label: 'Technical', description: 'Hard skills, technical knowledge' },
  { value: 'behavioral', label: 'Behavioral', description: 'Soft skills, interpersonal abilities' },
  { value: 'domain', label: 'Domain', description: 'Industry/field-specific knowledge' },
  { value: 'soft_skill', label: 'Soft Skill', description: 'Communication, teamwork, etc.' },
  { value: 'metacognitive', label: 'Metacognitive', description: 'Self-awareness, learning strategies' }
];

// Common industry tags for suggestions
const SUGGESTED_TAGS = [
  'Healthcare', 'Engineering', 'IT', 'Business', 'Communication',
  'Leadership', 'Data Analysis', 'Problem Solving', 'Dental', 'Nursing',
  'Pharmacy', 'Agriculture', 'Education', 'Research', 'Clinical'
];

// ============================================================================
// SCHEMA
// ============================================================================

const competencyFormSchema = z.object({
  competency_code: z.string()
    .min(2, 'Code must be at least 2 characters')
    .max(50, 'Code cannot exceed 50 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase letters, numbers, underscores, or hyphens'),
  competency_name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(255, 'Name cannot exceed 255 characters'),
  competency_type: z.enum(['technical', 'behavioral', 'domain', 'soft_skill', 'metacognitive']),
  description: z.string().max(2000, 'Description cannot exceed 2000 characters').optional(),
  industry_tags: z.array(z.string()).default([]),
  proficiency_levels: z.array(z.object({
    level: z.enum(['novice', 'beginner', 'intermediate', 'advanced', 'expert']),
    description: z.string(),
    criteria: z.array(z.string()),
    typical_duration_hours: z.number().optional()
  })).min(1, 'At least one proficiency level is required'),
  finks_dimensions: z.object({
    foundational_knowledge: z.number().min(0).max(100).default(0),
    application: z.number().min(0).max(100).default(0),
    integration: z.number().min(0).max(100).default(0),
    human_dimension: z.number().min(0).max(100).default(0),
    caring: z.number().min(0).max(100).default(0),
    learning_how_to_learn: z.number().min(0).max(100).default(0)
  }),
  is_active: z.boolean().default(true)
});

type CompetencyFormData = z.infer<typeof competencyFormSchema>;

// ============================================================================
// PROPS
// ============================================================================

interface CompetencyFormProps {
  competency?: Competency;
  institutionId: string;
  onSubmit: (data: CreateCompetencyDTO | UpdateCompetencyDTO) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CompetencyForm({
  competency,
  institutionId,
  onSubmit,
  onCancel,
  isSubmitting = false
}: CompetencyFormProps) {
  const [newTag, setNewTag] = useState('');

  const isEditing = !!competency;

  const form = useForm<CompetencyFormData>({
    resolver: zodResolver(competencyFormSchema),
    defaultValues: {
      competency_code: competency?.competency_code || '',
      competency_name: competency?.competency_name || '',
      competency_type: competency?.competency_type || 'technical',
      description: competency?.description || '',
      industry_tags: competency?.industry_tags || [],
      proficiency_levels: competency?.proficiency_levels || [],
      finks_dimensions: competency?.finks_dimensions || {
        foundational_knowledge: 0,
        application: 0,
        integration: 0,
        human_dimension: 0,
        caring: 0,
        learning_how_to_learn: 0
      },
      is_active: competency?.is_active ?? true
    }
  });

  const handleSubmit = async (data: CompetencyFormData) => {
    // Map proficiency levels to ensure type compatibility
    const mappedProficiencyLevels: ProficiencyLevelDefinition[] = data.proficiency_levels.map(pl => ({
      level: pl.level,
      description: pl.description,
      criteria: pl.criteria,
      typical_duration_hours: pl.typical_duration_hours
    }));

    // Ensure finks_dimensions is properly typed
    const finksDimensions: FinksDimensions = {
      foundational_knowledge: data.finks_dimensions.foundational_knowledge ?? 0,
      application: data.finks_dimensions.application ?? 0,
      integration: data.finks_dimensions.integration ?? 0,
      human_dimension: data.finks_dimensions.human_dimension ?? 0,
      caring: data.finks_dimensions.caring ?? 0,
      learning_how_to_learn: data.finks_dimensions.learning_how_to_learn ?? 0
    };

    if (isEditing) {
      const updateData: UpdateCompetencyDTO = {
        competency_code: data.competency_code,
        competency_name: data.competency_name,
        competency_type: data.competency_type,
        description: data.description,
        industry_tags: data.industry_tags,
        proficiency_levels: mappedProficiencyLevels,
        finks_dimensions: finksDimensions,
        is_active: data.is_active
      };
      await onSubmit(updateData);
    } else {
      const createData: CreateCompetencyDTO = {
        institution_id: institutionId,
        competency_code: data.competency_code,
        competency_name: data.competency_name,
        competency_type: data.competency_type,
        description: data.description,
        industry_tags: data.industry_tags,
        proficiency_levels: mappedProficiencyLevels,
        finks_dimensions: finksDimensions,
        is_active: data.is_active
      };
      await onSubmit(createData);
    }
  };

  const addTag = (tag: string) => {
    const currentTags = form.getValues('industry_tags');
    if (tag && !currentTags.includes(tag)) {
      form.setValue('industry_tags', [...currentTags, tag]);
    }
    setNewTag('');
  };

  const removeTag = (tagToRemove: string) => {
    const currentTags = form.getValues('industry_tags');
    form.setValue('industry_tags', currentTags.filter(t => t !== tagToRemove));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Define the competency's identity and classification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="competency_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Competency Code *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., TECH-001, COMM-LEAD"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormDescription>
                      Unique identifier (uppercase, numbers, hyphens)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="competency_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Competency Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COMPETENCY_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <div>
                              <span className="font-medium">{type.label}</span>
                              <span className="text-muted-foreground ml-2 text-xs">
                                {type.description}
                              </span>
                            </div>
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
              name="competency_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Competency Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Patient Communication Skills"
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
                      placeholder="Describe what this competency encompasses..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          </CardContent>
        </Card>

        {/* Industry Tags */}
        <Card>
          <CardHeader>
            <CardTitle>Industry Tags</CardTitle>
            <CardDescription>
              Tag this competency with relevant industries or domains
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="industry_tags"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {field.value.map(tag => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {field.value.length === 0 && (
                      <span className="text-sm text-muted-foreground">No tags added</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      placeholder="Add custom tag..."
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag(newTag);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addTag(newTag)}
                      disabled={!newTag}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-2">Suggested tags:</p>
                    <div className="flex flex-wrap gap-1">
                      {SUGGESTED_TAGS.filter(tag => !field.value.includes(tag)).slice(0, 10).map(tag => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="cursor-pointer hover:bg-primary/10"
                          onClick={() => addTag(tag)}
                        >
                          + {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Fink's Dimensions */}
        <Card>
          <CardHeader>
            <CardTitle>Fink&apos;s Taxonomy - Significant Learning Dimensions</CardTitle>
            <CardDescription>
              Measure what makes this competency uniquely human in the AI era (0-100 scale)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="finks_dimensions"
              render={({ field }) => {
                // Ensure all fields have values
                const dimensions: FinksDimensions = {
                  foundational_knowledge: field.value.foundational_knowledge ?? 0,
                  application: field.value.application ?? 0,
                  integration: field.value.integration ?? 0,
                  human_dimension: field.value.human_dimension ?? 0,
                  caring: field.value.caring ?? 0,
                  learning_how_to_learn: field.value.learning_how_to_learn ?? 0
                };

                return (
                  <FormItem>
                    <FinksDimensionInput
                      value={dimensions}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                      showDescriptions={true}
                      highlightAiProof={true}
                    />
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </CardContent>
        </Card>

        {/* Proficiency Levels */}
        <Card>
          <CardHeader>
            <CardTitle>Proficiency Levels</CardTitle>
            <CardDescription>
              Define the progression levels and criteria for mastery
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="proficiency_levels"
              render={({ field }) => (
                <FormItem>
                  <ProficiencyLevelBuilder
                    value={field.value as ProficiencyLevelDefinition[]}
                    onChange={field.onChange}
                    error={form.formState.errors.proficiency_levels?.message}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Status */}
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Status</FormLabel>
                    <FormDescription>
                      Inactive competencies will not appear in selection lists
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: '#0b6d41' }}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            {isEditing ? 'Update Competency' : 'Create Competency'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
