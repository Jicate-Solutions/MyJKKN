'use client';

// app/(routes)/meetings/routing-forms/_components/routing-form-builder.tsx
//
// Routing Forms builder (Universal Booking M1). Three tabs:
//   • Fields    — add/edit/remove the form's questions (text/select/multiselect).
//   • Rules     — ordered IF/THEN rules (move up/down) + the default destination.
//   • Responses — submissions list (loaded on demand).
//
// Saving:
//   - Form settings + fields → updateRoutingForm.
//   - Rules (whole set, replace) → saveRoutingRules.
// The "Test" panel runs the SHARED pure evaluator client-side so the host can
// see exactly where sample answers route — identical logic to the live route.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import {
  evaluateRouting,
  type RoutingRule as EvalRule,
  type RoutingAnswers,
} from '@/lib/services/meetings/routing-rule-evaluator';
import type {
  RoutingFormWithRules,
  RoutingField,
  RoutingFieldType,
  RoutingCondition,
  RoutingOperator,
  RoutingDestinationType,
  RuleInput,
  RoutingFormResponse,
} from '@/lib/services/meetings/routing-form-service';
import {
  updateRoutingForm,
  saveRoutingRules,
  listRoutingResponses,
} from '../actions';
import { useTabParam } from '@/hooks/use-tab-param';

const ROUTING_FORM_BUILDER_TABS = ['fields', 'rules', 'responses'] as const;

// Local editable rule shape (UI keeps a stable client id for list keys).
interface EditRule {
  uid: string;
  match_logic: 'all' | 'any';
  conditions: RoutingCondition[];
  destination_type: RoutingDestinationType;
  url: string;
  markdown: string;
  is_default: boolean;
}

const newUid = () => Math.random().toString(36).slice(2, 10);
const slugifyKey = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

const FIELD_TYPES: { value: RoutingFieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'select', label: 'Single choice' },
  { value: 'multiselect', label: 'Multiple choice' },
];
const OPERATORS: { value: RoutingOperator; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
];
const DEST_TYPES: { value: RoutingDestinationType; label: string }[] = [
  { value: 'event_link', label: 'Scheduling link' },
  { value: 'url', label: 'External URL' },
  { value: 'message', label: 'Message' },
];

export function RoutingFormBuilder({ form }: { form: RoutingFormWithRules }) {
  // URL-synced main tab (deep-linkable / favoritable).
  const [activeTab, setActiveTab] = useTabParam('fields', ROUTING_FORM_BUILDER_TABS);

  // ── form settings + fields ──
  const [title, setTitle] = useState(form.title);
  const [headline, setHeadline] = useState(form.headline ?? '');
  const [description, setDescription] = useState(form.description ?? '');
  const [isActive, setIsActive] = useState(form.is_active);
  const [fields, setFields] = useState<RoutingField[]>(form.fields ?? []);
  const [savingForm, setSavingForm] = useState(false);

  // ── rules ──
  const initialRules: EditRule[] = useMemo(() => {
    const nonDefault = form.rules
      .filter((r) => !r.is_default)
      .sort((a, b) => a.order_index - b.order_index)
      .map((r) => ({
        uid: newUid(),
        match_logic: r.match_logic,
        conditions: Array.isArray(r.conditions) ? r.conditions : [],
        destination_type: r.destination_type,
        url: (r.destination_value?.url as string) ?? '',
        markdown: (r.destination_value?.markdown as string) ?? '',
        is_default: false,
      }));
    const dflt = form.rules.find((r) => r.is_default);
    const defaultRule: EditRule = dflt
      ? {
          uid: newUid(),
          match_logic: 'all',
          conditions: [],
          destination_type: dflt.destination_type,
          url: (dflt.destination_value?.url as string) ?? '',
          markdown: (dflt.destination_value?.markdown as string) ?? '',
          is_default: true,
        }
      : {
          uid: newUid(),
          match_logic: 'all',
          conditions: [],
          destination_type: 'message',
          url: '',
          markdown: 'Thanks! The right team will be in touch shortly.',
          is_default: true,
        };
    return [...nonDefault, defaultRule];
  }, [form.rules]);

  const [rules, setRules] = useState<EditRule[]>(initialRules);
  const [savingRules, setSavingRules] = useState(false);

  // ── responses ──
  const [responses, setResponses] = useState<RoutingFormResponse[] | null>(null);
  const [loadingResponses, setLoadingResponses] = useState(false);

  // ── test panel ──
  const [testAnswers, setTestAnswers] = useState<RoutingAnswers>({});

  const nonDefaultRules = rules.filter((r) => !r.is_default);
  const defaultRule = rules.find((r) => r.is_default)!;

  // =========================== FIELD EDITING ===========================
  function addField() {
    setFields((f) => [
      ...f,
      { key: `field_${f.length + 1}`, label: '', type: 'text', required: false },
    ]);
  }
  function updateField(i: number, patch: Partial<RoutingField>) {
    setFields((f) => f.map((fld, idx) => (idx === i ? { ...fld, ...patch } : fld)));
  }
  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i));
  }

  async function saveForm() {
    setSavingForm(true);
    const cleaned = fields
      .filter((f) => f.label.trim())
      .map((f) => ({
        ...f,
        key: f.key.trim() || slugifyKey(f.label),
        label: f.label.trim(),
        options:
          f.type === 'text'
            ? undefined
            : (f.options ?? []).map((o) => o.trim()).filter(Boolean),
      }));
    const res = await updateRoutingForm(form.id, {
      title: title.trim(),
      headline: headline.trim() || null,
      description: description.trim() || null,
      is_active: isActive,
      fields: cleaned,
    });
    setSavingForm(false);
    if (!res.success) {
      toast.error(res.error ?? 'Could not save the form.');
      return;
    }
    setFields(cleaned);
    toast.success('Form saved.');
  }

  // =========================== RULE EDITING ============================
  function addRule() {
    const insertAt = rules.findIndex((r) => r.is_default);
    const rule: EditRule = {
      uid: newUid(),
      match_logic: 'all',
      conditions: [{ field_key: fields[0]?.key ?? '', operator: 'is', value: '' }],
      destination_type: 'event_link',
      url: '',
      markdown: '',
      is_default: false,
    };
    setRules((rs) => [...rs.slice(0, insertAt), rule, ...rs.slice(insertAt)]);
  }
  function updateRule(uid: string, patch: Partial<EditRule>) {
    setRules((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }
  function removeRule(uid: string) {
    setRules((rs) => rs.filter((r) => r.uid !== uid));
  }
  function moveRule(uid: string, dir: -1 | 1) {
    setRules((rs) => {
      const idx = rs.findIndex((r) => r.uid === uid);
      const target = idx + dir;
      // can't move past the default (which is always last) or before 0
      if (idx < 0 || target < 0 || target >= rs.length || rs[target].is_default) return rs;
      const next = [...rs];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }
  function addCondition(uid: string) {
    setRules((rs) =>
      rs.map((r) =>
        r.uid === uid
          ? {
              ...r,
              conditions: [
                ...r.conditions,
                { field_key: fields[0]?.key ?? '', operator: 'is', value: '' },
              ],
            }
          : r,
      ),
    );
  }
  function updateCondition(uid: string, ci: number, patch: Partial<RoutingCondition>) {
    setRules((rs) =>
      rs.map((r) =>
        r.uid === uid
          ? { ...r, conditions: r.conditions.map((c, i) => (i === ci ? { ...c, ...patch } : c)) }
          : r,
      ),
    );
  }
  function removeCondition(uid: string, ci: number) {
    setRules((rs) =>
      rs.map((r) =>
        r.uid === uid ? { ...r, conditions: r.conditions.filter((_, i) => i !== ci) } : r,
      ),
    );
  }

  function destinationValue(r: EditRule): Record<string, unknown> {
    return r.destination_type === 'message' ? { markdown: r.markdown } : { url: r.url };
  }

  async function saveRules() {
    // Validate: each non-default rule needs a destination value.
    for (const r of nonDefaultRules) {
      if (r.destination_type === 'message' && !r.markdown.trim()) {
        toast.error('A "Message" rule needs message text.');
        return;
      }
      if (r.destination_type !== 'message' && !r.url.trim()) {
        toast.error('A scheduling/URL rule needs a link.');
        return;
      }
    }
    setSavingRules(true);
    const payload: RuleInput[] = [
      ...nonDefaultRules.map((r, i) => ({
        order_index: i,
        match_logic: r.match_logic,
        conditions: r.conditions.filter((c) => c.field_key && c.value.trim()),
        destination_type: r.destination_type,
        destination_value: destinationValue(r),
        is_default: false,
      })),
      {
        order_index: 9999,
        match_logic: 'all' as const,
        conditions: [],
        destination_type: defaultRule.destination_type,
        destination_value: destinationValue(defaultRule),
        is_default: true,
      },
    ];
    const res = await saveRoutingRules(form.id, payload);
    setSavingRules(false);
    if (!res.success) {
      toast.error(res.error ?? 'Could not save rules.');
      return;
    }
    toast.success('Rules saved.');
  }

  // =========================== RESPONSES ==============================
  async function loadResponses() {
    setLoadingResponses(true);
    const res = await listRoutingResponses(form.id);
    setLoadingResponses(false);
    if (!res.success) {
      toast.error(res.error ?? 'Could not load responses.');
      return;
    }
    setResponses(res.data ?? []);
  }

  // =========================== TEST EVAL ==============================
  const testResult = useMemo(() => {
    const evalRules: EvalRule[] = [
      ...nonDefaultRules.map((r, i) => ({
        id: r.uid,
        order_index: i,
        match_logic: r.match_logic,
        conditions: r.conditions.filter((c) => c.field_key && c.value.trim()),
        destination_type: r.destination_type,
        destination_value: destinationValue(r),
        is_default: false,
      })),
      {
        id: defaultRule.uid,
        order_index: 9999,
        match_logic: 'all' as const,
        conditions: [],
        destination_type: defaultRule.destination_type,
        destination_value: destinationValue(defaultRule),
        is_default: true,
      },
    ];
    return evaluateRouting(testAnswers, evalRules);
  }, [testAnswers, nonDefaultRules, defaultRule]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="responses" onClick={() => responses === null && loadResponses()}>
            Responses
          </TabsTrigger>
        </TabsList>
        <a
          href={`/r/${form.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open public form /r/{form.slug}
        </a>
      </div>

      {/* ─────────────────────────── FIELDS ─────────────────────────── */}
      <TabsContent value="fields" className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Form settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="b-title">Title (internal)</Label>
                <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={isActive} onCheckedChange={setIsActive} id="b-active" />
                <Label htmlFor="b-active" className="cursor-pointer">
                  {isActive ? 'Active (public)' : 'Off (hidden)'}
                </Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-headline">Headline (shown to visitors)</Label>
              <Input
                id="b-headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. Tell us what you need"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-desc">Description</Label>
              <Textarea
                id="b-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="A short sentence under the headline."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm">Questions</CardTitle>
            <Button variant="outline" size="sm" onClick={addField}>
              <Plus className="mr-1.5 h-4 w-4" /> Add question
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No questions yet. Add at least one so visitors can be routed.
              </p>
            )}
            {fields.map((f, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr,auto,auto]">
                  <Input
                    value={f.label}
                    onChange={(e) =>
                      updateField(i, {
                        label: e.target.value,
                        key: f.key || slugifyKey(e.target.value),
                      })
                    }
                    placeholder="Question label"
                  />
                  <select
                    value={f.type}
                    onChange={(e) =>
                      updateField(i, { type: e.target.value as RoutingFieldType })
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={!!f.required}
                        onChange={(e) => updateField(i, { required: e.target.checked })}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => removeField(i)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {f.type !== 'text' && (
                  <div className="mt-2">
                    <Label className="text-xs text-muted-foreground">
                      Options (one per line)
                    </Label>
                    <Textarea
                      value={(f.options ?? []).join('\n')}
                      onChange={(e) =>
                        updateField(i, { options: e.target.value.split(/\r?\n/) })
                      }
                      rows={3}
                      className="mt-1 font-mono text-xs"
                      placeholder={'Option A\nOption B'}
                    />
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Key: <code>{f.key || '—'}</code> (used in rules)
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={saveForm} disabled={savingForm}>
            {savingForm ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save form
          </Button>
        </div>
      </TabsContent>

      {/* ─────────────────────────── RULES ─────────────────────────── */}
      <TabsContent value="rules" className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Rules are checked top to bottom. The first one that matches decides where the
          visitor goes. If none match, the default below is used.
        </p>

        {nonDefaultRules.map((r, idx) => (
          <Card key={r.uid}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">
                <Badge variant="secondary" className="mr-2">
                  {idx + 1}
                </Badge>
                If…
              </CardTitle>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveRule(r.uid, -1)}
                  disabled={idx === 0}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveRule(r.uid, 1)}
                  disabled={idx === nonDefaultRules.length - 1}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeRule(r.uid)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span>Match</span>
                <select
                  value={r.match_logic}
                  onChange={(e) =>
                    updateRule(r.uid, { match_logic: e.target.value as 'all' | 'any' })
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">all conditions</option>
                  <option value="any">any condition</option>
                </select>
              </div>

              {r.conditions.map((c, ci) => (
                <div key={ci} className="flex flex-wrap items-center gap-2">
                  <select
                    value={c.field_key}
                    onChange={(e) => updateCondition(r.uid, ci, { field_key: e.target.value })}
                    className="h-9 min-w-[8rem] rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Select field…</option>
                    {fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label || f.key}
                      </option>
                    ))}
                  </select>
                  <select
                    value={c.operator}
                    onChange={(e) =>
                      updateCondition(r.uid, ci, { operator: e.target.value as RoutingOperator })
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {OPERATORS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={c.value}
                    onChange={(e) => updateCondition(r.uid, ci, { value: e.target.value })}
                    placeholder="value"
                    className="h-9 w-40"
                  />
                  <button
                    type="button"
                    onClick={() => removeCondition(r.uid, ci)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => addCondition(r.uid)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add condition
              </Button>

              <DestinationEditor
                rule={r}
                onChange={(patch) => updateRule(r.uid, patch)}
              />
            </CardContent>
          </Card>
        ))}

        <Button variant="outline" onClick={addRule}>
          <Plus className="mr-1.5 h-4 w-4" /> Add rule
        </Button>

        {/* default rule */}
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">In all other cases…</CardTitle>
          </CardHeader>
          <CardContent>
            <DestinationEditor
              rule={defaultRule}
              onChange={(patch) => updateRule(defaultRule.uid, patch)}
            />
          </CardContent>
        </Card>

        {/* test panel */}
        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Test routing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add fields to test routing.</p>
            ) : (
              fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <Label className="w-32 shrink-0 truncate text-xs">{f.label || f.key}</Label>
                  <Input
                    value={(testAnswers[f.key] as string) ?? ''}
                    onChange={(e) =>
                      setTestAnswers((a) => ({ ...a, [f.key]: e.target.value }))
                    }
                    placeholder="sample answer"
                    className="h-8"
                  />
                </div>
              ))
            )}
            <div className="rounded-md border bg-background p-3 text-sm">
              <span className="text-muted-foreground">Result: </span>
              {testResult.destination ? (
                <span className="font-medium">
                  {testResult.rule?.is_default ? 'Default → ' : `Rule → `}
                  {testResult.destination.type === 'message'
                    ? 'show message'
                    : (testResult.destination.value.url as string) || '(no link set)'}
                </span>
              ) : (
                <span className="font-medium text-amber-600">No destination configured</span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={saveRules} disabled={savingRules}>
            {savingRules ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save rules
          </Button>
        </div>
      </TabsContent>

      {/* ─────────────────────────── RESPONSES ─────────────────────────── */}
      <TabsContent value="responses" className="space-y-3">
        {loadingResponses ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading responses…
          </div>
        ) : !responses || responses.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No responses yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {responses.map((resp) => (
              <Card key={resp.id}>
                <CardContent className="p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {new Date(resp.created_at).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                      })}
                    </span>
                    {resp.attendee_email && (
                      <span className="text-xs font-medium">{resp.attendee_email}</span>
                    )}
                  </div>
                  <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(resp.answers, null, 2)}
                  </pre>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Routed to:{' '}
                    <code>
                      {(resp.resolved_destination?.type as string) ?? 'none'}
                      {resp.resolved_destination?.value
                        ? ` · ${JSON.stringify(resp.resolved_destination.value)}`
                        : ''}
                    </code>
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

// Destination sub-editor used by both rules and the default.
function DestinationEditor({
  rule,
  onChange,
}: {
  rule: EditRule;
  onChange: (patch: Partial<EditRule>) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Then send to</span>
        <select
          value={rule.destination_type}
          onChange={(e) =>
            onChange({ destination_type: e.target.value as RoutingDestinationType })
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {DEST_TYPES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      {rule.destination_type === 'message' ? (
        <Textarea
          value={rule.markdown}
          onChange={(e) => onChange({ markdown: e.target.value })}
          rows={3}
          placeholder="Message shown to the visitor (supports **bold**)."
        />
      ) : (
        <Input
          value={rule.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder={
            rule.destination_type === 'event_link'
              ? '/meet/your-handle or /book/your-slug'
              : 'https://example.com'
          }
        />
      )}
    </div>
  );
}
