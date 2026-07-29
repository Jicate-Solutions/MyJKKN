'use client';

// ============================================================================
// AI Job Type — create / edit dialog.
// Created: 2026-07-13. Mirrors ai-model-edit-dialog.tsx conventions.
//
// Writes one registry row via POST /api/admin/ai-job-types
// (fn_ai_job_type_upsert). job_type is the primary key: editable ONLY on
// create (locked when editing an existing type). Includes an input_schema
// builder — add/remove field rows the generic Run card auto-draws from.
//
// 2026-08-04 — CHANGING THE PROMPT NO LONGER CHANGES THE LIVE PROMPT. The RPC
// files an edited prompt as a proposed version (a challenger) and leaves the
// live one alone until a human promotes it. That is invisible from the outside:
// an admin edits, saves, sees the job behave exactly as before, concludes the
// save is broken, and "fixes" it by reverting the loop. So this dialog states
// the rule BEFORE the save (a standing note, plus a live callout the moment the
// text differs) and AFTER it (a panel the admin must dismiss, naming the
// version number) — never a bare success toast. CLAUDE.md #27: a state outcome
// the user did not get must be explicit, never silent.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileClock, Info, Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FIELD_TYPE_OPTIONS,
  LANE_OPTIONS,
  promptNeedsExplicitNotice,
  type AiJobType,
  type AiJobTypeDef,
  type AiJobTypeSaveResult,
  type InputFieldType,
  type InputSchemaField,
} from './ai-job-types';

interface AiJobTypeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode; a row = edit mode (job_type locked). */
  jobType: AiJobType | null;
  onSaved: () => void;
}

interface FormState {
  job_type: string;
  title: string;
  description: string;
  prompt_template: string;
  tool_set: string;
  output_target: string;
  allow_rule: string;
  lane: string;
  interactive: boolean;
  schedulable: boolean;
  expected_seconds: string;
  input_schema: InputSchemaField[];
}

function buildFormState(jt: AiJobType | null): FormState {
  return {
    job_type: jt?.job_type ?? '',
    title: jt?.title ?? '',
    description: jt?.description ?? '',
    prompt_template: jt?.prompt_template ?? '',
    tool_set: jt?.tool_set ?? 'all',
    output_target: jt?.output_target ?? 'job.result',
    allow_rule: jt?.allow_rule ?? 'seat_owner',
    lane: jt?.lane ?? 'max',
    interactive: jt?.interactive ?? false,
    schedulable: jt?.schedulable ?? false,
    expected_seconds: jt?.expected_seconds != null ? String(jt.expected_seconds) : '',
    input_schema: Array.isArray(jt?.input_schema) ? jt!.input_schema.map((f) => ({ ...f })) : [],
  };
}

// job_type key: lowercase, dot/underscore-segmented (e.g. "reports.weekly_digest").
const JOB_TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
// field key: a simple identifier used as a payload object key.
const FIELD_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function AiJobTypeEditDialog({
  open,
  onOpenChange,
  jobType,
  onSaved,
}: AiJobTypeEditDialogProps) {
  const isEdit = !!jobType;
  const [form, setForm] = useState<FormState>(buildFormState(null));
  const [saving, setSaving] = useState(false);
  /** Set only for outcomes where the admin's prompt did NOT go live — the
   *  dialog then shows a panel they must dismiss instead of closing silently. */
  const [notice, setNotice] = useState<AiJobTypeSaveResult | null>(null);

  useEffect(() => {
    if (open) {
      setForm(buildFormState(jobType));
      setNotice(null);
    }
  }, [open, jobType]);

  /** The prompt as it stands live right now, for change detection. */
  const livePrompt = jobType?.prompt_template ?? '';
  /** Only a job type that ALREADY has a live prompt has a champion to
   *  challenge. Giving one its first prompt goes live immediately, so the
   *  proposal warnings must not claim otherwise. */
  const hasLivePrompt = isEdit && livePrompt.trim() !== '';
  /** Predicts the RPC's challenger branch. JS .trim() is all-whitespace, which
   *  is what the SQL side normalises on too. Prediction only — the message
   *  shown AFTER saving always comes from the RPC's own prompt_action. */
  const promptChanged =
    hasLivePrompt &&
    form.prompt_template.trim() !== livePrompt.trim() &&
    form.prompt_template.trim() !== '';

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateField = (idx: number, patch: Partial<InputSchemaField>) =>
    setForm((prev) => ({
      ...prev,
      input_schema: prev.input_schema.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }));

  const addField = () =>
    setForm((prev) => ({
      ...prev,
      input_schema: [
        ...prev.input_schema,
        { key: '', label: '', type: 'text' as InputFieldType, required: false },
      ],
    }));

  const removeField = (idx: number) =>
    setForm((prev) => ({
      ...prev,
      input_schema: prev.input_schema.filter((_, i) => i !== idx),
    }));

  const outputTargetIsTable = useMemo(
    () => form.output_target.startsWith('table:'),
    [form.output_target],
  );

  const handleSubmit = async () => {
    // ── validate ──────────────────────────────────────────────────────────
    const jt = form.job_type.trim();
    if (!isEdit) {
      if (!jt) {
        toast.error('Give the job a key, e.g. reports.weekly_digest.');
        return;
      }
      if (!JOB_TYPE_RE.test(jt)) {
        toast.error('Key must be lowercase letters/numbers, dot- or underscore-separated.');
        return;
      }
    }
    if (!form.title.trim()) {
      toast.error('Give the job a title.');
      return;
    }
    if (form.allow_rule.startsWith('permission:') && form.allow_rule.trim() === 'permission:') {
      toast.error('Permission rule needs a key after "permission:".');
      return;
    }
    const expected =
      form.expected_seconds.trim() === '' ? null : Number(form.expected_seconds);
    if (expected !== null && (!Number.isInteger(expected) || expected <= 0)) {
      toast.error('Expected seconds must be a whole number above 0, or leave blank.');
      return;
    }

    // input_schema field validation
    const seenKeys = new Set<string>();
    for (const f of form.input_schema) {
      const k = f.key.trim();
      if (!k || !f.label.trim()) {
        toast.error('Every input field needs both a key and a label.');
        return;
      }
      if (!FIELD_KEY_RE.test(k)) {
        toast.error(`Field key "${k}" must be a simple identifier (letters, numbers, _).`);
        return;
      }
      if (seenKeys.has(k)) {
        toast.error(`Field key "${k}" is used twice — keys must be unique.`);
        return;
      }
      seenKeys.add(k);
      if (f.type === 'select' && (!f.options || f.options.filter((o) => o.trim()).length === 0)) {
        toast.error(`Dropdown field "${f.label}" needs at least one option.`);
        return;
      }
    }

    const cleanedSchema: InputSchemaField[] = form.input_schema.map((f) => {
      const base: InputSchemaField = {
        key: f.key.trim(),
        label: f.label.trim(),
        type: f.type,
        required: !!f.required,
      };
      if (f.type === 'select') {
        base.options = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
      }
      return base;
    });

    const def: AiJobTypeDef = {
      job_type: isEdit ? jobType!.job_type : jt,
      title: form.title.trim(),
      description: form.description.trim() || null,
      prompt_template: form.prompt_template.trim() || null,
      tool_set: form.tool_set.trim() || 'all',
      output_target: form.output_target.trim() || 'job.result',
      interactive: form.interactive,
      lane: form.lane,
      allow_rule: form.allow_rule.trim() || 'seat_owner',
      schedulable: form.schedulable,
      expected_seconds: expected,
      input_schema: cleanedSchema,
    };

    setSaving(true);
    try {
      const res = await fetch('/api/admin/ai-job-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(def),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }

      // The RPC reports what it did with the prompt. When the admin's text did
      // NOT become the live prompt, say so in a panel they have to dismiss —
      // a toast that fades in four seconds is exactly how this reads as a
      // broken save.
      const result = payload.data as AiJobTypeSaveResult | undefined;
      if (result && promptNeedsExplicitNotice(result.prompt_action)) {
        setNotice(result);
        return; // keep the dialog open; onSaved() runs when the panel is dismissed
      }

      toast.success(
        result?.prompt_action === 'champion_created'
          ? `${def.title} saved. ${result.prompt_message}`
          : isEdit
            ? `${def.title} updated.`
            : `${def.title} created.`,
      );
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  /** Dismissing the outcome panel is what finishes the save — by any route
   *  (Done, Cancel, Esc, the X), so the list still refreshes behind it. */
  const handleOpenChange = (next: boolean) => {
    if (!next && notice) {
      setNotice(null);
      onSaved();
      return;
    }
    onOpenChange(next);
  };

  // ── Outcome panel: the save succeeded but the LIVE prompt did not change ──
  if (notice) {
    const isProposal = notice.prompt_action === 'challenger_created';
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileClock className="h-5 w-5 text-amber-600" aria-hidden="true" />
              {isProposal ? 'Saved as a proposed version' : 'Live prompt kept'}
            </DialogTitle>
            <DialogDescription>
              {isProposal
                ? 'Everything else you changed is saved and live. The prompt is the exception.'
                : 'Everything else you changed is saved and live.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              {notice.prompt_message}
            </div>
            {isProposal && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This is deliberate. A prompt change is a{' '}
                  <strong className="text-foreground">proposal</strong>, not an edit — the
                  job keeps running on its current prompt so a change can be compared
                  against it before it affects real work.
                </p>
                <p>
                  <strong className="text-foreground">
                    Version {notice.prompt_version} is now waiting for approval.
                  </strong>{' '}
                  Nothing you typed is lost, and the job&apos;s behaviour will not change
                  until an admin approves that version. Saving again simply files another
                  version alongside this one.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit: ${jobType!.title}` : 'New AI job type'}</DialogTitle>
          <DialogDescription>
            A job type is a self-describing recipe: what to ask the AI, which tools it
            may use, where the answer goes, and who is allowed to run it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* job_type key */}
          <div className="space-y-2">
            <Label htmlFor="job_type">Key</Label>
            <Input
              id="job_type"
              placeholder="reports.weekly_digest"
              value={form.job_type}
              disabled={isEdit}
              onChange={(e) => update('job_type', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? 'The key is permanent — it identifies this job everywhere.'
                : 'Lowercase, dot- or underscore-separated. Permanent once created.'}
            </p>
          </div>

          {/* title + description */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Weekly digest"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              placeholder="What this job does, in plain English."
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>

          {/* prompt template */}
          <div className="space-y-2">
            <Label htmlFor="prompt_template">Prompt template</Label>
            <Textarea
              id="prompt_template"
              rows={4}
              className="font-mono text-xs"
              placeholder={'Summarise this week for {{institution}} focusing on {{topic}}.'}
              value={form.prompt_template}
              onChange={(e) => update('prompt_template', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="font-mono">{'{{key}}'}</code> placeholders — they get
              filled from the run form fields you define below.
            </p>

            {/* Standing rule, shown before anything is typed: editing this
                prompt will NOT change what the job actually runs. */}
            {hasLivePrompt && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Changing this prompt does not change the live prompt. Your new text is
                  saved as a proposed version and the job keeps running on its current
                  prompt until an admin approves the change.
                </span>
              </p>
            )}

            {/* Live callout the moment the text differs — the admin sees the
                consequence while typing, not only after saving. */}
            {promptChanged && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
              >
                <FileClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <strong>This prompt will be saved as a proposed version.</strong> Saving
                  will not change what this job runs — the live prompt stays as it is
                  until someone approves the new version.
                </span>
              </div>
            )}
          </div>

          {/* tool_set + output_target */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tool_set">Tool set</Label>
              <Input
                id="tool_set"
                placeholder="all"
                value={form.tool_set}
                onChange={(e) => update('tool_set', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                <code>all</code>, <code>none</code>, or a comma list of tool names.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="output_target">Output target</Label>
              <Input
                id="output_target"
                placeholder="job.result"
                value={form.output_target}
                onChange={(e) => update('output_target', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {outputTargetIsTable
                  ? 'Writes into a database table.'
                  : 'job.result, inbox, or table:<name>.'}
              </p>
            </div>
          </div>

          {/* allow_rule + lane */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="allow_rule">Who can run it</Label>
              <Input
                id="allow_rule"
                placeholder="seat_owner"
                value={form.allow_rule}
                onChange={(e) => update('allow_rule', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                <code>seat_owner</code>, <code>authenticated</code>, or{' '}
                <code>permission:key</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lane">Lane</Label>
              <Select value={form.lane} onValueChange={(v) => update('lane', v)}>
                <SelectTrigger id="lane">
                  <SelectValue placeholder="Pick lane" />
                </SelectTrigger>
                <SelectContent>
                  {LANE_OPTIONS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* interactive + schedulable + expected seconds */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <Switch
                checked={form.interactive}
                onCheckedChange={(v) => update('interactive', v)}
                aria-label="Interactive"
              />
              <span>
                Interactive
                <span className="block text-xs text-muted-foreground">a user waits</span>
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <Switch
                checked={form.schedulable}
                onCheckedChange={(v) => update('schedulable', v)}
                aria-label="Schedulable"
              />
              <span>
                Schedulable
                <span className="block text-xs text-muted-foreground">can run on a cron</span>
              </span>
            </label>
            <div className="space-y-2">
              <Label htmlFor="expected_seconds">Expected seconds</Label>
              <Input
                id="expected_seconds"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 45"
                value={form.expected_seconds}
                onChange={(e) => update('expected_seconds', e.target.value)}
              />
            </div>
          </div>

          {/* input_schema builder */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Run form fields</Label>
              <Button type="button" variant="outline" size="sm" onClick={addField}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add field
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              These become the boxes someone fills in before running the job. Their values
              fill the <code className="font-mono">{'{{key}}'}</code> placeholders above.
            </p>

            {form.input_schema.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                No fields yet — the job runs with an empty payload.
              </p>
            ) : (
              <div className="space-y-3">
                {form.input_schema.map((field, idx) => (
                  <div key={idx} className="space-y-2 rounded-md border bg-muted/20 p-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                      <Input
                        aria-label={`Field ${idx + 1} key`}
                        placeholder="key"
                        className="font-mono text-xs"
                        value={field.key}
                        onChange={(e) => updateField(idx, { key: e.target.value })}
                      />
                      <Input
                        aria-label={`Field ${idx + 1} label`}
                        placeholder="Label shown to user"
                        value={field.label}
                        onChange={(e) => updateField(idx, { label: e.target.value })}
                      />
                      <Select
                        value={field.type}
                        onValueChange={(v) =>
                          updateField(idx, {
                            type: v as InputFieldType,
                            // drop options when leaving 'select'
                            options: v === 'select' ? field.options ?? [] : undefined,
                          })
                        }
                      >
                        <SelectTrigger className="w-[130px]" aria-label={`Field ${idx + 1} type`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPE_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove field ${idx + 1}`}
                        onClick={() => removeField(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {field.type === 'select' && (
                      <Input
                        aria-label={`Field ${idx + 1} options`}
                        placeholder="Options, comma-separated: low, medium, high"
                        value={(field.options ?? []).join(', ')}
                        onChange={(e) =>
                          updateField(idx, {
                            options: e.target.value.split(',').map((o) => o.trimStart()),
                          })
                        }
                      />
                    )}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={!!field.required}
                        onCheckedChange={(v) => updateField(idx, { required: v })}
                        className="scale-75"
                        aria-label={`Field ${idx + 1} required`}
                      />
                      Required
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {/* The button says what the click will actually do — a plain
                "Save changes" would promise a live prompt change it won't make. */}
            {!isEdit
              ? 'Create job type'
              : promptChanged
                ? 'Save (prompt goes for approval)'
                : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
