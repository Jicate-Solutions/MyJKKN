'use client';

// DraftFromNotesTab — the third authoring path: paste the department's OWN
// case-sheet headings plus raw source notes, and let the ₹0 AI Max lane draft a
// case in the same shape the PMS path produces. The assembled draft is handed to
// the form builder (onApply) for REVIEW — nothing is saved until the Senior
// Learner clicks "Save as draft".
//
// Unlike the PMS path, what is pasted here has NOT been de-identified by any
// system, so the identifier warning and the author's confirmation are required
// before drafting can start.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, ShieldAlert, Sparkles, BookOpen, ListOrdered } from 'lucide-react';
import type { CreateClinicalCaseInput, CreateClinicalQuestionInput } from '@/types/pde';

interface DraftPart {
  part_number: number;
  part_title: string;
  scenario_update: string;
  questions: CreateClinicalQuestionInput[];
}

interface Props {
  onApply: (parsed: Partial<CreateClinicalCaseInput>) => void;
}

// An EXAMPLE only — every department writes its own headings, and this one is
// replaced the moment the author pastes hers. Nothing downstream reads it.
const EXAMPLE_TEMPLATE = `Patient Demographics & Chief Complaint
History of Present Illness
Relevant Past & Family History
General & Systemic Physical Examination
Baseline & Confirmatory Investigations
Clinical Course`;

const MAX_TEMPLATE_CHARS = 4000;
const MAX_NOTES_CHARS = 40000;
const MIN_NOTES_CHARS = 120;

function partsOutline(parts: DraftPart[]): string {
  return parts
    .map(
      (p) =>
        `## Part ${p.part_number} — ${p.part_title}\n\n${p.scenario_update}\n\n` +
        p.questions.map((q, i) => `${i + 1}. ${q.question_text}`).join('\n')
    )
    .join('\n\n---\n\n');
}

export function DraftFromNotesTab({ onApply }: Props) {
  const [template, setTemplate] = useState('');
  const [notes, setNotes] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [wantsGuide, setWantsGuide] = useState(false);
  const [depth, setDepth] = useState<'comprehensive' | 'sequential'>('comprehensive');
  const [confirmed, setConfirmed] = useState(false);

  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState<string | null>(null);
  const [parts, setParts] = useState<DraftPart[]>([]);
  const [identifierWarnings, setIdentifierWarnings] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);

  const templateOk = template.trim().length > 0 && template.length <= MAX_TEMPLATE_CHARS;
  const notesOk = notes.trim().length >= MIN_NOTES_CHARS && notes.length <= MAX_NOTES_CHARS;
  const canDraft = templateOk && notesOk && confirmed && !drafting;

  const runDraft = async () => {
    setDrafting(true);
    setError(null);
    setApplied(false);
    setGuide(null);
    setParts([]);
    setIdentifierWarnings([]);
    try {
      const res = await fetch('/api/pde/cases/draft-from-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_sheet_template: template,
          source_notes: notes,
          senior_learner_guide: wantsGuide,
          depth,
          discipline: discipline.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Drafting failed.');
        return;
      }
      setGuide(typeof data?.senior_learner_guide === 'string' ? data.senior_learner_guide : null);
      setParts(Array.isArray(data?.parts) ? (data.parts as DraftPart[]) : []);
      setIdentifierWarnings(Array.isArray(data?.identifier_warnings) ? data.identifier_warnings : []);
      onApply(data.data as Partial<CreateClinicalCaseInput>);
      setApplied(true);
    } catch {
      setError('Drafting failed. Please try again.');
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>These notes are not de-identified for you.</strong> Unlike a case pulled from the hospital system,
          anything you paste here arrives exactly as you typed it. Remove the patient’s name, phone number, address,
          hospital/registration number and date of birth <em>before</em> pasting. The AI is instructed never to copy an
          identifier into the case, but it is not a guarantee — you remain responsible for what you publish to learners.
        </AlertDescription>
      </Alert>

      {/* Case-sheet headings — the department's own, never a fixed list */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="notes-template" className="text-xs font-medium">
            1. Your department’s case-sheet headings
          </Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setTemplate(EXAMPLE_TEMPLATE)} disabled={drafting}>
            Show an example
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          One heading per line, in your department’s own wording. The draft follows these — headings that have no
          dedicated field are written into the case’s additional clinical details under your exact wording.
        </p>
        <Textarea
          id="notes-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder={EXAMPLE_TEMPLATE}
          rows={6}
          disabled={drafting}
          className="mt-1 text-xs"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          {template.length} / {MAX_TEMPLATE_CHARS} characters
        </p>
      </div>

      {/* Source material */}
      <div>
        <Label htmlFor="notes-source" className="text-xs font-medium">
          2. Your source material
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Paste the clinical notes, guideline extracts or teaching facts this case should be built from. The questions
          and answer-keys are grounded only in what you paste here.
        </p>
        <Textarea
          id="notes-source"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paste clinical notes, a guideline extract, or the facts of the case…"
          rows={14}
          disabled={drafting}
          className="mt-1 text-xs"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          {notes.length} / {MAX_NOTES_CHARS} characters
          {notes.trim().length > 0 && notes.trim().length < MIN_NOTES_CHARS
            ? ` — at least ${MIN_NOTES_CHARS} needed`
            : ''}
        </p>
      </div>

      {/* Options */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs font-medium">3. Depth</Label>
          <RadioGroup
            value={depth}
            onValueChange={(v) => setDepth(v as typeof depth)}
            className="mt-1.5 space-y-2"
            disabled={drafting}
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="comprehensive" id="depth-comprehensive" className="mt-0.5" />
              <Label htmlFor="depth-comprehensive" className="text-xs font-normal leading-snug">
                <span className="font-medium">One comprehensive case</span>
                <span className="block text-muted-foreground">
                  The whole scenario is shown at once, then 5–8 questions.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="sequential" id="depth-sequential" className="mt-0.5" />
              <Label htmlFor="depth-sequential" className="text-xs font-normal leading-snug">
                <span className="font-medium">Sequential, in parts</span>
                <span className="block text-muted-foreground">
                  The case unfolds in 2–4 parts. The parts are drafted as an outline you can copy — the case itself
                  saves as one case for now.
                </span>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="notes-discipline" className="text-xs font-medium">
              Discipline (optional)
            </Label>
            <Input
              id="notes-discipline"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              placeholder="e.g. Nursing, Pharmacy Practice, Physiotherapy"
              disabled={drafting}
              className="mt-1 text-xs"
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="notes-guide"
              checked={wantsGuide}
              onCheckedChange={(v) => setWantsGuide(v === true)}
              disabled={drafting}
              className="mt-0.5"
            />
            <Label htmlFor="notes-guide" className="text-xs font-normal leading-snug">
              <span className="font-medium">Also write a Senior Learner guide</span>
              <span className="block text-muted-foreground">
                Teaching notes for the Senior Learner — shown here only, never added to the case the learner opens.
              </span>
            </Label>
          </div>
        </div>
      </div>

      {/* Required confirmation */}
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <Checkbox
          id="notes-confirm"
          checked={confirmed}
          onCheckedChange={(v) => setConfirmed(v === true)}
          disabled={drafting}
          className="mt-0.5"
        />
        <Label htmlFor="notes-confirm" className="text-xs font-normal leading-snug">
          I have removed every patient identifier from the notes above, and I will check the drafted case again before
          publishing it to learners.
        </Label>
      </div>

      <Button onClick={runDraft} disabled={!canDraft} className="bg-[#0b6d41] hover:bg-[#0b6d41]/90">
        {drafting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
        {drafting ? 'Drafting…' : 'Draft with AI'}
      </Button>

      {drafting ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Drafting the case on the AI Max lane — this can take ~30–60 seconds.
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {identifierWarnings.length > 0 ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Your notes appear to contain {identifierWarnings.join(', ')}. Check the drafted case for anything that
            identifies a real patient, and edit it out before you save.
          </AlertDescription>
        </Alert>
      ) : null}

      {applied ? (
        <Alert>
          <Sparkles className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 text-xs">
            Draft ready — the form builder now holds it. Review every question and answer-key there, then save as draft.
            {guide || parts.length > 0 ? ' Come back to this tab for the notes below.' : ''}
          </AlertDescription>
        </Alert>
      ) : null}

      {parts.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <ListOrdered className="h-4 w-4" />
              Sequential outline
              <Badge variant="secondary">{parts.length} parts</Badge>
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard?.writeText(partsOutline(parts))}
            >
              Copy outline
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The saved case holds all of these questions together. Keep this outline — it is what the case will be split
            into once staged cases are available.
          </p>
          <div className="border rounded-md divide-y">
            {parts.map((p) => (
              <div key={p.part_number} className="p-3 space-y-1">
                <div className="text-sm font-medium">
                  Part {p.part_number} — {p.part_title}
                </div>
                {p.scenario_update ? (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{p.scenario_update}</p>
                ) : null}
                <ol className="text-xs list-decimal pl-5 space-y-0.5">
                  {p.questions.map((q, i) => (
                    <li key={i}>{q.question_text}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {guide ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Senior Learner guide
              <Badge variant="outline">Senior Learner only</Badge>
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard?.writeText(guide)}
            >
              Copy guide
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This is not part of the case and is never shown to a learner. Copy it into your own teaching notes.
          </p>
          <pre className="border rounded-md p-3 text-xs whitespace-pre-wrap font-sans max-h-96 overflow-y-auto">
            {guide}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
