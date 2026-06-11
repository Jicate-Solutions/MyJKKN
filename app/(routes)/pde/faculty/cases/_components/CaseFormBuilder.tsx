'use client';

// CaseFormBuilder — the canonical visual editor for a clinical_case.
// Used by both /pde/faculty/cases/new and /pde/faculty/cases/[id]/edit.
//
// Tabs: Patient Details · Questions · Domain Weights · Metadata

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type {
  CreateClinicalCaseInput,
  CreateClinicalQuestionInput,
  ClinicalCaseScenario,
  DomainWeights,
  OSCEDomain,
} from '@/types/pde';
import { DomainWeightSliders } from './DomainWeightSliders';
import { QuestionEditor } from './QuestionEditor';

interface VacCourseOption {
  id: string;
  code?: string;
  name: string;
}

interface Props {
  initialValue?: Partial<CreateClinicalCaseInput>;
  courseOptions: VacCourseOption[];
  saving?: boolean;
  saveLabel?: string;
  onSave: (value: CreateClinicalCaseInput) => Promise<void> | void;
  extraActions?: React.ReactNode;
}

const DEFAULT_WEIGHTS: DomainWeights = {
  data_gathering: 20,
  hypothesis_generation: 20,
  management_planning: 20,
  patient_communication: 20,
  professionalism: 20,
};

const EMPTY_SCENARIO: ClinicalCaseScenario = {
  patient_name: '',
  age: 0,
  gender: '',
  chief_complaint: '',
  hopi: '',
};

const NEW_QUESTION = (idx: number): CreateClinicalQuestionInput => ({
  question_type: 'free_text_socratic',
  question_text: '',
  points: 10,
  order_index: idx + 1,
  metadata: {
    q_number: idx + 1,
    osce_domain: 'data_gathering' as OSCEDomain,
    ground_truth: '',
    key_concepts: [],
  },
});

function asPercent(v: number) {
  return v <= 1 ? v * 100 : v;
}

function weightsToPercent(w: DomainWeights): DomainWeights {
  return {
    data_gathering: asPercent(w.data_gathering),
    hypothesis_generation: asPercent(w.hypothesis_generation),
    management_planning: asPercent(w.management_planning),
    patient_communication: asPercent(w.patient_communication),
    professionalism: asPercent(w.professionalism),
  };
}

export function CaseFormBuilder({
  initialValue,
  courseOptions,
  saving,
  saveLabel = 'Save',
  onSave,
  extraActions,
}: Props) {
  const [courseId, setCourseId] = useState<string>(initialValue?.course_id || '');
  const [title, setTitle] = useState<string>(initialValue?.title || '');
  const [description, setDescription] = useState<string>(initialValue?.description || '');
  const [scenario, setScenario] = useState<ClinicalCaseScenario>(
    initialValue?.case_scenario ?? EMPTY_SCENARIO
  );
  const [weights, setWeights] = useState<DomainWeights>(
    initialValue?.metadata?.domain_weights
      ? weightsToPercent(initialValue.metadata.domain_weights as DomainWeights)
      : DEFAULT_WEIGHTS
  );
  const [discipline, setDiscipline] = useState<string>(
    initialValue?.metadata?.discipline || 'oral_medicine'
  );
  const [timeLimit, setTimeLimit] = useState<number | null>(
    initialValue?.time_limit_minutes ?? null
  );
  const [passThreshold, setPassThreshold] = useState<number>(
    initialValue?.pass_threshold ?? 60
  );
  const [questions, setQuestions] = useState<CreateClinicalQuestionInput[]>(
    initialValue?.questions && initialValue.questions.length > 0
      ? initialValue.questions
      : [NEW_QUESTION(0)]
  );
  const [tab, setTab] = useState<'patient' | 'questions' | 'weights' | 'metadata'>(
    'patient'
  );
  const [error, setError] = useState<string | null>(null);

  const weightsSum = (Object.values(weights) as number[]).reduce((a, b) => a + b, 0);
  const weightsValid = Math.abs(weightsSum - 100) < 0.5;

  const setScenarioField = <K extends keyof ClinicalCaseScenario>(
    key: K,
    value: ClinicalCaseScenario[K]
  ) => setScenario((s) => ({ ...s, [key]: value }));

  const addQuestion = () =>
    setQuestions((qs) => [...qs, NEW_QUESTION(qs.length)]);

  const removeQuestion = (i: number) =>
    setQuestions((qs) => qs.filter((_q, idx) => idx !== i).map((q, idx) => ({
      ...q,
      order_index: idx + 1,
      metadata: { ...q.metadata, q_number: idx + 1 },
    })));

  const updateQuestion = (i: number, next: CreateClinicalQuestionInput) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? next : q)));

  const moveQuestion = (i: number, delta: -1 | 1) => {
    setQuestions((qs) => {
      const target = i + delta;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[target]] = [next[target], next[i]];
      return next.map((q, idx) => ({
        ...q,
        order_index: idx + 1,
        metadata: { ...q.metadata, q_number: idx + 1 },
      }));
    });
  };

  const validate = (): string | null => {
    if (!courseId) return 'Select a cohort/course.';
    if (!title.trim()) return 'Title is required.';
    if (!scenario.patient_name) return 'Patient name is required.';
    if (!scenario.chief_complaint) return 'Chief complaint is required.';
    if (!scenario.hopi) return 'History of presenting illness (HOPI) is required.';
    if (!weightsValid) return `Domain weights must sum to 100 (currently ${weightsSum.toFixed(1)}).`;
    if (questions.length === 0) return 'At least one question is required.';
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question_text.trim()) return `Q${i + 1}: question text is required.`;
      if (!q.metadata.ground_truth.trim()) return `Q${i + 1}: ground truth is required.`;
      if (q.question_type === 'mcq_warmup') {
        if (!q.options || q.options.length < 2) return `Q${i + 1}: MCQ requires at least 2 options.`;
        if (!q.options.some((o) => o.is_correct)) return `Q${i + 1}: mark one option as correct.`;
      }
      if (q.question_type === 'image_tag') {
        if (!q.question_media_url) return `Q${i + 1}: image URL is required for image-tag.`;
        if (!q.expected_regions || q.expected_regions.length === 0) {
          return `Q${i + 1}: draw at least one region on the image.`;
        }
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    await onSave({
      course_id: courseId,
      title: title.trim(),
      description: description.trim() || undefined,
      case_scenario: scenario,
      metadata: {
        domain_weights: weights,
        discipline: discipline || undefined,
      },
      time_limit_minutes: timeLimit ?? undefined,
      pass_threshold: passThreshold,
      questions,
    });
  };

  // External callers (e.g. JSON import) can drive the entire state by passing
  // a new initialValue — but here we expose a helper as well to keep the API
  // clean. Currently this is unused; left for future.

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="patient">Patient Details</TabsTrigger>
              <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
              <TabsTrigger value="weights">
                Weights {weightsValid ? '✓' : '⚠'}
              </TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            </TabsList>

            {/* Patient Details */}
            <TabsContent value="patient" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cohort / Course</Label>
                  <Select value={courseId} onValueChange={setCourseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cohort…" />
                    </SelectTrigger>
                    <SelectContent>
                      {courseOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code ? `${c.code} — ${c.name}` : c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Case Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Oral Lichen Planus — Mrs. Lalitha, 52F"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Description (faculty notes)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Patient Name</Label>
                  <Input
                    value={scenario.patient_name}
                    onChange={(e) => setScenarioField('patient_name', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Age</Label>
                  <Input
                    type="number"
                    min={0}
                    value={scenario.age || ''}
                    onChange={(e) =>
                      setScenarioField('age', Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Gender</Label>
                  <Input
                    value={scenario.gender}
                    onChange={(e) => setScenarioField('gender', e.target.value)}
                    placeholder="Female / Male / Other"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Occupation (optional)</Label>
                <Input
                  value={scenario.occupation || ''}
                  onChange={(e) => setScenarioField('occupation', e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs">Chief Complaint</Label>
                <Textarea
                  value={scenario.chief_complaint}
                  onChange={(e) => setScenarioField('chief_complaint', e.target.value)}
                  rows={2}
                />
              </div>

              <div>
                <Label className="text-xs">History of Presenting Illness (HOPI)</Label>
                <Textarea
                  value={scenario.hopi}
                  onChange={(e) => setScenarioField('hopi', e.target.value)}
                  rows={4}
                />
              </div>

              <div>
                <Label className="text-xs">Medical History</Label>
                <Textarea
                  value={scenario.medical_history || ''}
                  onChange={(e) =>
                    setScenarioField('medical_history', e.target.value)
                  }
                  rows={3}
                />
              </div>

              <div>
                <Label className="text-xs">Additional Clinical Details</Label>
                <Textarea
                  value={scenario.additional_clinical_details || ''}
                  onChange={(e) =>
                    setScenarioField('additional_clinical_details', e.target.value)
                  }
                  rows={3}
                />
              </div>

              <div>
                <Label className="text-xs">Optional patient image URL</Label>
                <Input
                  value={scenario.image_url || ''}
                  onChange={(e) => setScenarioField('image_url', e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </TabsContent>

            {/* Questions */}
            <TabsContent value="questions" className="space-y-3">
              {questions.map((q, i) => (
                <QuestionEditor
                  key={i}
                  index={i}
                  total={questions.length}
                  question={q}
                  onChange={(next) => updateQuestion(i, next)}
                  onRemove={() => removeQuestion(i)}
                  onMove={(delta) => moveQuestion(i, delta)}
                />
              ))}
              <Button variant="outline" onClick={addQuestion} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add another question
              </Button>
            </TabsContent>

            {/* Domain Weights */}
            <TabsContent value="weights">
              <DomainWeightSliders value={weights} onChange={setWeights} />
              {weightsValid ? (
                <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Weights valid (sum = 100).
                </p>
              ) : null}
            </TabsContent>

            {/* Metadata */}
            <TabsContent value="metadata" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Discipline</Label>
                  <Input
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    placeholder="e.g. oral_medicine"
                  />
                </div>
                <div>
                  <Label className="text-xs">Time limit (minutes, optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={timeLimit ?? ''}
                    onChange={(e) =>
                      setTimeLimit(e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Pass threshold (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={passThreshold}
                    onChange={(e) => setPassThreshold(Number(e.target.value) || 60)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Capability slug is locked to <code>clinical_reasoning</code> (set at substrate
                level). Faculty cannot author cases against other capabilities from this UI.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex justify-between gap-3">
        <div>{extraActions}</div>
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
        >
          {saving ? 'Saving…' : saveLabel}
        </Button>
      </div>
    </div>
  );
}
