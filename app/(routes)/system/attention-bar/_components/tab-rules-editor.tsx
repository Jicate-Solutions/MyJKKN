'use client';

/**
 * Tab 3 - Rule editor (slide-in Sheet)
 *
 * Used by tab-rules.tsx for both create and update.
 * Wraps POST /api/attention-bar/admin/rules and PATCH /api/attention-bar/admin/rules/[id].
 *
 * JSON editing:
 *  - when_clause + action_template are entered as raw JSON strings
 *  - validated on blur via JSON.parse round-trip; format errors disable Save
 *  - action_template gets a live preview rendered by renderActionTemplate
 *    with a small mock state so authors can sanity-check placeholders
 *
 * Sandbox shortcut: Test button opens Tab 7 (sandbox) in a new view with
 * the rule context pre-loaded via querystring.
 *
 * Spec: specs/attention-bar-5-layer-system.md section 6 Tab 3
 * Permission: attention_bar.rules.manage (enforced server-side)
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, FlaskConical, Save, X } from 'lucide-react';
import { renderActionTemplate } from '@/lib/attention-bar/action-template-renderer';
import type { ActionTemplate } from '@/lib/attention-bar/types';

export interface AttentionBarRule {
  id: string;
  rule_name: string;
  description: string | null;
  page: string;
  role: string;
  when_clause: Record<string, unknown> | null;
  action_template: Record<string, unknown> | null;
  priority: number;
  is_active: boolean;
  institution_id: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

interface TabRulesEditorProps {
  open: boolean;
  rule: AttentionBarRule | null;
  onClose: (saved: boolean) => void;
}

const ROLE_OPTIONS = [
  { value: '*', label: 'Any role (*)' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'admission', label: 'Admission' },
  { value: 'admission_staff', label: 'Admission Staff' },
  { value: 'counselor', label: 'Counselor' },
  { value: 'hod', label: 'HOD' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'student', label: 'Student' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'staff', label: 'Staff' },
];

const DEFAULT_WHEN_CLAUSE = `{
  "and": [
    { ">=": [{ "var": "counselor.pending_leads.count" }, 1] }
  ]
}`;

const DEFAULT_ACTION_TEMPLATE = `{
  "id": "L2.example",
  "label": "Resume lead #{state.counselor.pending_leads.oldest_lead_id}",
  "context": "Last touched {state.counselor.pending_leads.oldest_lead_days} days ago",
  "tone": "amber",
  "cta": "Open",
  "icon": "PhoneCall",
  "href": "/admission/leads/{state.counselor.pending_leads.oldest_lead_id}"
}`;

/** Mock state used by the live action_template preview. */
const MOCK_PREVIEW_STATE: Record<string, unknown> = {
  counselor: {
    pending_leads: {
      count: 3,
      oldest_lead_id: 'demo-lead-uuid',
      oldest_lead_days: 7,
    },
  },
  attendance: {
    unmarked_periods_today: { count: 2, first_period_id: 'p1' },
  },
};

interface JsonField {
  raw: string;
  parsed: Record<string, unknown> | null;
  error: string | null;
}

function parseJsonField(raw: string): JsonField {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { raw, parsed: null, error: 'Required' };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        raw,
        parsed: null,
        error: 'Must be a JSON object',
      };
    }
    return { raw, parsed, error: null };
  } catch (err) {
    return {
      raw,
      parsed: null,
      error: err instanceof Error ? err.message : 'Invalid JSON',
    };
  }
}

interface SaveBody {
  rule_name: string;
  description: string | null;
  page: string;
  role: string;
  when_clause: Record<string, unknown>;
  action_template: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  institution_id: string | null;
}

async function saveRule(
  ruleId: string | null,
  body: SaveBody,
): Promise<AttentionBarRule> {
  const url = ruleId
    ? `/api/attention-bar/admin/rules/${ruleId}`
    : '/api/attention-bar/admin/rules';
  const method = ruleId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error ?? 'Save failed');
  }
  return json.rule as AttentionBarRule;
}

export function TabRulesEditor({ open, rule, onClose }: TabRulesEditorProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();

  // Form state
  const [ruleName, setRuleName] = useState('');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState('');
  const [role, setRole] = useState('*');
  const [priority, setPriority] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [institutionId, setInstitutionId] = useState('');

  const [whenJson, setWhenJson] = useState<JsonField>({
    raw: DEFAULT_WHEN_CLAUSE,
    parsed: null,
    error: null,
  });
  const [actionJson, setActionJson] = useState<JsonField>({
    raw: DEFAULT_ACTION_TEMPLATE,
    parsed: null,
    error: null,
  });

  // Reset form whenever the rule prop changes (or editor opens fresh).
  useEffect(() => {
    if (!open) return;

    if (rule) {
      setRuleName(rule.rule_name ?? '');
      setDescription(rule.description ?? '');
      setPage(rule.page ?? '');
      setRole(rule.role ?? '*');
      setPriority(String(rule.priority ?? 0));
      setIsActive(rule.is_active ?? true);
      setInstitutionId(rule.institution_id ?? '');
      const whenStr = JSON.stringify(rule.when_clause ?? {}, null, 2);
      const actionStr = JSON.stringify(rule.action_template ?? {}, null, 2);
      setWhenJson(parseJsonField(whenStr));
      setActionJson(parseJsonField(actionStr));
    } else {
      setRuleName('');
      setDescription('');
      setPage('');
      setRole('*');
      setPriority('0');
      setIsActive(true);
      setInstitutionId('');
      setWhenJson(parseJsonField(DEFAULT_WHEN_CLAUSE));
      setActionJson(parseJsonField(DEFAULT_ACTION_TEMPLATE));
    }
  }, [rule, open]);

  // Live preview of the rendered action_template. Null when JSON is bad
  // or required fields are missing.
  const previewAction: ActionTemplate | null = useMemo(() => {
    if (!actionJson.parsed) return null;
    try {
      return renderActionTemplate({
        template: actionJson.parsed,
        state: MOCK_PREVIEW_STATE,
        ruleId: rule?.id ?? 'preview',
        silent: true,
      });
    } catch {
      return null;
    }
  }, [actionJson.parsed, rule?.id]);

  const formErrors = useMemo(() => {
    const errs: string[] = [];
    if (!ruleName.trim()) errs.push('Rule name is required');
    if (!page.trim()) errs.push('Page is required');
    if (!role.trim()) errs.push('Role is required');
    if (whenJson.error) errs.push(`When clause: ${whenJson.error}`);
    if (actionJson.error) errs.push(`Action template: ${actionJson.error}`);
    if (Number.isNaN(Number(priority))) errs.push('Priority must be a number');
    return errs;
  }, [ruleName, page, role, priority, whenJson.error, actionJson.error]);

  const canSave = formErrors.length === 0 && !!whenJson.parsed && !!actionJson.parsed;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!whenJson.parsed || !actionJson.parsed) {
        throw new Error('Invalid JSON in form');
      }
      return saveRule(rule?.id ?? null, {
        rule_name: ruleName.trim(),
        description: description.trim() || null,
        page: page.trim(),
        role: role.trim(),
        when_clause: whenJson.parsed,
        action_template: actionJson.parsed,
        priority: Number(priority) || 0,
        is_active: isActive,
        institution_id: institutionId.trim() || null,
      });
    },
    onSuccess: (saved) => {
      toast({
        title: rule ? 'Rule updated' : 'Rule created',
        description: saved.rule_name,
      });
      queryClient.invalidateQueries({ queryKey: ['attention-bar-rules'] });
      onClose(true);
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });

  function handleTestInSandbox() {
    if (!whenJson.parsed || !actionJson.parsed) {
      toast({
        variant: 'destructive',
        title: 'Cannot test',
        description: 'Fix JSON errors before opening the sandbox.',
      });
      return;
    }
    const params = new URLSearchParams({
      tab: 'sandbox',
      page: page.trim() || '/',
      role: role.trim() || '*',
      ...(rule?.id ? { rule_id: rule.id } : {}),
    });
    router.push(`/system/attention-bar?${params.toString()}`);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose(false)}>
      <SheetContent
        side='right'
        className='w-full sm:max-w-2xl overflow-y-auto'
      >
        <SheetHeader>
          <SheetTitle className='flex items-center gap-2'>
            {rule ? 'Edit rule' : 'New rule'}
          </SheetTitle>
          <SheetDescription>
            Layer 2 rules fire when their <code>when_clause</code> matches the
            user&apos;s page + role + state. The <code>action_template</code> is
            rendered with state placeholders.
          </SheetDescription>
        </SheetHeader>

        <div className='space-y-4 py-4'>
          {/* Metadata */}
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <div>
              <Label htmlFor='rule_name'>Name</Label>
              <Input
                id='rule_name'
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder='counselor.resume_pending_lead'
              />
            </div>
            <div>
              <Label htmlFor='priority'>Priority</Label>
              <Input
                id='priority'
                type='number'
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder='0'
              />
            </div>
          </div>

          <div>
            <Label htmlFor='description'>Description</Label>
            <Textarea
              id='description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Short note for other admins'
              rows={2}
            />
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <div>
              <Label htmlFor='page'>Page</Label>
              <Input
                id='page'
                value={page}
                onChange={(e) => setPage(e.target.value)}
                placeholder='/admission/leads or *'
              />
              <p className='text-xs text-muted-foreground mt-1'>
                Pathname only. Use <code>*</code> for any page.
              </p>
            </div>
            <div>
              <Label htmlFor='role'>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id='role'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 items-end'>
            <div>
              <Label htmlFor='institution_id'>
                Institution ID (optional)
              </Label>
              <Input
                id='institution_id'
                value={institutionId}
                onChange={(e) => setInstitutionId(e.target.value)}
                placeholder='UUID or blank for all institutions'
              />
            </div>
            <div className='flex items-center gap-3 pb-1'>
              <Switch
                id='is_active'
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor='is_active' className='cursor-pointer'>
                Active
              </Label>
            </div>
          </div>

          {/* When clause JSON */}
          <div>
            <div className='flex items-center justify-between mb-1'>
              <Label htmlFor='when_clause'>When clause (JsonLogic)</Label>
              {whenJson.error && (
                <span className='text-xs text-destructive flex items-center gap-1'>
                  <AlertCircle className='h-3 w-3' /> {whenJson.error}
                </span>
              )}
            </div>
            <Textarea
              id='when_clause'
              value={whenJson.raw}
              onChange={(e) =>
                setWhenJson({ raw: e.target.value, parsed: whenJson.parsed, error: whenJson.error })
              }
              onBlur={() => setWhenJson(parseJsonField(whenJson.raw))}
              rows={8}
              className={`font-mono text-xs ${
                whenJson.error ? 'border-destructive' : ''
              }`}
              spellCheck={false}
            />
          </div>

          {/* Action template JSON + preview */}
          <div>
            <div className='flex items-center justify-between mb-1'>
              <Label htmlFor='action_template'>Action template</Label>
              {actionJson.error && (
                <span className='text-xs text-destructive flex items-center gap-1'>
                  <AlertCircle className='h-3 w-3' /> {actionJson.error}
                </span>
              )}
            </div>
            <Textarea
              id='action_template'
              value={actionJson.raw}
              onChange={(e) =>
                setActionJson({
                  raw: e.target.value,
                  parsed: actionJson.parsed,
                  error: actionJson.error,
                })
              }
              onBlur={() => setActionJson(parseJsonField(actionJson.raw))}
              rows={10}
              className={`font-mono text-xs ${
                actionJson.error ? 'border-destructive' : ''
              }`}
              spellCheck={false}
            />
            <p className='text-xs text-muted-foreground mt-1'>
              Use <code>{'{state.<path>}'}</code> placeholders. Preview below
              uses a mock state.
            </p>

            {/* Live preview */}
            <Card className='mt-2 border-dashed'>
              <CardContent className='py-3'>
                <p className='text-xs uppercase tracking-wide text-muted-foreground mb-1'>
                  Preview (mock state)
                </p>
                {previewAction ? (
                  <div className='flex items-center gap-3 text-sm'>
                    <Badge variant='secondary'>{previewAction.tone}</Badge>
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium truncate'>
                        {previewAction.label}
                      </div>
                      {previewAction.context && (
                        <div className='text-xs text-muted-foreground truncate'>
                          {previewAction.context}
                        </div>
                      )}
                    </div>
                    <Badge variant='outline' className='font-mono text-xs'>
                      {previewAction.cta}
                    </Badge>
                  </div>
                ) : (
                  <p className='text-xs text-muted-foreground italic'>
                    {actionJson.error
                      ? 'Fix JSON errors to see preview.'
                      : 'Template missing label or cta.'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {formErrors.length > 0 && (
            <Card className='border-destructive'>
              <CardContent className='py-3'>
                <p className='text-xs font-medium text-destructive mb-1'>
                  Fix the following before saving:
                </p>
                <ul className='text-xs text-destructive list-disc pl-5 space-y-0.5'>
                  {formErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <SheetFooter className='gap-2 sm:gap-2'>
          <Button
            variant='outline'
            onClick={handleTestInSandbox}
            disabled={!whenJson.parsed || !actionJson.parsed}
          >
            <FlaskConical className='h-4 w-4 mr-1' /> Test in sandbox
          </Button>
          <div className='flex-1' />
          <Button variant='ghost' onClick={() => onClose(false)}>
            <X className='h-4 w-4 mr-1' /> Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
          >
            <Save className='h-4 w-4 mr-1' />
            {saveMutation.isPending ? 'Saving...' : rule ? 'Save changes' : 'Create rule'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
