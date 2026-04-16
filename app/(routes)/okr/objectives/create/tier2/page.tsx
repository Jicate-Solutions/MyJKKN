'use client';

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../../../_components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { z } from 'zod';
import { format, addQuarters } from 'date-fns';
import {
  ArrowLeft,
  Target,
  Users,
  FileText,
  Loader2,
  Check,
  Plus,
  Trash2,
  Link2,
  Award,
  UserPlus,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useCreateObjective, useAvailableParentObjectives } from '@/hooks/okr/use-objectives';
import { useCreateKeyResult } from '@/hooks/okr/use-key-results';
import { useDepartments } from '@/hooks/organization/use-departments';
import type {
  CreateOKRObjectiveDTO,
  CreateOKRKeyResultDTO
} from '@/types/okr';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface KeyResultForm {
  id: string;
  title: string;
  description: string;
  baselineValue: number;
  targetValue: number;
  unit: string;
  deadline: string;
  dataSource: 'manual' | 'auto';
}

interface TeamMemberForm {
  id: string;
  name: string;
  role: string;
}

interface SuccessCriteriaForm {
  id: string;
  description: string;
}

// ============================================================================
// ZOD VALIDATION SCHEMA
// ============================================================================

const keyResultSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Key result title is required').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().max(500).optional(),
  baselineValue: z.number().min(0),
  targetValue: z.number().min(1, 'Target value must be at least 1'),
  unit: z.string().max(50),
  deadline: z.string().min(1),
  dataSource: z.enum(['manual', 'auto'])
});

const tier2ObjectiveSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().max(1000).optional(),
  institutionId: z.string().min(1, 'Institution is required'),
  departmentId: z.string().optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  departmentGoals: z.string().min(10, 'Department goals must be at least 10 characters').max(2000),
  strategicAlignment: z.string().max(1000).optional(),
  parentObjectiveId: z.string().min(1, 'Parent objective is required for TIER 2'),
  keyResults: z.array(keyResultSchema).min(1, 'At least one key result is required'),
  successCriteria: z.array(z.object({
    id: z.string(),
    description: z.string()
  })).refine(arr => arr.some(sc => sc.description.trim().length > 0), 'At least one success criteria is required')
});

type Tier2ObjectiveFormData = z.infer<typeof tier2ObjectiveSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function getQuarterEndDate(startDate: string): string {
  return format(addQuarters(new Date(startDate), 1), 'yyyy-MM-dd');
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CreateTier2ObjectivePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { institutions } = useUserInstitutionAccess();
  const createObjective = useCreateObjective();
  const createKeyResult = useCreateKeyResult();

  // State for institution selection (needed before calling useDepartments)
  const [institutionId, setInstitutionId] = useState('');

  // Fetch departments for selected institution
  const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({
    institution_id: institutionId || undefined,
    isActive: true,
    limit: 100
  });
  const departments = departmentsData?.data || [];

  // State
  const [currentSection, setCurrentSection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Section 1: Basic Info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // institutionId is declared above (needed for useDepartments hook)
  const [departmentId, setDepartmentId] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(getQuarterEndDate(format(new Date(), 'yyyy-MM-dd')));

  // Section 2: Department Goals
  const [departmentGoals, setDepartmentGoals] = useState('');
  const [strategicAlignment, setStrategicAlignment] = useState('');

  // Section 3: Key Results
  const [keyResults, setKeyResults] = useState<KeyResultForm[]>([
    {
      id: generateId(),
      title: '',
      description: '',
      baselineValue: 0,
      targetValue: 100,
      unit: '%',
      deadline: getQuarterEndDate(format(new Date(), 'yyyy-MM-dd')),
      dataSource: 'manual'
    }
  ]);

  // Section 4: Parent Alignment
  const [parentObjectiveId, setParentObjectiveId] = useState('');

  // Section 5: Team Resources
  const [teamMembers, setTeamMembers] = useState<TeamMemberForm[]>([]);

  // Section 6: Success Criteria
  const [successCriteria, setSuccessCriteria] = useState<SuccessCriteriaForm[]>([
    { id: generateId(), description: '' }
  ]);

  // Fetch available parent objectives (TIER 1)
  const { data: parentObjectives = [], isLoading: loadingParents } = useAvailableParentObjectives(
    institutionId,
    'department'
  );

  // Update end date when start date changes
  useEffect(() => {
    setEndDate(getQuarterEndDate(startDate));
  }, [startDate]);

  // Set default institution
  useEffect(() => {
    if (institutions.length > 0 && !institutionId) {
      setInstitutionId(institutions[0].institution_id);
    }
  }, [institutions, institutionId]);

  // Reset department when institution changes
  useEffect(() => {
    setDepartmentId('');
  }, [institutionId]);

  // Update KR deadlines when end date changes
  useEffect(() => {
    setKeyResults(prev => prev.map(kr => ({ ...kr, deadline: endDate })));
  }, [endDate]);

  // ============================================================================
  // KEY RESULTS HANDLERS
  // ============================================================================

  const addKeyResult = () => {
    setKeyResults([
      ...keyResults,
      {
        id: generateId(),
        title: '',
        description: '',
        baselineValue: 0,
        targetValue: 100,
        unit: '%',
        deadline: endDate,
        dataSource: 'manual'
      }
    ]);
  };

  const updateKeyResult = (id: string, field: keyof KeyResultForm, value: unknown) => {
    setKeyResults(
      keyResults.map((kr) => (kr.id === id ? { ...kr, [field]: value } : kr))
    );
  };

  const removeKeyResult = (id: string) => {
    if (keyResults.length > 1) {
      setKeyResults(keyResults.filter((kr) => kr.id !== id));
    }
  };

  // ============================================================================
  // TEAM MEMBERS HANDLERS
  // ============================================================================

  const addTeamMember = () => {
    setTeamMembers([
      ...teamMembers,
      {
        id: generateId(),
        name: '',
        role: ''
      }
    ]);
  };

  const updateTeamMember = (id: string, field: keyof TeamMemberForm, value: string) => {
    setTeamMembers(
      teamMembers.map((member) => (member.id === id ? { ...member, [field]: value } : member))
    );
  };

  const removeTeamMember = (id: string) => {
    setTeamMembers(teamMembers.filter((member) => member.id !== id));
  };

  // ============================================================================
  // SUCCESS CRITERIA HANDLERS
  // ============================================================================

  const addSuccessCriteria = () => {
    setSuccessCriteria([
      ...successCriteria,
      {
        id: generateId(),
        description: ''
      }
    ]);
  };

  const updateSuccessCriteria = (id: string, value: string) => {
    setSuccessCriteria(
      successCriteria.map((criteria) => (criteria.id === id ? { ...criteria, description: value } : criteria))
    );
  };

  const removeSuccessCriteria = (id: string) => {
    if (successCriteria.length > 1) {
      setSuccessCriteria(successCriteria.filter((criteria) => criteria.id !== id));
    }
  };

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const isSection1Valid: boolean = Boolean(title.trim() && institutionId && startDate && endDate);
  const isSection2Valid: boolean = Boolean(departmentGoals.trim());
  const isSection3Valid: boolean = keyResults.some(kr => kr.title.trim() && kr.targetValue > 0);
  const isSection4Valid: boolean = parentObjectiveId !== ''; // Required for TIER 2
  const isSection5Valid: boolean = true; // Optional section
  const isSection6Valid: boolean = successCriteria.some(sc => Boolean(sc.description.trim()));

  const canProceedFromSection = (section: number): boolean => {
    switch (section) {
      case 1: return isSection1Valid;
      case 2: return isSection2Valid;
      case 3: return isSection3Valid;
      case 4: return isSection4Valid;
      case 5: return isSection5Valid;
      case 6: return isSection6Valid;
      default: return false;
    }
  };

  const isFormValid = isSection1Valid && isSection2Valid && isSection3Valid && isSection4Valid && isSection6Valid;

  // ============================================================================
  // SUBMIT HANDLER
  // ============================================================================

  const handleSubmit = async () => {
    // Validate with Zod
    const formData = {
      title,
      description: description || undefined,
      institutionId,
      departmentId: departmentId || undefined,
      startDate,
      endDate,
      departmentGoals,
      strategicAlignment: strategicAlignment || undefined,
      parentObjectiveId,
      keyResults: keyResults.filter(kr => kr.title.trim()),
      successCriteria
    };

    const result = tier2ObjectiveSchema.safeParse(formData);

    if (!result.success) {
      const errors = result.error.errors;
      const firstError = errors[0];
      toast.error(firstError.message);
      return;
    }

    setIsSubmitting(true);

    try {
      // Create objective
      const objectiveData: CreateOKRObjectiveDTO = {
        title: title.trim(),
        description: description.trim() || undefined,
        rationale: strategicAlignment.trim() || undefined,
        tier: 'tier_2',
        level: 'department',
        parent_objective_id: parentObjectiveId,
        institution_id: institutionId,
        department_id: departmentId || undefined,
        cycle_type: 'quarterly',
        start_date: startDate,
        end_date: endDate,
        ai_integration_notes: JSON.stringify({
          department_goals: departmentGoals,
          team_members: teamMembers.filter(m => m.name.trim()),
          success_criteria: successCriteria.filter(sc => sc.description.trim()).map(sc => sc.description)
        })
      };

      const objective = await createObjective.mutateAsync(objectiveData);

      // Create key results
      for (const kr of keyResults) {
        if (kr.title.trim()) {
          const krData: CreateOKRKeyResultDTO = {
            objective_id: objective.id,
            title: kr.title.trim(),
            description: kr.description.trim() || undefined,
            start_value: kr.baselineValue,
            target_value: kr.targetValue,
            unit: kr.unit || '%',
            deadline: kr.deadline,
            data_source: kr.dataSource
          };
          await createKeyResult.mutateAsync(krData);
        }
      }

      toast.success('Department OKR created successfully!');
      router.push(`/okr/objectives/${objective.id}`);
    } catch (error) {
      console.error('Error creating objective:', error);
      toast.error('Failed to create objective');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  const goToSection = (section: number) => {
    if (section < currentSection || canProceedFromSection(currentSection)) {
      setCurrentSection(section);
    } else {
      toast.error('Please complete the current section first');
    }
  };

  const nextSection = () => {
    if (canProceedFromSection(currentSection)) {
      setCurrentSection(Math.min(currentSection + 1, 6));
    } else {
      toast.error('Please complete the required fields');
    }
  };

  const previousSection = () => {
    setCurrentSection(Math.max(currentSection - 1, 1));
  };

  // ============================================================================
  // RENDER SECTIONS
  // ============================================================================

  const sections = [
    { number: 1, title: 'Basic Info', icon: FileText, required: true },
    { number: 2, title: 'Department Goals', icon: Target, required: true },
    { number: 3, title: 'Key Results', icon: Award, required: true },
    { number: 4, title: 'Parent Alignment', icon: Link2, required: true },
    { number: 5, title: 'Team Resources', icon: UserPlus, required: false },
    { number: 6, title: 'Success Criteria', icon: CheckCircle2, required: true }
  ];

  return (
    <ContentLayout title="Create TIER 2 OKR">
      <OKRErrorBoundary>
      <div className="max-w-4xl mx-auto space-y-6">
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
              <div className="p-2 rounded-lg bg-blue-600">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <CardTitle>Create TIER 2 Department OKR</CardTitle>
                <CardDescription>
                  Quarterly department-level objective linked to institutional goals
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-blue-600 text-blue-600">
                6 Sections
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Progress Stepper */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              {sections.map((section, index) => (
                <div key={section.number} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => goToSection(section.number)}
                    className={`flex flex-col items-center gap-2 transition-all ${
                      currentSection === section.number
                        ? 'opacity-100'
                        : currentSection > section.number
                        ? 'opacity-70 hover:opacity-100'
                        : 'opacity-40'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        currentSection === section.number
                          ? 'bg-blue-600 text-white'
                          : currentSection > section.number
                          ? 'bg-green-600 text-white'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {currentSection > section.number ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <section.icon className="h-5 w-5" />
                      )}
                    </div>
                    <div className="text-xs font-medium text-center">
                      {section.title}
                      {section.required && <span className="text-destructive ml-1">*</span>}
                    </div>
                  </button>
                  {index < sections.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-2 ${
                        currentSection > section.number ? 'bg-green-600' : 'bg-muted'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Section 1: Basic Info */}
        {currentSection === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Basic Information
              </CardTitle>
              <CardDescription>Define your department objective for this quarter</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Institution *</Label>
                  <Select value={institutionId} onValueChange={setInstitutionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select institution" />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.institution_id} value={inst.institution_id}>
                          {inst.institution_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Department *</Label>
                  <Select
                    value={departmentId}
                    onValueChange={setDepartmentId}
                    disabled={!institutionId || loadingDepartments}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingDepartments ? "Loading..." : "Select department"} />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.department_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Objective Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Launch Drug Interaction Checker for Pharmacy Department"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what this department will achieve this quarter..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Quarter Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">Quarter End Date *</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
                <p className="text-blue-700 dark:text-blue-400">
                  <strong>TIER 2 OKRs</strong> are department-level objectives that run for one quarter and must link to a TIER 1 institutional objective.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 2: Department Goals */}
        {currentSection === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                Department Goals
              </CardTitle>
              <CardDescription>What does this department aim to achieve this quarter?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="departmentGoals">Primary Goals *</Label>
                <Textarea
                  id="departmentGoals"
                  placeholder="List the main goals this department wants to accomplish in this quarter..."
                  value={departmentGoals}
                  onChange={(e) => setDepartmentGoals(e.target.value)}
                  rows={5}
                />
                <p className="text-xs text-muted-foreground">
                  Be specific about what outcomes the department will deliver
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="strategicAlignment">Strategic Alignment (WHY)</Label>
                <Textarea
                  id="strategicAlignment"
                  placeholder="How does this align with institutional priorities or department strategy?"
                  value={strategicAlignment}
                  onChange={(e) => setStrategicAlignment(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 3: Key Results */}
        {currentSection === 3 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="h-5 w-5 text-blue-600" />
                    Key Results (3-5 recommended)
                  </CardTitle>
                  <CardDescription>
                    Measurable outcomes using &quot;From X to Y by Date&quot; format
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addKeyResult}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add KR
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {keyResults.map((kr, index) => (
                <div key={kr.id} className="p-4 border rounded-lg space-y-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">KR {index + 1}</Badge>
                    {keyResults.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeKeyResult(kr.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Key Result Title *</Label>
                    <Input
                      placeholder="e.g., Implement drug interaction checking in pharmacy workflow"
                      value={kr.title}
                      onChange={(e) => updateKeyResult(kr.id, 'title', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>From (Baseline)</Label>
                      <Input
                        type="number"
                        value={kr.baselineValue}
                        onChange={(e) =>
                          updateKeyResult(kr.id, 'baselineValue', parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>To (Target) *</Label>
                      <Input
                        type="number"
                        value={kr.targetValue}
                        onChange={(e) =>
                          updateKeyResult(kr.id, 'targetValue', parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <Input
                        placeholder="%"
                        value={kr.unit}
                        onChange={(e) => updateKeyResult(kr.id, 'unit', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>By Date</Label>
                      <Input
                        type="date"
                        value={kr.deadline}
                        onChange={(e) => updateKeyResult(kr.id, 'deadline', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-card rounded border text-sm">
                    <span className="text-muted-foreground">Preview: </span>
                    <span className="font-medium">{kr.title || '[Title]'}</span>
                    <span className="text-muted-foreground">
                      {' '}— From {kr.baselineValue} to {kr.targetValue} {kr.unit} by{' '}
                      {kr.deadline ? format(new Date(kr.deadline), 'MMM d, yyyy') : 'TBD'}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Section 4: Parent Alignment */}
        {currentSection === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-5 w-5 text-blue-600" />
                Parent Alignment
              </CardTitle>
              <CardDescription>
                Link to a TIER 1 institutional objective (Required for cascade)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Select Parent TIER 1 Objective *</Label>
                <Select value={parentObjectiveId} onValueChange={setParentObjectiveId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent objective..." />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingParents ? (
                      <div className="p-4 text-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                        <p className="text-sm mt-2">Loading objectives...</p>
                      </div>
                    ) : parentObjectives.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        <p className="text-sm">No active TIER 1 objectives found</p>
                        <p className="text-xs mt-1">Create a TIER 1 objective first</p>
                      </div>
                    ) : (
                      parentObjectives.map((obj) => (
                        <SelectItem key={obj.id} value={obj.id}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {obj.overall_progress}%
                            </Badge>
                            <span>{obj.title}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <Link2 className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-700 dark:text-yellow-400">
                      Why Link to Parent?
                    </p>
                    <p className="text-yellow-600 dark:text-yellow-300 mt-1">
                      Linking to a parent objective creates the OKR cascade. Your department&apos;s progress will contribute to the institutional objective&apos;s success.
                    </p>
                  </div>
                </div>
              </div>

              {parentObjectiveId && (
                <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      Linked to Parent Objective
                    </p>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-300">
                    This department OKR will cascade from the selected institutional objective
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Section 5: Team Resources */}
        {currentSection === 5 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-blue-600" />
                    Team Resources
                  </CardTitle>
                  <CardDescription>Who from the department is involved?</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addTeamMember}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Member
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {teamMembers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No team members added yet</p>
                  <p className="text-sm">Optional: Add key team members and their roles</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {teamMembers.map((member, index) => (
                    <div key={member.id} className="p-4 border rounded-lg space-y-4 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">Member {index + 1}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTeamMember(member.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            placeholder="e.g., Dr. Smith"
                            value={member.name}
                            onChange={(e) => updateTeamMember(member.id, 'name', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Role</Label>
                          <Input
                            placeholder="e.g., Lead Pharmacist"
                            value={member.role}
                            onChange={(e) => updateTeamMember(member.id, 'role', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Section 6: Success Criteria */}
        {currentSection === 6 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    Success Criteria
                  </CardTitle>
                  <CardDescription>How will we know we&apos;ve succeeded?</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addSuccessCriteria}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Criteria
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {successCriteria.map((criteria, index) => (
                <div key={criteria.id} className="p-4 border rounded-lg space-y-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">Criteria {index + 1}</Badge>
                    {successCriteria.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSuccessCriteria(criteria.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Success Indicator {index === 0 ? '*' : ''}</Label>
                    <Textarea
                      placeholder="e.g., All pharmacists trained and using the system daily"
                      value={criteria.description}
                      onChange={(e) => updateSuccessCriteria(criteria.id, e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              ))}

              <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-green-700 dark:text-green-400">
                      Good Success Criteria
                    </p>
                    <ul className="text-green-600 dark:text-green-300 mt-2 space-y-1 list-disc list-inside">
                      <li>Qualitative indicators (user feedback, adoption rate)</li>
                      <li>Process improvements (time saved, efficiency gains)</li>
                      <li>Stakeholder satisfaction (surveys, testimonials)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center">
          <div>
            {currentSection > 1 && (
              <Button variant="outline" onClick={previousSection}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {currentSection < 6 ? (
              <Button
                onClick={nextSection}
                disabled={!canProceedFromSection(currentSection)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Next Section
                <Check className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!isFormValid || isSubmitting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Create TIER 2 Objective
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Form Summary */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-blue-600">{keyResults.length}</p>
                <p className="text-sm text-muted-foreground">Key Results</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{teamMembers.length}</p>
                <p className="text-sm text-muted-foreground">Team Members</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{successCriteria.filter(sc => sc.description.trim()).length}</p>
                <p className="text-sm text-muted-foreground">Success Criteria</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
