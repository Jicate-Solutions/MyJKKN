'use client';

/**
 * DemonstrationForm — client-side form for creating a PDE demonstration.
 *
 * Fields:
 *   - Category (required) — one of the 7 PDE durable-value categories
 *   - Rubric  (optional)  — fetched on-demand for embodied / social_leadership
 *                           / cultural_civic; hidden for the other 4
 *   - Skill name (required)
 *   - Evidence type (optional) — video / document / artifact_link / osce_score
 *                                / simulator_pass / other
 *   - Evidence URL (optional)
 *   - Notes / free-form text (optional)
 *
 * Submit actions:
 *   - "Save as draft"      → POST { status='draft' }, then redirect to inbox
 *   - "Submit for review"  → POST { submit: true }, server flips to 'submitted'
 *
 * No react-hook-form — this codebase uses both RHF and plain useState forms
 * (see admin/pde/rubrics pages for plain-useState pattern). Plain state is
 * the lower-overhead choice for 6 fields.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, FileText, Save, Send, Sparkles } from 'lucide-react';
import type {
  CreatePDEDemonstrationInput,
  PDECategoryKey,
  PDEDemonstration,
} from '@/lib/types/pde-demonstrations';

// ---------------------------------------------------------------------------
// Static dropdown content
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: Array<{ value: PDECategoryKey; label: string; hint: string }> = [
  { value: 'judgment', label: 'Judgment', hint: 'Decision-making under uncertainty' },
  { value: 'embodied', label: 'Embodied Practice', hint: 'Hands-on clinical / technical skill' },
  { value: 'problem_finding', label: 'Problem Finding', hint: 'Identifying problems worth solving' },
  { value: 'accountability', label: 'Accountability', hint: 'Owning outcomes end-to-end' },
  { value: 'social_leadership', label: 'Social & Leadership', hint: 'Working with and leading humans' },
  { value: 'cultural_civic', label: 'Cultural & Civic', hint: 'Local-language, tradition, civic engagement' },
  { value: 'credential', label: 'Credential', hint: 'External certifications / awards' },
];

const EVIDENCE_TYPE_OPTIONS = [
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document (PDF / write-up)' },
  { value: 'artifact_link', label: 'Artifact link (GitHub / Figma / deployed app)' },
  { value: 'osce_score', label: 'OSCE score sheet' },
  { value: 'simulator_pass', label: 'Simulator pass record' },
  { value: 'other', label: 'Other' },
];

interface RubricChoice {
  key: string;
  value: Record<string, unknown>;
}

interface FormState {
  category_key: PDECategoryKey | '';
  rubric_policy_key: string;
  skill_name: string;
  evidence_type: string;
  evidence_url: string;
  notes: string;
}

const INITIAL: FormState = {
  category_key: '',
  rubric_policy_key: '',
  skill_name: '',
  evidence_type: '',
  evidence_url: '',
  notes: '',
};

// Helper: pull a sensible label out of a rubric JSONB object. The shape varies
// across the three namespaces, so we probe a few common fields before falling
// back to the policy key suffix.
function rubricLabel(choice: RubricChoice): string {
  const v = choice.value as Record<string, unknown>;
  if (typeof v.discipline === 'string') {
    return v.discipline.charAt(0).toUpperCase() + v.discipline.slice(1);
  }
  if (typeof v.title === 'string') return v.title;
  if (typeof v.name === 'string') return v.name;
  if (typeof v.role === 'string') return v.role;
  // Fall back to the part after the last dot in the policy key.
  const parts = choice.key.split('.');
  return parts[parts.length - 1].replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DemonstrationForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [rubrics, setRubrics] = useState<RubricChoice[]>([]);
  const [loadingRubrics, setLoadingRubrics] = useState(false);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);

  // ---- Fetch rubrics whenever the category changes ----
  useEffect(() => {
    if (!form.category_key) {
      setRubrics([]);
      setForm((prev) => ({ ...prev, rubric_policy_key: '' }));
      return;
    }
    let cancelled = false;
    setLoadingRubrics(true);
    fetch(`/api/pde/demonstrations/rubrics?category=${form.category_key}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load rubrics (${res.status})`);
        const json = (await res.json()) as { data: RubricChoice[] };
        if (cancelled) return;
        setRubrics(json.data || []);
        setForm((prev) => ({ ...prev, rubric_policy_key: '' }));
      })
      .catch((err) => {
        if (cancelled) return;
        // Non-fatal: rubric dropdown just hides itself.
        console.warn('[DemonstrationForm] rubric fetch error', err);
        setRubrics([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRubrics(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.category_key]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = (submit: boolean): Partial<CreatePDEDemonstrationInput> & { submit?: boolean } => {
    const evidence: Record<string, unknown> = {};
    if (form.evidence_url.trim()) evidence.url = form.evidence_url.trim();
    if (form.notes.trim()) evidence.notes = form.notes.trim();
    if (form.evidence_type) evidence.type = form.evidence_type;

    return {
      category_key: (form.category_key || undefined) as PDECategoryKey | undefined,
      rubric_policy_key: form.rubric_policy_key || undefined,
      skill_name: form.skill_name.trim() || undefined,
      evidence_type: form.evidence_type || undefined,
      evidence,
      submit,
    };
  };

  const handleSubmit = async (action: 'draft' | 'submit') => {
    if (!form.category_key) {
      toast.error('Please pick a PDE category.');
      return;
    }
    if (!form.skill_name.trim()) {
      toast.error('Please enter a skill name.');
      return;
    }
    setSaving(action);
    try {
      const res = await fetch('/api/pde/demonstrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildPayload(action === 'submit')),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const { data } = (await res.json()) as { data: PDEDemonstration };
      toast.success(
        action === 'submit'
          ? 'Submitted for review.'
          : 'Saved as draft.'
      );
      // Reset, then bounce back to the inbox so the new row is visible.
      setForm(INITIAL);
      router.push('/learn/pde/demonstrations');
      router.refresh();
      return data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(null);
    }
  };

  const showRubricHint = form.category_key && rubrics.length === 0 && !loadingRubrics;

  return (
    <Card>
      <CardContent className="py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#0b6d41]" />
          <h2 className="text-lg font-semibold">Describe your demonstration</h2>
        </div>

        {/* --- Category --- */}
        <div className="space-y-2">
          <Label htmlFor="category">
            PDE category <span className="text-rose-600">*</span>
          </Label>
          <Select
            value={form.category_key || undefined}
            onValueChange={(v) => update('category_key', v as PDECategoryKey)}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="Pick the durable-value category this evidence belongs to" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex flex-col items-start">
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.hint}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* --- Rubric (conditional) --- */}
        {form.category_key && rubrics.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="rubric">Rubric (optional)</Label>
            <Select
              value={form.rubric_policy_key || undefined}
              onValueChange={(v) => update('rubric_policy_key', v)}
            >
              <SelectTrigger id="rubric">
                <SelectValue placeholder={loadingRubrics ? 'Loading…' : 'Pick a rubric to anchor this demonstration'} />
              </SelectTrigger>
              <SelectContent>
                {rubrics.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    <span className="flex flex-col items-start">
                      <span className="font-medium">{rubricLabel(r)}</span>
                      <span className="text-xs text-muted-foreground font-mono">{r.key}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Anchoring to a rubric lets the scoring engine apply the right thresholds at review time.
            </p>
          </div>
        )}

        {showRubricHint && (
          <p className="text-xs text-muted-foreground italic">
            No rubric required for this category yet — describe your evidence below and a reviewer will score free-form.
          </p>
        )}

        {/* --- Skill name --- */}
        <div className="space-y-2">
          <Label htmlFor="skill">
            Skill name <span className="text-rose-600">*</span>
          </Label>
          <Input
            id="skill"
            placeholder="e.g. Patient history-taking, Suturing simulation, Bharatanatyam recital"
            value={form.skill_name}
            onChange={(e) => update('skill_name', e.target.value)}
            maxLength={200}
          />
        </div>

        {/* --- Evidence type --- */}
        <div className="space-y-2">
          <Label htmlFor="evidence_type">Evidence type</Label>
          <Select
            value={form.evidence_type || undefined}
            onValueChange={(v) => update('evidence_type', v)}
          >
            <SelectTrigger id="evidence_type">
              <SelectValue placeholder="What kind of evidence are you submitting?" />
            </SelectTrigger>
            <SelectContent>
              {EVIDENCE_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* --- Evidence URL --- */}
        <div className="space-y-2">
          <Label htmlFor="evidence_url">Evidence URL (optional)</Label>
          <Input
            id="evidence_url"
            type="url"
            placeholder="https://… (drive link, GitHub repo, deployed URL, video)"
            value={form.evidence_url}
            onChange={(e) => update('evidence_url', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            File-upload picker ships in T1.3. For now, paste a shared link.
          </p>
        </div>

        {/* --- Notes --- */}
        <div className="space-y-2">
          <Label htmlFor="notes">Context / notes (optional)</Label>
          <Textarea
            id="notes"
            placeholder="Brief context: what you did, why it counts, who supervised, what the outcome was."
            rows={4}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            maxLength={2000}
          />
        </div>

        {/* --- Actions --- */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <Link href="/learn/pde/demonstrations">
            <Button variant="ghost" type="button">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to inbox
            </Button>
          </Link>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => handleSubmit('draft')}
              disabled={saving !== null}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving === 'draft' ? 'Saving…' : 'Save as draft'}
            </Button>
            <Button
              type="button"
              className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
              onClick={() => handleSubmit('submit')}
              disabled={saving !== null}
            >
              <Send className="h-4 w-4 mr-2" />
              {saving === 'submit' ? 'Submitting…' : 'Submit for review'}
            </Button>
          </div>
        </div>

        <div className="rounded-md bg-muted/50 border border-border/60 p-3 flex items-start gap-2 text-xs text-muted-foreground">
          <FileText className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Drafts stay private. Once submitted, a faculty / peer / AI validator from your
            institution can review under the rubric you anchored to (or free-form if none).
            The scoring engine writes the final weighted score back onto this row.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
