'use client';

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../../_components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { z } from 'zod';
import { format, addMonths, addQuarters, addYears } from 'date-fns';
import {
  ArrowLeft,
  Target,
  Calendar,
  Building2,
  Users,
  User,
  FileText,
  Lightbulb,
  Loader2,
  Check,
  Plus,
  Trash2,
  AlertTriangle,
  Link2,
  ClipboardList,
  Shield,
  Sparkles,
  ChevronRight,
  Info
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useCreateObjective, useAvailableParentObjectives } from '@/hooks/okr/use-objectives';
import { useCreateKeyResult } from '@/hooks/okr/use-key-results';
import type {
  OKRTier,
  OKRLevel,
  OKRCycleType,
  CreateOKRObjectiveDTO,
  CreateOKRKeyResultDTO,
  CreateOKRDependencyDTO,
  CreateOKRTaskDTO,
  CreateOKRRiskDTO,
  RiskLevel
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

interface DependencyForm {
  id: string;
  description: string;
  ownerType: 'user' | 'department';
  ownerId: string;
  requiredByDate: string;
}

interface TaskForm {
  id: string;
  title: string;
  description: string;
  deadline: string;
  responsibleId: string;
  accountableId: string;
  keyResultId: string;
}

interface RiskForm {
  id: string;
  description: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  mitigationStrategy: string;
  ownerId: string;
}

// ============================================================================
// ZOD VALIDATION SCHEMA
// ============================================================================

const objectiveKeyResultSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Key result title is required').max(200),
  description: z.string().max(500).optional(),
  baselineValue: z.coerce.number().min(0),
  targetValue: z.coerce.number().min(1, 'Target value must be at least 1'),
  unit: z.string().max(50),
  deadline: z.string().min(1),
  dataSource: z.enum(['manual', 'auto'])
});

const createObjectiveSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().max(2000).optional(),
  rationale: z.string().max(1000).optional(),
  institutionId: z.string().min(1, 'Institution is required'),
  tier: z.enum(['tier_1', 'tier_2', 'tier_3']),
  level: z.enum(['institution', 'department', 'individual']),
  cycleType: z.enum(['annual', 'quarterly', 'semester']),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  keyResults: z.array(objectiveKeyResultSchema).min(1, 'At least one key result is required')
});

type CreateObjectiveFormData = z.infer<typeof createObjectiveSchema>;

// ============================================================================
// TIER CONFIGURATIONS
// ============================================================================

const TIER_CONFIG: Record<OKRTier, { label: string; description: string; color: string; sections: string[]; examples: string[] }> = {
  tier_1: {
    label: 'Full (11 Sections)',
    description: 'For major initiatives with multiple stakeholders',
    color: '#0b6d41',
    sections: ['objective', 'keyResults', 'dependencies', 'tasks', 'risks', 'aiIntegration'],
    examples: ['Mission 500', '100% MyJKKN Adoption', 'New Hospital Project']
  },
  tier_2: {
    label: 'Core (6 Sections)',
    description: 'For department-level initiatives',
    color: '#2563eb',
    sections: ['objective', 'keyResults', 'dependencies'],
    examples: ['Pharmacy Drug Checker', 'Course Curriculum Revision']
  },
  tier_3: {
    label: 'Simple (3 Sections)',
    description: 'For individual goals',
    color: '#7c3aed',
    sections: ['objective', 'keyResults'],
    examples: ['Personal Growth Plan', 'Skill Development']
  }
};

const LEVEL_CONFIG = {
  institution: { label: 'Institution', icon: Building2, description: 'Organization-wide OKR' },
  department: { label: 'Department', icon: Users, description: 'Department-level OKR' },
  individual: { label: 'Individual', icon: User, description: 'Personal OKR' }
};

const CYCLE_CONFIG = {
  annual: { label: 'Annual', duration: 12 },
  quarterly: { label: 'Quarterly', duration: 3 },
  semester: { label: 'Semester', duration: 6 }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function getEndDate(startDate: string, cycleType: OKRCycleType): string {
  const start = new Date(startDate);
  switch (cycleType) {
    case 'annual':
      return format(addYears(start, 1), 'yyyy-MM-dd');
    case 'quarterly':
      return format(addQuarters(start, 1), 'yyyy-MM-dd');
    case 'semester':
      return format(addMonths(start, 6), 'yyyy-MM-dd');
    default:
      return format(addMonths(start, 3), 'yyyy-MM-dd');
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CreateObjectivePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { institutions } = useUserInstitutionAccess();
  const createObjective = useCreateObjective();
  const createKeyResult = useCreateKeyResult();

  // Step state
  const [activeTab, setActiveTab] = useState('basics');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Basic info
  const [tier, setTier] = useState<OKRTier>('tier_2');
  const [level, setLevel] = useState<OKRLevel>('department');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rationale, setRationale] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [cycleType, setCycleType] = useState<OKRCycleType>('quarterly');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(getEndDate(format(new Date(), 'yyyy-MM-dd'), 'quarterly'));
  const [aiIntegrationNotes, setAiIntegrationNotes] = useState('');
  const [parentObjectiveId, setParentObjectiveId] = useState('');

  // Fetch available parent objectives based on level
  const parentLevel = level === 'department' ? 'department' : level === 'individual' ? 'individual' : null;
  const { data: parentObjectives = [], isLoading: loadingParents } = useAvailableParentObjectives(
    institutionId,
    parentLevel as 'department' | 'individual'
  );

  // Key Results
  const [keyResults, setKeyResults] = useState<KeyResultForm[]>([
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

  // Dependencies (TIER 1 & 2)
  const [dependencies, setDependencies] = useState<DependencyForm[]>([]);

  // Tasks with RACI (TIER 1)
  const [tasks, setTasks] = useState<TaskForm[]>([]);

  // Risks (TIER 1)
  const [risks, setRisks] = useState<RiskForm[]>([]);

  // Update end date when cycle type or start date changes
  useEffect(() => {
    setEndDate(getEndDate(startDate, cycleType));
  }, [startDate, cycleType]);

  // Set default institution
  useEffect(() => {
    if (institutions.length > 0 && !institutionId) {
      setInstitutionId(institutions[0].institution_id);
    }
  }, [institutions, institutionId]);

  // Reset parent objective when level or institution changes
  useEffect(() => {
    setParentObjectiveId('');
  }, [level, institutionId]);

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
  // DEPENDENCIES HANDLERS
  // ============================================================================

  const addDependency = () => {
    setDependencies([
      ...dependencies,
      {
        id: generateId(),
        description: '',
        ownerType: 'department',
        ownerId: '',
        requiredByDate: endDate
      }
    ]);
  };

  const updateDependency = (id: string, field: keyof DependencyForm, value: unknown) => {
    setDependencies(
      dependencies.map((dep) => (dep.id === id ? { ...dep, [field]: value } : dep))
    );
  };

  const removeDependency = (id: string) => {
    setDependencies(dependencies.filter((dep) => dep.id !== id));
  };

  // ============================================================================
  // TASKS HANDLERS
  // ============================================================================

  const addTask = () => {
    setTasks([
      ...tasks,
      {
        id: generateId(),
        title: '',
        description: '',
        deadline: endDate,
        responsibleId: '',
        accountableId: '',
        keyResultId: ''
      }
    ]);
  };

  const updateTask = (id: string, field: keyof TaskForm, value: unknown) => {
    setTasks(tasks.map((task) => (task.id === id ? { ...task, [field]: value } : task)));
  };

  const removeTask = (id: string) => {
    setTasks(tasks.filter((task) => task.id !== id));
  };

  // ============================================================================
  // RISKS HANDLERS
  // ============================================================================

  const addRisk = () => {
    setRisks([
      ...risks,
      {
        id: generateId(),
        description: '',
        likelihood: 'medium',
        impact: 'medium',
        mitigationStrategy: '',
        ownerId: ''
      }
    ]);
  };

  const updateRisk = (id: string, field: keyof RiskForm, value: unknown) => {
    setRisks(risks.map((risk) => (risk.id === id ? { ...risk, [field]: value } : risk)));
  };

  const removeRisk = (id: string) => {
    setRisks(risks.filter((risk) => risk.id !== id));
  };

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const isBasicsValid = title.trim() && institutionId && startDate && endDate;
  // Parent objective is required for department and individual levels
  const isParentValid = level === 'institution' || (parentObjectiveId !== '');
  const isKeyResultsValid = keyResults.every(
    (kr) => kr.title.trim() && kr.targetValue > 0
  );
  const isFormValid = isBasicsValid && isParentValid && isKeyResultsValid;

  // ============================================================================
  // SUBMIT HANDLER
  // ============================================================================

  const handleSubmit = async () => {
    console.log('[OKR-CREATE] handleSubmit called');
    console.log('[OKR-CREATE] Form state:', { title, institutionId, tier, level, startDate, endDate, parentObjectiveId });
    console.log('[OKR-CREATE] Key Results:', keyResults);
    console.log('[OKR-CREATE] Validation:', { isBasicsValid, isParentValid, isKeyResultsValid, isFormValid });

    // Validate with Zod
    // Explicitly convert number fields to ensure proper types (fixes "Expected number, received string" error)
    const formData = {
      title,
      description: description || undefined,
      rationale: rationale || undefined,
      institutionId,
      tier,
      level,
      cycleType,
      startDate,
      endDate,
      keyResults: keyResults.filter(kr => kr.title.trim()).map(kr => ({
        ...kr,
        baselineValue: Number(kr.baselineValue) || 0,
        targetValue: Number(kr.targetValue) || 0
      }))
    };

    console.log('[OKR-CREATE] FormData for validation:', JSON.stringify(formData, null, 2));
    const result = createObjectiveSchema.safeParse(formData);

    if (!result.success) {
      const errors = result.error.errors;
      console.log('[OKR-CREATE] Zod validation errors:', JSON.stringify(errors, null, 2));
      const firstError = errors[0];
      const errorPath = firstError.path.join('.');
      toast.error(`${errorPath ? `[${errorPath}] ` : ''}${firstError.message}`);
      return;
    }

    setIsSubmitting(true);

    try {
      // Create objective
      const objectiveData: CreateOKRObjectiveDTO = {
        title: title.trim(),
        description: description.trim() || undefined,
        rationale: rationale.trim() || undefined,
        tier,
        level,
        parent_objective_id: (level === 'department' || level === 'individual') ? parentObjectiveId || undefined : undefined,
        institution_id: institutionId,
        department_id: departmentId || undefined,
        cycle_type: cycleType,
        start_date: startDate,
        end_date: endDate,
        ai_integration_notes: tier === 'tier_1' ? aiIntegrationNotes.trim() || undefined : undefined
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

      toast.success('Objective created successfully!');
      router.push(`/okr/objectives/${objective.id}`);
    } catch (error) {
      console.error('Error creating objective:', error);
      toast.error('Failed to create objective');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const tierConfig = TIER_CONFIG[tier];
  const showDependencies = tier === 'tier_1' || tier === 'tier_2';
  const showTasks = tier === 'tier_1';
  const showRisks = tier === 'tier_1';
  const showAiIntegration = tier === 'tier_1';

  return (
    <ContentLayout title="Create Objective">
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
              <div className="p-2 rounded-lg" style={{ backgroundColor: tierConfig.color }}>
                <Target className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <CardTitle>Create New Objective</CardTitle>
                <CardDescription>
                  Define your objective with key results, dependencies, and action plan
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                style={{ borderColor: tierConfig.color, color: tierConfig.color }}
              >
                {tierConfig.label}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Tier Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Select OKR Tier
            </CardTitle>
            <CardDescription>Choose based on scope and complexity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {(Object.entries(TIER_CONFIG) as [OKRTier, typeof TIER_CONFIG['tier_1']][]).map(
                ([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTier(key)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      tier === key
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full mb-2"
                      style={{ backgroundColor: config.color }}
                    />
                    <div className="font-medium">{config.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {config.description}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      e.g., {config.examples[0]}
                    </div>
                  </button>
                )
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Form Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basics" className="gap-1">
              <FileText className="h-3 w-3" />
              Basics
            </TabsTrigger>
            <TabsTrigger value="keyResults" className="gap-1">
              <Target className="h-3 w-3" />
              Key Results
            </TabsTrigger>
            {showDependencies && (
              <TabsTrigger value="dependencies" className="gap-1">
                <Link2 className="h-3 w-3" />
                Dependencies
              </TabsTrigger>
            )}
            {showTasks && (
              <TabsTrigger value="tasks" className="gap-1">
                <ClipboardList className="h-3 w-3" />
                Tasks
              </TabsTrigger>
            )}
            {showRisks && (
              <TabsTrigger value="risks" className="gap-1">
                <Shield className="h-3 w-3" />
                Risks
              </TabsTrigger>
            )}
          </TabsList>

          {/* BASICS TAB */}
          <TabsContent value="basics" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Objective & Rationale</CardTitle>
                <CardDescription>Define what you want to achieve and why</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Level & Institution */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Level</Label>
                    <Select value={level} onValueChange={(v) => setLevel(v as OKRLevel)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LEVEL_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <config.icon className="h-4 w-4" />
                              {config.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">
                    Objective Title *
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g., Achieve 500 daily OPD visits at Dental Hospital"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-lg"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what success looks like..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Rationale (WHY) */}
                <div className="space-y-2">
                  <Label htmlFor="rationale">
                    Strategic Rationale (WHY)
                  </Label>
                  <Textarea
                    id="rationale"
                    placeholder="Why is this objective important? How does it align with institutional goals?"
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Connect to vision, strategic priorities, or stakeholder needs
                  </p>
                </div>

                <Separator />

                {/* Cycle & Dates */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Cycle</Label>
                    <Select
                      value={cycleType}
                      onValueChange={(v) => setCycleType(v as OKRCycleType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CYCLE_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Parent Objective Link (Department and Individual levels) */}
                {(level === 'department' || level === 'individual') && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-blue-500" />
                        Linked to Parent Objective *
                      </Label>
                      <Select value={parentObjectiveId} onValueChange={setParentObjectiveId}>
                        <SelectTrigger>
                          <SelectValue placeholder={`Select parent ${level === 'department' ? 'institution' : 'department'} objective...`} />
                        </SelectTrigger>
                        <SelectContent>
                          {loadingParents ? (
                            <div className="p-4 text-center text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                              <p className="text-sm mt-2">Loading objectives...</p>
                            </div>
                          ) : parentObjectives.length === 0 ? (
                            <div className="p-4 text-center text-muted-foreground">
                              <p className="text-sm">No active parent objectives found</p>
                              <p className="text-xs mt-1">
                                {level === 'department'
                                  ? 'Create a TIER 1 institution objective first'
                                  : 'Create a department-level objective first'}
                              </p>
                            </div>
                          ) : (
                            parentObjectives.map((obj) => (
                              <SelectItem key={obj.id} value={obj.id}>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {obj.overall_progress || 0}%
                                  </Badge>
                                  <span>{obj.title}</span>
                                  <span className="text-xs text-muted-foreground ml-1">
                                    ({obj.level})
                                  </span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
                        <p className="text-blue-700 dark:text-blue-400">
                          {level === 'department'
                            ? <><strong>Department OKRs</strong> must link to an institution-level TIER 1 objective for proper cascading.</>
                            : <><strong>Individual OKRs</strong> should link to a department or institution-level objective for alignment.</>
                          }
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* AI Integration (TIER 1 only) */}
                {showAiIntegration && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Label htmlFor="aiIntegration" className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-500" />
                        AI Integration Notes (Optional)
                      </Label>
                      <Textarea
                        id="aiIntegration"
                        placeholder="How will AI tools assist in achieving this objective?"
                        value={aiIntegrationNotes}
                        onChange={(e) => setAiIntegrationNotes(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end mt-4">
              <Button onClick={() => setActiveTab('keyResults')}>
                Next: Key Results
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </TabsContent>

          {/* KEY RESULTS TAB */}
          <TabsContent value="keyResults" className="mt-6 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Key Results (WHAT)</CardTitle>
                    <CardDescription>
                      Measurable outcomes using "From X to Y by Date" format
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
                  <div
                    key={kr.id}
                    className="p-4 border rounded-lg space-y-4 bg-muted/30"
                  >
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
                        placeholder="e.g., Increase daily OPD from 250 to 500"
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

            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={() => setActiveTab('basics')}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              {showDependencies ? (
                <Button onClick={() => setActiveTab('dependencies')}>
                  Next: Dependencies
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!isFormValid || isSubmitting}
                  style={{ backgroundColor: isFormValid ? '#0b6d41' : undefined }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Create Objective
                    </>
                  )}
                </Button>
              )}
            </div>
          </TabsContent>

          {/* DEPENDENCIES TAB */}
          {showDependencies && (
            <TabsContent value="dependencies" className="mt-6 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Dependencies</CardTitle>
                      <CardDescription>
                        What do you need from others to succeed?
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={addDependency}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Dependency
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {dependencies.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No dependencies added yet</p>
                      <p className="text-sm">Dependencies help surface cross-team needs early</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {dependencies.map((dep, index) => (
                        <div key={dep.id} className="p-4 border rounded-lg space-y-4 bg-muted/30">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">Dependency {index + 1}</Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeDependency(dep.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <Label>What do you need?</Label>
                            <Textarea
                              placeholder="e.g., Marketing team to deliver campaign materials"
                              value={dep.description}
                              onChange={(e) =>
                                updateDependency(dep.id, 'description', e.target.value)
                              }
                              rows={2}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Required By</Label>
                              <Input
                                type="date"
                                value={dep.requiredByDate}
                                onChange={(e) =>
                                  updateDependency(dep.id, 'requiredByDate', e.target.value)
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setActiveTab('keyResults')}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                {showTasks ? (
                  <Button onClick={() => setActiveTab('tasks')}>
                    Next: Tasks
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={!isFormValid || isSubmitting}
                    style={{ backgroundColor: isFormValid ? '#0b6d41' : undefined }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Create Objective
                      </>
                    )}
                  </Button>
                )}
              </div>
            </TabsContent>
          )}

          {/* TASKS TAB (TIER 1 only) */}
          {showTasks && (
            <TabsContent value="tasks" className="mt-6 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Tasks with RACI</CardTitle>
                      <CardDescription>
                        Break down work with clear accountability
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={addTask}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Task
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-700 dark:text-blue-400">RACI Matrix</p>
                        <p className="text-blue-600 dark:text-blue-300">
                          <strong>R</strong>esponsible (does the work) • <strong>A</strong>ccountable (approves) •
                          <strong>C</strong>onsulted (input before) • <strong>I</strong>nformed (told after)
                        </p>
                      </div>
                    </div>
                  </div>

                  {tasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No tasks added yet</p>
                      <p className="text-sm">Tasks can be added after creating the objective</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tasks.map((task, index) => (
                        <div key={task.id} className="p-4 border rounded-lg space-y-4 bg-muted/30">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">Task {index + 1}</Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeTask(task.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <Label>Task Title</Label>
                            <Input
                              placeholder="e.g., Develop marketing campaign"
                              value={task.title}
                              onChange={(e) => updateTask(task.id, 'title', e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Deadline</Label>
                              <Input
                                type="date"
                                value={task.deadline}
                                onChange={(e) => updateTask(task.id, 'deadline', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setActiveTab('dependencies')}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                {showRisks ? (
                  <Button onClick={() => setActiveTab('risks')}>
                    Next: Risks
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={!isFormValid || isSubmitting}
                    style={{ backgroundColor: isFormValid ? '#0b6d41' : undefined }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Create Objective
                      </>
                    )}
                  </Button>
                )}
              </div>
            </TabsContent>
          )}

          {/* RISKS TAB (TIER 1 only) */}
          {showRisks && (
            <TabsContent value="risks" className="mt-6 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Risks & Mitigation</CardTitle>
                      <CardDescription>
                        Identify potential blockers and how to prevent them
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={addRisk}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Risk
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {risks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No risks identified yet</p>
                      <p className="text-sm">Risks can be added after creating the objective</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {risks.map((risk, index) => (
                        <div key={risk.id} className="p-4 border rounded-lg space-y-4 bg-muted/30">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">Risk {index + 1}</Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRisk(risk.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <Label>Risk Description</Label>
                            <Textarea
                              placeholder="e.g., Key staff may leave during project"
                              value={risk.description}
                              onChange={(e) => updateRisk(risk.id, 'description', e.target.value)}
                              rows={2}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Likelihood</Label>
                              <Select
                                value={risk.likelihood}
                                onValueChange={(v) =>
                                  updateRisk(risk.id, 'likelihood', v as RiskLevel)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="low">Low</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="high">High</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Impact</Label>
                              <Select
                                value={risk.impact}
                                onValueChange={(v) => updateRisk(risk.id, 'impact', v as RiskLevel)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="low">Low</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="high">High</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Mitigation Strategy</Label>
                            <Textarea
                              placeholder="How will you prevent or handle this risk?"
                              value={risk.mitigationStrategy}
                              onChange={(e) =>
                                updateRisk(risk.id, 'mitigationStrategy', e.target.value)
                              }
                              rows={2}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setActiveTab('tasks')}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!isFormValid || isSubmitting}
                  style={{ backgroundColor: isFormValid ? '#0b6d41' : undefined }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Create Objective
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
