'use client';

/**
 * Organization OKR Creation Page - Complete 11-Section Implementation
 *
 * Creates group-wide OKRs for JKKN Institutions that sit above individual institution OKRs.
 * Only super_admin users can access this page.
 *
 * Key differences from institution-level OKRs:
 * - No institution_id (null) - applies to all institutions
 * - level = 'organization'
 * - Cascades down to institution-level OKRs
 * - Only Tier 1 (strategic) - no Tier 2 option
 * - Context is group-wide, not institution-specific
 *
 * Sections:
 * 1. Basic Info - Title, description, time period (annual)
 * 2. Strategic Context - Why this matters for JKKN Group, vision/mission alignment
 * 3. Success Metrics - How we'll measure success (KPIs to track)
 * 4. Key Results - 3-5 measurable outcomes with baseline/target/unit
 * 5. Stakeholders - Who needs to be involved across institutions
 * 6. Dependencies - Cross-institution dependencies, external requirements
 * 7. RACI Tasks - Key tasks with Responsible/Accountable/Consulted/Informed
 * 8. Risks - What could go wrong, likelihood, impact, mitigation
 * 9. Resources - Budget, people, tools needed across the group
 * 10. Milestones - Key checkpoints throughout the year
 * 11. Contingency - Plan B if things go off-track
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, addYears } from 'date-fns';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Target,
  Lightbulb,
  TrendingUp,
  Users,
  Link2,
  ClipboardList,
  AlertTriangle,
  DollarSign,
  Flag,
  Shield,
  Loader2,
  Plus,
  Trash2,
  Save,
  CheckCircle2
} from 'lucide-react';

// UI Components
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Hooks & Services
import { useAuth } from '@/hooks/use-auth';
import { useCreateObjective } from '@/hooks/okr/use-objectives';
import { useCreateKeyResult } from '@/hooks/okr/use-key-results';

// Error Boundary
import { OKRErrorBoundary } from '../../../_components';

// ============================================================================
// ZOD VALIDATION SCHEMA - Full 11-Section Structure
// ============================================================================

const organizationOKRSchema = z.object({
  // Section 1: Basic Info
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().optional(),
  start_date: z.string(),
  end_date: z.string(),

  // Section 2: Strategic Context
  strategic_rationale: z.string().min(20, 'Explain why this matters for JKKN Group (min 20 chars)'),
  vision_alignment: z.string().min(10, 'Explain alignment to JKKN vision'),
  mission_alignment: z.string().min(10, 'Explain alignment to JKKN mission'),
  stakeholder_impact: z.string().optional(),

  // Section 3: Success Metrics
  success_kpis: z.array(z.object({
    metric_name: z.string().min(1, 'Metric name required'),
    target: z.string().min(1, 'Target required'),
    measurement_frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly'])
  })).min(1, 'At least one success metric required'),

  // Section 4: Key Results
  key_results: z.array(z.object({
    title: z.string().min(5, 'KR title required'),
    description: z.string().optional(),
    baseline_value: z.number(),
    target_value: z.number().min(0.01, 'Target must be greater than 0'),
    unit: z.string().min(1, 'Unit required'),
    deadline: z.string(),
    data_source: z.enum(['manual', 'auto'])
  })).min(3, 'Organization OKRs require at least 3 Key Results').max(5, 'Maximum 5 Key Results'),

  // Section 5: Stakeholders
  stakeholders: z.array(z.object({
    name: z.string().min(1, 'Name required'),
    role: z.string().min(1, 'Role required'),
    involvement_type: z.enum(['sponsor', 'owner', 'contributor', 'informed', 'consulted'])
  })).min(1, 'At least one stakeholder required'),

  // Section 6: Dependencies
  dependencies: z.array(z.object({
    title: z.string().min(1, 'Dependency title required'),
    description: z.string().min(5, 'Description required'),
    dependency_type: z.enum(['external', 'internal', 'resource', 'budget', 'cross_institution']),
    required_by_date: z.string().optional()
  })),

  // Section 7: RACI Tasks
  tasks: z.array(z.object({
    title: z.string().min(3, 'Task title required'),
    description: z.string().optional(),
    deadline: z.string().optional(),
    responsible: z.string().optional(),
    accountable: z.string().optional(),
    consulted: z.array(z.string()).optional(),
    informed: z.array(z.string()).optional()
  })),

  // Section 8: Risks
  risks: z.array(z.object({
    description: z.string().min(10, 'Risk description required'),
    likelihood: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high']),
    mitigation_strategy: z.string().min(10, 'Mitigation strategy required')
  })),

  // Section 9: Resources
  budget_required: z.string().optional(),
  people_required: z.string().optional(),
  tools_required: z.string().optional(),
  external_support: z.string().optional(),

  // Section 10: Milestones
  milestones: z.array(z.object({
    title: z.string().min(1, 'Milestone title required'),
    target_date: z.string(),
    description: z.string().optional()
  })).min(1, 'At least one milestone required'),

  // Section 11: Contingency Plan
  contingency_plan: z.string().min(20, 'Contingency plan required (min 20 chars)'),
  alternative_approach: z.string().optional(),
  escalation_path: z.string().optional()
});

type OrganizationOKRFormValues = z.infer<typeof organizationOKRSchema>;

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const getDefaultValues = (): OrganizationOKRFormValues => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const nextYear = format(addYears(new Date(), 1), 'yyyy-MM-dd');

  // Calculate quarterly dates
  const q1Date = format(new Date(new Date().getFullYear(), 2, 31), 'yyyy-MM-dd'); // Mar 31
  const q2Date = format(new Date(new Date().getFullYear(), 5, 30), 'yyyy-MM-dd'); // Jun 30
  const q3Date = format(new Date(new Date().getFullYear(), 8, 30), 'yyyy-MM-dd'); // Sep 30
  const q4Date = format(new Date(new Date().getFullYear(), 11, 31), 'yyyy-MM-dd'); // Dec 31

  return {
    title: '',
    description: '',
    start_date: today,
    end_date: nextYear,
    strategic_rationale: '',
    vision_alignment: '',
    mission_alignment: '',
    stakeholder_impact: '',
    success_kpis: [
      { metric_name: '', target: '', measurement_frequency: 'monthly' }
    ],
    key_results: [
      { title: '', description: '', baseline_value: 0, target_value: 100, unit: '%', deadline: nextYear, data_source: 'manual' },
      { title: '', description: '', baseline_value: 0, target_value: 100, unit: '%', deadline: nextYear, data_source: 'manual' },
      { title: '', description: '', baseline_value: 0, target_value: 100, unit: '%', deadline: nextYear, data_source: 'manual' }
    ],
    stakeholders: [
      { name: '', role: '', involvement_type: 'owner' }
    ],
    dependencies: [],
    tasks: [],
    risks: [],
    budget_required: '',
    people_required: '',
    tools_required: '',
    external_support: '',
    milestones: [
      { title: 'Q1 Review - All Institutions', target_date: q1Date, description: '' },
      { title: 'Q2 Review - All Institutions', target_date: q2Date, description: '' },
      { title: 'Q3 Review - All Institutions', target_date: q3Date, description: '' },
      { title: 'Q4 Review - All Institutions', target_date: q4Date, description: '' }
    ],
    contingency_plan: '',
    alternative_approach: '',
    escalation_path: ''
  };
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function OrganizationOKRCreatePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const createObjective = useCreateObjective();
  const createKeyResult = useCreateKeyResult();

  const [activeTab, setActiveTab] = useState('section1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraft, setIsDraft] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin';

  // Initialize form
  const form = useForm<OrganizationOKRFormValues>({
    resolver: zodResolver(organizationOKRSchema),
    defaultValues: getDefaultValues(),
    mode: 'onChange'
  });

  // Field arrays for dynamic sections
  const { fields: kpiFields, append: appendKpi, remove: removeKpi } = useFieldArray({
    control: form.control,
    name: 'success_kpis'
  });

  const { fields: krFields, append: appendKr, remove: removeKr } = useFieldArray({
    control: form.control,
    name: 'key_results'
  });

  const { fields: stakeholderFields, append: appendStakeholder, remove: removeStakeholder } = useFieldArray({
    control: form.control,
    name: 'stakeholders'
  });

  const { fields: dependencyFields, append: appendDependency, remove: removeDependency } = useFieldArray({
    control: form.control,
    name: 'dependencies'
  });

  const { fields: taskFields, append: appendTask, remove: removeTask } = useFieldArray({
    control: form.control,
    name: 'tasks'
  });

  const { fields: riskFields, append: appendRisk, remove: removeRisk } = useFieldArray({
    control: form.control,
    name: 'risks'
  });

  const { fields: milestoneFields, append: appendMilestone, remove: removeMilestone } = useFieldArray({
    control: form.control,
    name: 'milestones'
  });

  // ============================================================================
  // SUBMIT HANDLERS
  // ============================================================================

  const handleSaveDraft = async () => {
    setIsDraft(true);
    await handleSubmit(form.getValues(), true);
    setIsDraft(false);
  };

  const handleSubmit = async (values: OrganizationOKRFormValues, saveDraft = false) => {
    if (!isSuperAdmin) {
      toast.error('Only Super Admins can create organization-level OKRs');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create objective with organization level (no institution_id)
      const objectiveData = {
        title: values.title,
        description: values.description,
        rationale: values.strategic_rationale,
        tier: 'tier_1' as const, // Organization OKRs are always Tier 1 (strategic)
        level: 'organization' as const,
        // Organization-level OKRs have undefined institution_id - applies to all institutions
        institution_id: undefined,
        department_id: undefined,
        cycle_type: 'annual' as const,
        start_date: values.start_date,
        end_date: values.end_date,
        ai_integration_notes: JSON.stringify({
          vision_alignment: values.vision_alignment,
          mission_alignment: values.mission_alignment,
          stakeholder_impact: values.stakeholder_impact,
          success_kpis: values.success_kpis,
          stakeholders: values.stakeholders,
          dependencies: values.dependencies,
          tasks: values.tasks,
          risks: values.risks,
          milestones: values.milestones,
          resources: {
            budget: values.budget_required,
            people: values.people_required,
            tools: values.tools_required,
            external_support: values.external_support
          },
          contingency: {
            plan: values.contingency_plan,
            alternative: values.alternative_approach,
            escalation: values.escalation_path
          }
        })
      };

      const objective = await createObjective.mutateAsync(objectiveData);

      // Create Key Results
      for (const kr of values.key_results) {
        if (kr.title.trim()) {
          await createKeyResult.mutateAsync({
            objective_id: objective.id,
            title: kr.title,
            description: kr.description,
            start_value: kr.baseline_value,
            target_value: kr.target_value,
            unit: kr.unit,
            deadline: kr.deadline,
            data_source: kr.data_source
          });
        }
      }

      if (saveDraft) {
        toast.success('Draft saved successfully!');
      } else {
        toast.success('Organization OKR created successfully!');
        router.push(`/okr/objectives/${objective.id}`);
      }
    } catch (error) {
      console.error('Error creating Organization OKR:', error);
      toast.error('Failed to create OKR');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  // Show loading state while profile loads
  if (!profile) {
    return (
      <ContentLayout title="Loading...">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  // Show access denied for non-super-admins
  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Access Denied">
        <Card className="max-w-md mx-auto mt-12">
          <CardContent className="p-6 text-center">
            <Shield className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-lg font-semibold">Access Restricted</h2>
            <p className="text-muted-foreground mt-2">
              Only Super Administrators can create organization-level OKRs.
            </p>
            <Button asChild className="mt-4">
              <Link href="/okr/organization">Back to Organization OKRs</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Create Organization OKR">
      <OKRErrorBoundary>
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/okr/organization">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Link>
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isSubmitting || isDraft}
              >
                {isDraft ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Draft
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Title Card */}
          <Card className="border-l-4 border-l-green-700">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-700">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <CardTitle>Create Organization OKR (11 Sections)</CardTitle>
                  <CardDescription>
                    Complete strategic planning for group-wide JKKN initiatives
                  </CardDescription>
                </div>
                <Badge className="bg-green-700 font-semibold">
                  ORGANIZATION LEVEL
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Info Alert */}
          <Alert>
            <Building2 className="h-4 w-4" />
            <AlertTitle>Organization-Level OKR</AlertTitle>
            <AlertDescription>
              This OKR will apply to all 9 JKKN Institutions. It will appear at the top of the cascade
              hierarchy and can be linked by institution-level OKRs as a parent objective. Organization OKRs
              are always Tier 1 (strategic) with annual cycles.
            </AlertDescription>
          </Alert>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => handleSubmit(values, false))}>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                {/* Navigation - 6 Tabs like tier1 */}
                <Card>
                  <CardContent className="pt-6">
                    <TabsList className="grid w-full grid-cols-6 h-auto">
                      <TabsTrigger value="section1" className="flex-col gap-1 py-2">
                        <Target className="h-4 w-4" />
                        <span className="text-xs">Basic & Context</span>
                      </TabsTrigger>
                      <TabsTrigger value="section2" className="flex-col gap-1 py-2">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs">Metrics & KRs</span>
                      </TabsTrigger>
                      <TabsTrigger value="section3" className="flex-col gap-1 py-2">
                        <Users className="h-4 w-4" />
                        <span className="text-xs">Stakeholders</span>
                      </TabsTrigger>
                      <TabsTrigger value="section4" className="flex-col gap-1 py-2">
                        <Link2 className="h-4 w-4" />
                        <span className="text-xs">Dependencies</span>
                      </TabsTrigger>
                      <TabsTrigger value="section5" className="flex-col gap-1 py-2">
                        <ClipboardList className="h-4 w-4" />
                        <span className="text-xs">Tasks & Risks</span>
                      </TabsTrigger>
                      <TabsTrigger value="section6" className="flex-col gap-1 py-2">
                        <DollarSign className="h-4 w-4" />
                        <span className="text-xs">Resources & Plan B</span>
                      </TabsTrigger>
                    </TabsList>
                  </CardContent>
                </Card>

                {/* ================================================================ */}
                {/* SECTION 1 & 2: Basic Info + Strategic Context */}
                {/* ================================================================ */}
                <TabsContent value="section1" className="space-y-6">
                  {/* Section 1: Basic Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Section 1: Basic Information
                      </CardTitle>
                      <CardDescription>
                        Define the group-wide objective title and timeline
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Objective Title *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Achieve JKKN Group 10,000 Learners Enrollment by 2027"
                                {...field}
                                className="text-lg font-medium"
                              />
                            </FormControl>
                            <FormDescription>
                              A clear, inspiring objective that applies across all 9 institutions
                            </FormDescription>
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
                                placeholder="What does success look like for JKKN Group as a whole?"
                                rows={3}
                                {...field}
                              />
                            </FormControl>
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
                              <FormLabel>End Date * (Annual - 1 year)</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Display that this is organization level and Tier 1 */}
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg text-sm">
                        <p className="font-medium text-green-700 dark:text-green-400 mb-1">Organization OKR Settings:</p>
                        <ul className="text-green-600 dark:text-green-300 space-y-1">
                          <li><strong>Level:</strong> Organization (applies to all 9 institutions)</li>
                          <li><strong>Tier:</strong> Tier 1 - Strategic (organization OKRs are always strategic)</li>
                          <li><strong>Cycle:</strong> Annual</li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Section 2: Strategic Context */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-yellow-600" />
                        Section 2: Strategic Context (WHY)
                      </CardTitle>
                      <CardDescription>
                        Explain why this objective matters for JKKN Group and how it aligns with our vision and mission
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="strategic_rationale"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Strategic Rationale *</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Why is this objective critical for JKKN Group right now? What strategic priority does it address across all institutions?"
                                rows={4}
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Connect to group-wide challenges, opportunities, or strategic priorities
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="vision_alignment"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Vision Alignment *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="How does this support JKKN's vision: 'To be a Leading Global Innovative Solutions provider for the ever changing needs of society'?"
                                  rows={3}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="mission_alignment"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mission Alignment *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="How does this support JKKN's mission: 'Enabling a Platform for all to seize exponential opportunities through bioconvergence'?"
                                  rows={3}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="stakeholder_impact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Group-wide Impact</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="How will this impact each of the 9 institutions? Who benefits - Learners, Learning Senior Learners, staff, community?"
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

                  <div className="flex justify-end">
                    <Button type="button" onClick={() => setActiveTab('section2')}>
                      Next: Metrics & Key Results
                    </Button>
                  </div>
                </TabsContent>

                {/* ================================================================ */}
                {/* SECTION 3 & 4: Success Metrics + Key Results */}
                {/* ================================================================ */}
                <TabsContent value="section2" className="space-y-6">
                  {/* Section 3: Success Metrics */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-blue-600" />
                        Section 3: Success Metrics (HOW WE MEASURE)
                      </CardTitle>
                      <CardDescription>
                        Define the high-level KPIs you will track to measure group-wide success
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {kpiFields.map((field, index) => (
                        <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-blue-50/50 dark:bg-blue-950/20">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">KPI {index + 1}</Badge>
                            {kpiFields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeKpi(index)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <FormField
                              control={form.control}
                              name={`success_kpis.${index}.metric_name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Metric Name *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., Total Group Enrollment" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`success_kpis.${index}.target`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Target *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., 10,000 learners" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`success_kpis.${index}.measurement_frequency`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Frequency *</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="daily">Daily</SelectItem>
                                      <SelectItem value="weekly">Weekly</SelectItem>
                                      <SelectItem value="monthly">Monthly</SelectItem>
                                      <SelectItem value="quarterly">Quarterly</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendKpi({ metric_name: '', target: '', measurement_frequency: 'monthly' })}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add KPI
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Section 4: Key Results */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-green-600" />
                        Section 4: Key Results (WHAT - Measurable Outcomes)
                      </CardTitle>
                      <CardDescription>
                        Define 3-5 specific, measurable outcomes using "From X to Y by Date" format
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {krFields.map((field, index) => (
                        <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-green-50/50 dark:bg-green-950/20">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">KR {index + 1}</Badge>
                            {krFields.length > 3 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeKr(index)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>

                          <FormField
                            control={form.control}
                            name={`key_results.${index}.title`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Key Result Title *</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="e.g., Increase total group enrollment from 5,000 to 10,000 learners"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-4 gap-3">
                            <FormField
                              control={form.control}
                              name={`key_results.${index}.baseline_value`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>From (Baseline)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`key_results.${index}.target_value`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>To (Target) *</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`key_results.${index}.unit`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Unit *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="learners" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`key_results.${index}.deadline`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>By Date *</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name={`key_results.${index}.data_source`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Data Source</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="manual">Manual Entry</SelectItem>
                                    <SelectItem value="auto">Auto-tracked</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      ))}

                      {krFields.length < 5 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => appendKr({
                            title: '',
                            description: '',
                            baseline_value: 0,
                            target_value: 100,
                            unit: '%',
                            deadline: form.getValues('end_date'),
                            data_source: 'manual'
                          })}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Key Result
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => setActiveTab('section1')}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                    <Button type="button" onClick={() => setActiveTab('section3')}>
                      Next: Stakeholders
                    </Button>
                  </div>
                </TabsContent>

                {/* ================================================================ */}
                {/* SECTION 5: Stakeholders */}
                {/* ================================================================ */}
                <TabsContent value="section3" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-purple-600" />
                        Section 5: Stakeholders (WHO)
                      </CardTitle>
                      <CardDescription>
                        Identify who needs to be involved across institutions - executives, deans, department heads
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg text-sm">
                        <p className="font-medium text-purple-700 dark:text-purple-400 mb-1">Involvement Types:</p>
                        <ul className="text-purple-600 dark:text-purple-300 space-y-1">
                          <li><strong>Sponsor:</strong> Executive champion who approves resources (MD, Directors)</li>
                          <li><strong>Owner:</strong> Person accountable for delivering results across institutions</li>
                          <li><strong>Contributor:</strong> Deans/HODs who actively work on achieving the objective</li>
                          <li><strong>Consulted:</strong> Provides input before decisions (other institutions)</li>
                          <li><strong>Informed:</strong> Kept up-to-date on progress (Board, external stakeholders)</li>
                        </ul>
                      </div>

                      {stakeholderFields.map((field, index) => (
                        <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-purple-50/30 dark:bg-purple-950/10">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">Stakeholder {index + 1}</Badge>
                            {stakeholderFields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeStakeholder(index)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <FormField
                              control={form.control}
                              name={`stakeholders.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Name *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., Dr. Principal Name" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`stakeholders.${index}.role`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Role/Title *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., Principal, Dental College" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`stakeholders.${index}.involvement_type`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Involvement *</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="sponsor">Sponsor</SelectItem>
                                      <SelectItem value="owner">Owner</SelectItem>
                                      <SelectItem value="contributor">Contributor</SelectItem>
                                      <SelectItem value="consulted">Consulted</SelectItem>
                                      <SelectItem value="informed">Informed</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendStakeholder({ name: '', role: '', involvement_type: 'contributor' })}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Stakeholder
                      </Button>
                    </CardContent>
                  </Card>

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => setActiveTab('section2')}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                    <Button type="button" onClick={() => setActiveTab('section4')}>
                      Next: Dependencies
                    </Button>
                  </div>
                </TabsContent>

                {/* ================================================================ */}
                {/* SECTION 6: Dependencies */}
                {/* ================================================================ */}
                <TabsContent value="section4" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Link2 className="h-5 w-5 text-orange-600" />
                        Section 6: Dependencies (WHAT WE NEED FROM OTHERS)
                      </CardTitle>
                      <CardDescription>
                        Identify cross-institution dependencies and external requirements
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {dependencyFields.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No dependencies added yet</p>
                          <p className="text-sm">Add dependencies to surface cross-institution needs early</p>
                        </div>
                      ) : (
                        dependencyFields.map((field, index) => (
                          <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-orange-50/30 dark:bg-orange-950/10">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline">Dependency {index + 1}</Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeDependency(index)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>

                            <FormField
                              control={form.control}
                              name={`dependencies.${index}.title`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Dependency Title *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., Shared Marketing Campaign" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`dependencies.${index}.description`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Description *</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="What do you need and from which institution/team?"
                                      rows={2}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="grid grid-cols-2 gap-3">
                              <FormField
                                control={form.control}
                                name={`dependencies.${index}.dependency_type`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Type *</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="cross_institution">Cross-Institution</SelectItem>
                                        <SelectItem value="external">External (Vendor/Partner)</SelectItem>
                                        <SelectItem value="internal">Internal Team</SelectItem>
                                        <SelectItem value="resource">Resource</SelectItem>
                                        <SelectItem value="budget">Budget</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`dependencies.${index}.required_by_date`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Required By</FormLabel>
                                    <FormControl>
                                      <Input type="date" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        ))
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendDependency({
                          title: '',
                          description: '',
                          dependency_type: 'cross_institution',
                          required_by_date: ''
                        })}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Dependency
                      </Button>
                    </CardContent>
                  </Card>

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => setActiveTab('section3')}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                    <Button type="button" onClick={() => setActiveTab('section5')}>
                      Next: Tasks & Risks
                    </Button>
                  </div>
                </TabsContent>

                {/* ================================================================ */}
                {/* SECTION 7 & 8: RACI Tasks + Risks */}
                {/* ================================================================ */}
                <TabsContent value="section5" className="space-y-6">
                  {/* Section 7: RACI Tasks */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-indigo-600" />
                        Section 7: RACI Tasks (HOW - Action Plan)
                      </CardTitle>
                      <CardDescription>
                        Break down key tasks with clear accountability using RACI model
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg text-sm">
                        <p className="font-medium text-indigo-700 dark:text-indigo-400">RACI Matrix:</p>
                        <p className="text-indigo-600 dark:text-indigo-300">
                          <strong>R</strong>esponsible (does work) - <strong>A</strong>ccountable (approves) -
                          <strong>C</strong>onsulted (input before) - <strong>I</strong>nformed (told after)
                        </p>
                      </div>

                      {taskFields.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No tasks added yet</p>
                          <p className="text-sm">Add key tasks to clarify accountability across institutions</p>
                        </div>
                      ) : (
                        taskFields.map((field, index) => (
                          <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-indigo-50/30 dark:bg-indigo-950/10">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline">Task {index + 1}</Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeTask(index)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>

                            <FormField
                              control={form.control}
                              name={`tasks.${index}.title`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Task Title *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., Develop unified marketing campaign" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="grid grid-cols-2 gap-3">
                              <FormField
                                control={form.control}
                                name={`tasks.${index}.responsible`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Responsible (Does Work)</FormLabel>
                                    <FormControl>
                                      <Input placeholder="Institution/Team" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`tasks.${index}.accountable`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Accountable (Approves)</FormLabel>
                                    <FormControl>
                                      <Input placeholder="Name/Title" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            <FormField
                              control={form.control}
                              name={`tasks.${index}.deadline`}
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
                          </div>
                        ))
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendTask({
                          title: '',
                          description: '',
                          deadline: '',
                          responsible: '',
                          accountable: '',
                          consulted: [],
                          informed: []
                        })}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Task
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Section 8: Risks */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        Section 8: Risks & Mitigation (WHAT COULD GO WRONG)
                      </CardTitle>
                      <CardDescription>
                        Identify potential blockers across the group and how to prevent or handle them
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {riskFields.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No risks identified yet</p>
                          <p className="text-sm">Add risks to plan for potential challenges across institutions</p>
                        </div>
                      ) : (
                        riskFields.map((field, index) => (
                          <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-red-50/30 dark:bg-red-950/10">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline">Risk {index + 1}</Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeRisk(index)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>

                            <FormField
                              control={form.control}
                              name={`risks.${index}.description`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Risk Description *</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="e.g., Inconsistent implementation across institutions"
                                      rows={2}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="grid grid-cols-2 gap-3">
                              <FormField
                                control={form.control}
                                name={`risks.${index}.likelihood`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Likelihood *</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`risks.${index}.impact`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Impact *</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            <FormField
                              control={form.control}
                              name={`risks.${index}.mitigation_strategy`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Mitigation Strategy *</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="How will you prevent or handle this risk across all institutions?"
                                      rows={2}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        ))
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendRisk({
                          description: '',
                          likelihood: 'medium',
                          impact: 'medium',
                          mitigation_strategy: ''
                        })}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Risk
                      </Button>
                    </CardContent>
                  </Card>

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => setActiveTab('section4')}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                    <Button type="button" onClick={() => setActiveTab('section6')}>
                      Next: Resources & Contingency
                    </Button>
                  </div>
                </TabsContent>

                {/* ================================================================ */}
                {/* SECTION 9, 10, 11: Resources + Milestones + Contingency */}
                {/* ================================================================ */}
                <TabsContent value="section6" className="space-y-6">
                  {/* Section 9: Resources */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-green-600" />
                        Section 9: Resources Needed (WHAT WE NEED)
                      </CardTitle>
                      <CardDescription>
                        Identify budget, people, tools, and external support required across the group
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="budget_required"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Budget Required</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="e.g., Rs 50,00,000 for group-wide marketing, Rs 20,00,000 for infrastructure"
                                  rows={3}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="people_required"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>People Required</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="e.g., 1 Project Coordinator, 9 Institution Leads, Marketing team"
                                  rows={3}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="tools_required"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tools & Technology</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="e.g., Centralized CRM, Group analytics dashboard, Shared communication platform"
                                  rows={3}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="external_support"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>External Support</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="e.g., Marketing agency, Consultants, Technology vendors"
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

                  {/* Section 10: Milestones */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Flag className="h-5 w-5 text-blue-600" />
                        Section 10: Milestones (WHEN - Key Checkpoints)
                      </CardTitle>
                      <CardDescription>
                        Define quarterly or key milestone dates to track group-wide progress
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {milestoneFields.map((field, index) => (
                        <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-blue-50/30 dark:bg-blue-950/10">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">Milestone {index + 1}</Badge>
                            {milestoneFields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeMilestone(index)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={form.control}
                              name={`milestones.${index}.title`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Milestone Title *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., Q1 Review - All Institutions" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`milestones.${index}.target_date`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Target Date *</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name={`milestones.${index}.description`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="What should be achieved by this milestone across all institutions?"
                                    rows={2}
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendMilestone({ title: '', target_date: '', description: '' })}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Milestone
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Section 11: Contingency Plan */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-gray-600" />
                        Section 11: Contingency Plan (PLAN B)
                      </CardTitle>
                      <CardDescription>
                        Define what happens if things go off-track at the group level
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="contingency_plan"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contingency Plan *</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="If we fall behind, what's the backup plan? How do we re-allocate resources across institutions? What can be deprioritized?"
                                rows={4}
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Consider cross-institutional backup strategies and resource reallocation
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="alternative_approach"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Alternative Approach</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="If current approach doesn't work, what's Plan B? Can some institutions pilot while others follow?"
                                rows={3}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="escalation_path"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Escalation Path</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Who gets involved if we hit critical blockers? When do we escalate to MD/Board? What triggers an emergency review?"
                                rows={2}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => setActiveTab('section5')}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-green-700 hover:bg-green-800"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Create Organization OKR
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </form>
          </Form>
        </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
