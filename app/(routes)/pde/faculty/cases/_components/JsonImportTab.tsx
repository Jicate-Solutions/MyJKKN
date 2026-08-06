'use client';

// JsonImportTab — paste-import a clinical case from raw JSON.
// Schema mirrors the form-builder shape: { title, description?, course_id, case_scenario, metadata: {domain_weights}, time_limit_minutes?, pass_threshold?, questions:[...] }

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import type { CreateClinicalCaseInput } from '@/types/pde';

interface Props {
  onApply: (parsed: Partial<CreateClinicalCaseInput>) => void;
}

const SAMPLE: Partial<CreateClinicalCaseInput> = {
  title: 'Oral Lichen Planus — Mrs. Lalitha, 52F',
  description: 'Reticular OLP case for clinical reasoning practice.',
  case_scenario: {
    patient_name: 'Mrs. Lalitha',
    age: 52,
    gender: 'Female',
    chief_complaint: 'Burning sensation in both cheeks while eating spicy food since 3 months.',
    hopi: 'Insidious onset 3 months ago. Burning intermittent, worsens with spicy/citrus food.',
    medical_history: 'Hypertensive for 4 years on Amlodipine 5 mg OD.',
  },
  metadata: {
    domain_weights: {
      data_gathering: 20,
      hypothesis_generation: 30,
      management_planning: 20,
      patient_communication: 15,
      professionalism: 15,
    },
  },
  pass_threshold: 60,
  questions: [
    {
      question_type: 'free_text_socratic',
      question_text: 'Describe the lesion (SSSSCSME).',
      metadata: {
        q_number: 1,
        osce_domain: 'data_gathering',
        ground_truth: '<expert answer>',
        key_concepts: ['Bilateral', 'Wickham striae'],
      },
      points: 10,
    },
  ],
};

function shapeError(parsed: any): string | null {
  if (!parsed || typeof parsed !== 'object') return 'Root must be an object.';
  if (!parsed.title) return 'title required.';
  if (!parsed.case_scenario || typeof parsed.case_scenario !== 'object') return 'case_scenario required.';
  if (!parsed.case_scenario.patient_name) return 'case_scenario.patient_name required.';
  if (!parsed.case_scenario.chief_complaint) return 'case_scenario.chief_complaint required.';
  if (!parsed.metadata?.domain_weights) return 'metadata.domain_weights required.';
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) return 'questions array required (≥1).';
  for (let i = 0; i < parsed.questions.length; i++) {
    const q = parsed.questions[i];
    if (!q.question_text) return `questions[${i}].question_text required.`;
    if (!q.question_type) return `questions[${i}].question_type required.`;
    if (!['free_text_socratic', 'mcq_warmup', 'image_tag'].includes(q.question_type)) {
      return `questions[${i}].question_type invalid.`;
    }
    if (!q.metadata?.osce_domain) return `questions[${i}].metadata.osce_domain required.`;
    if (!q.metadata?.ground_truth) return `questions[${i}].metadata.ground_truth required.`;
  }
  return null;
}

export function JsonImportTab({ onApply }: Props) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const handleParse = () => {
    setError(null);
    setOk(false);
    try {
      const parsed = JSON.parse(raw);
      const err = shapeError(parsed);
      if (err) {
        setError(err);
        return;
      }
      onApply(parsed);
      setOk(true);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">
          Paste a JSON case here. Validation runs before populating the form builder.
        </Label>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={JSON.stringify(SAMPLE, null, 2)}
          rows={18}
          className="font-mono text-xs"
        />
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setRaw(JSON.stringify(SAMPLE, null, 2))}
        >
          Insert sample
        </Button>
        <Button type="button" onClick={handleParse} className="bg-[#0b6d41] hover:bg-[#0b6d41]/90">
          Validate &amp; Import
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {ok ? (
        <Alert>
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">
            JSON imported. Switch to the form-builder tab to review and save.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
