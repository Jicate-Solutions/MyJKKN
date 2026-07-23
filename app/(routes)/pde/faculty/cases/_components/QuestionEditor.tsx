'use client';

// QuestionEditor — edit a single clinical-case question.
// Supports the 3 clinical Q types: free_text_socratic, mcq_warmup, image_tag.

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import type {
  CreateClinicalQuestionInput,
  ClinicalQuestionType,
  OSCEDomain,
  MCQOption,
  ImageTagRegion,
} from '@/types/pde';
import { ImageTagRegionAuthor } from './ImageTagRegionAuthor';

const TYPE_LABELS: Record<ClinicalQuestionType, string> = {
  free_text_socratic: 'Free-text (Socratic)',
  mcq_warmup: 'MCQ Warm-up',
  image_tag: 'Image Tag (Click Region)',
};

const DOMAIN_OPTIONS: { key: OSCEDomain; label: string }[] = [
  { key: 'data_gathering', label: 'Data Gathering' },
  { key: 'hypothesis_generation', label: 'Hypothesis Generation' },
  { key: 'management_planning', label: 'Management Planning' },
  { key: 'patient_communication', label: 'Patient Communication' },
  { key: 'professionalism', label: 'Professionalism' },
];

interface Props {
  index: number;
  total: number;
  question: CreateClinicalQuestionInput;
  onChange: (next: CreateClinicalQuestionInput) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}

export function QuestionEditor({ index, total, question, onChange, onRemove, onMove }: Props) {
  const setMetadata = (patch: Partial<typeof question.metadata>) => {
    onChange({ ...question, metadata: { ...question.metadata, ...patch } });
  };

  const addOption = () => {
    const next: MCQOption[] = [...(question.options || []), { text: '', is_correct: false }];
    onChange({ ...question, options: next });
  };

  const removeOption = (i: number) => {
    const next = [...(question.options || [])];
    next.splice(i, 1);
    onChange({ ...question, options: next });
  };

  const updateOption = (i: number, patch: Partial<MCQOption>) => {
    const next = [...(question.options || [])];
    next[i] = { ...next[i], ...patch };
    onChange({ ...question, options: next });
  };

  const updateKeyConcepts = (raw: string) => {
    const arr = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    setMetadata({ key_concepts: arr });
  };

  return (
    <div className="border rounded-md p-4 bg-card">
      <div className="flex justify-between items-start mb-3 gap-3">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline">Q{question.metadata.q_number || index + 1}</Badge>
          <span className="text-sm text-muted-foreground">{TYPE_LABELS[question.question_type]}</span>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title="Move up"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            title="Move down"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onRemove}
            title="Remove question"
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <Label className="text-xs">Question Type</Label>
          <Select
            value={question.question_type}
            onValueChange={(v) =>
              onChange({ ...question, question_type: v as ClinicalQuestionType })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free_text_socratic">Free-text (Socratic)</SelectItem>
              <SelectItem value="mcq_warmup">MCQ Warm-up</SelectItem>
              <SelectItem value="image_tag">Image Tag (Click Region)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">OSCE Domain</Label>
          <Select
            value={question.metadata.osce_domain}
            onValueChange={(v) => setMetadata({ osce_domain: v as OSCEDomain })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOMAIN_OPTIONS.map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-3">
        <Label className="text-xs">Question Text</Label>
        <Textarea
          value={question.question_text}
          onChange={(e) => onChange({ ...question, question_text: e.target.value })}
          placeholder="e.g. Describe the lesion (Site, Size, Shape, Colour, Surface texture, Margins, Extension)."
          rows={2}
        />
      </div>

      {/* MCQ-specific */}
      {question.question_type === 'mcq_warmup' ? (
        <div className="mb-3 border rounded p-3 bg-muted/30">
          <div className="flex justify-between items-center mb-2">
            <Label className="text-xs">Options</Label>
            <Button type="button" size="sm" variant="outline" onClick={addOption}>
              Add option
            </Button>
          </div>
          {(question.options || []).map((opt, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <input
                type="radio"
                name={`q${index}-correct`}
                checked={opt.is_correct}
                onChange={() => {
                  const next = (question.options || []).map((o, j) => ({
                    ...o,
                    is_correct: j === i,
                  }));
                  onChange({ ...question, options: next });
                }}
              />
              <Input
                value={opt.text}
                onChange={(e) => updateOption(i, { text: e.target.value })}
                placeholder={`Option ${i + 1}`}
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeOption(i)}
                className="text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {(question.options || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No options yet — add at least 2.</p>
          ) : null}
        </div>
      ) : null}

      {/* Image-tag specific */}
      {question.question_type === 'image_tag' ? (
        <div className="mb-3 space-y-2">
          <Label className="text-xs">Image URL</Label>
          <Input
            value={question.question_media_url || ''}
            onChange={(e) => onChange({ ...question, question_media_url: e.target.value })}
            placeholder="https://... (uploaded image URL)"
          />
          <ImageTagRegionAuthor
            imageUrl={question.question_media_url || ''}
            regions={question.expected_regions || []}
            onChange={(regions: ImageTagRegion[]) =>
              onChange({ ...question, expected_regions: regions })
            }
          />
        </div>
      ) : null}

      {/* Ground truth + key concepts (shared across all types) */}
      <div className="mb-3">
        <Label className="text-xs">Ground Truth (model answer used by AI coach)</Label>
        <Textarea
          value={question.metadata.ground_truth}
          onChange={(e) => setMetadata({ ground_truth: e.target.value })}
          placeholder="Complete expert answer — used by AI to evaluate learner responses Socratically."
          rows={4}
        />
      </div>

      <div className="mb-3">
        <Label className="text-xs">
          Key Concepts (one per line — AI scaffolds toward these)
        </Label>
        <Textarea
          value={(question.metadata.key_concepts || []).join('\n')}
          onChange={(e) => updateKeyConcepts(e.target.value)}
          placeholder={'Wickham striae\nBilateral symmetric distribution\nReticular pattern'}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Q Number</Label>
          <Input
            type="number"
            min={1}
            value={question.metadata.q_number || index + 1}
            onChange={(e) => setMetadata({ q_number: Number(e.target.value) || index + 1 })}
          />
        </div>
        <div>
          <Label className="text-xs">Points</Label>
          <Input
            type="number"
            min={1}
            value={question.points ?? 10}
            onChange={(e) => onChange({ ...question, points: Number(e.target.value) || 10 })}
          />
        </div>
      </div>
    </div>
  );
}
