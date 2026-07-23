'use client';

/**
 * ConfigEditorDialog — create or edit a hostel_pulse_configs row.
 *
 * Renders a minimal form: title, description, frequency, status,
 * critical-threshold, anonymous-mode toggle, and a question list editor
 * (text + scale/text type). target_blocks and starts_at/ends_at are
 * deliberately deferred to a future "advanced" panel — v1 supports the
 * core fields needed to ship pulse-surveys.
 */

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreatePulseConfig,
  useUpdatePulseConfig,
} from '@/hooks/campus-living/use-wellness';
import {
  DEFAULT_PULSE_QUESTIONS,
  PULSE_FREQUENCY_LABELS,
  PULSE_STATUS_LABELS,
  type HostelPulseConfig,
  type PulseFrequencyEnum,
  type PulseQuestion,
  type PulseQuestionsPayload,
  type PulseStatusEnum,
} from '@/types/campus-living/wellness';

interface ConfigEditorDialogProps {
  institutionId: string;
  authorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, dialog edits this row; otherwise it creates a new one. */
  existing?: HostelPulseConfig | null;
}

const FREQUENCY_OPTIONS: PulseFrequencyEnum[] = ['weekly', 'biweekly', 'monthly'];
const STATUS_OPTIONS: PulseStatusEnum[] = [
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
];

function newQuestionId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function ConfigEditorDialog({
  institutionId,
  authorId,
  open,
  onOpenChange,
  existing,
}: ConfigEditorDialogProps) {
  const isEdit = !!existing;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<PulseFrequencyEnum>('weekly');
  const [status, setStatus] = useState<PulseStatusEnum>('draft');
  const [criticalThreshold, setCriticalThreshold] = useState(2);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [items, setItems] = useState<PulseQuestion[]>(DEFAULT_PULSE_QUESTIONS.items);

  const createMut = useCreatePulseConfig();
  const updateMut = useUpdatePulseConfig();
  const saving = createMut.isPending || updateMut.isPending;

  // Reset form when the dialog opens (load existing values or defaults).
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setTitle(existing.title ?? '');
      setDescription(existing.description ?? '');
      setFrequency(existing.frequency);
      setStatus(existing.status);
      setCriticalThreshold(existing.questions?.critical_threshold ?? 2);
      setAnonymousMode(existing.questions?.anonymous_mode ?? false);
      setItems(
        Array.isArray(existing.questions?.items) && existing.questions.items.length > 0
          ? existing.questions.items
          : DEFAULT_PULSE_QUESTIONS.items,
      );
    } else {
      setTitle('');
      setDescription('');
      setFrequency('weekly');
      setStatus('draft');
      setCriticalThreshold(2);
      setAnonymousMode(false);
      setItems(DEFAULT_PULSE_QUESTIONS.items);
    }
  }, [open, existing]);

  const updateItem = (id: string, patch: Partial<PulseQuestion>) => {
    setItems((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((q) => q.id !== id));
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: newQuestionId(),
        text: '',
        type: 'scale',
        scale_max: 5,
        is_critical_indicator: false,
      },
    ]);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const questions: PulseQuestionsPayload = {
      critical_threshold: criticalThreshold,
      anonymous_mode: anonymousMode,
      items: items
        .map((q) => ({
          ...q,
          text: q.text.trim(),
        }))
        .filter((q) => q.text.length > 0),
    };
    if (isEdit && existing) {
      await updateMut.mutateAsync({
        id: existing.id,
        payload: {
          title: title.trim(),
          description: description.trim() ? description.trim() : null,
          frequency,
          status,
          questions,
        },
      });
    } else {
      await createMut.mutateAsync({
        institution_id: institutionId,
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        frequency,
        status,
        questions,
        created_by: authorId,
      });
    }
    onOpenChange(false);
  };

  const canSave = title.trim().length > 0 && items.some((q) => q.text.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit pulse survey' : 'New pulse survey'}</DialogTitle>
          <DialogDescription>
            Configure questions, cadence, and the mood threshold that flags a
            response as critical.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pulse-title">Title</Label>
            <Input
              id="pulse-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly wellness pulse"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pulse-desc">Description (optional)</Label>
            <Textarea
              id="pulse-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short note shown to learners above the questions."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as PulseFrequencyEnum)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {PULSE_FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as PulseStatusEnum)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PULSE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pulse-threshold">
                Critical threshold (mood &le;)
              </Label>
              <Input
                id="pulse-threshold"
                type="number"
                min={1}
                max={5}
                value={criticalThreshold}
                onChange={(e) =>
                  setCriticalThreshold(
                    Math.min(5, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Responses with overall_mood at or below this value land in the
                critical inbox.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                <span>Anonymous mode</span>
                <Switch
                  checked={anonymousMode}
                  onCheckedChange={setAnonymousMode}
                />
              </Label>
              <p className="text-xs text-muted-foreground">
                Wardens see anon tokens instead of learner ids. Identity is
                still stored at the DB level.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Questions</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add question
              </Button>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No questions yet — add at least one to publish.
                </p>
              ) : (
                items.map((q, idx) => (
                  <div
                    key={q.id}
                    className="rounded-md border p-3 space-y-2 bg-muted/30"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground mt-2.5 w-5 text-right">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 space-y-2">
                        <Input
                          value={q.text}
                          onChange={(e) =>
                            updateItem(q.id, { text: e.target.value })
                          }
                          placeholder="Question text"
                        />
                        <div className="flex items-center gap-3 flex-wrap text-xs">
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">Type</Label>
                            <Select
                              value={q.type}
                              onValueChange={(v) =>
                                updateItem(q.id, {
                                  type: v as PulseQuestion['type'],
                                })
                              }
                            >
                              <SelectTrigger className="h-7 w-24 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="scale">Scale</SelectItem>
                                <SelectItem value="text">Text</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {q.type === 'scale' ? (
                            <div className="flex items-center gap-1">
                              <Label className="text-xs">Max</Label>
                              <Input
                                type="number"
                                min={2}
                                max={10}
                                value={q.scale_max ?? 5}
                                onChange={(e) =>
                                  updateItem(q.id, {
                                    scale_max: Math.min(
                                      10,
                                      Math.max(2, Number(e.target.value) || 5),
                                    ),
                                  })
                                }
                                className="h-7 w-16 text-xs"
                              />
                            </div>
                          ) : null}
                          <label className="flex items-center gap-1 cursor-pointer">
                            <Switch
                              checked={!!q.is_critical_indicator}
                              onCheckedChange={(v) =>
                                updateItem(q.id, { is_critical_indicator: v })
                              }
                            />
                            <span>critical indicator</span>
                          </label>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(q.id)}
                        aria-label="Remove question"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isEdit ? 'Save changes' : 'Create survey'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
