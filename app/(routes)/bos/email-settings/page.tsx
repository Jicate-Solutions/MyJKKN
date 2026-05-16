'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Save, Eye, RotateCcw, Code2, FileText, Info, Building2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { useBosInstitutionScope } from '@/hooks/bos/use-bos-institution-scope';
import { BOS_TEMPLATE_PLACEHOLDERS } from '@/lib/services/bos-email-templates';
import { logger } from '@/lib/utils/enhanced-logger';
import { SmtpConfigForm } from './_components/smtp-config-form';

interface InstitutionOption {
  id: string;
  name: string;
  institution_code: string;
  myjkkn_institution_ids: string[];
}

interface TemplateRow {
  id: string;
  institutions_id: string | null;
  template_code: string;
  template_name: string;
  description: string | null;
  subject: string;
  body_html: string;
  is_active: boolean;
}

const DEFAULT_TEMPLATE_CODE = 'meeting_invitation';

export default function EmailSettingsPage() {
  const scope = useBosBoardScope();
  const queryClient = useQueryClient();

  // Institution context — non-super-admins are locked to their own institution
  // (auto-scoped via scope.userInstitutionId). Super-admins can pick any
  // institution from the dropdown below.
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);

  // Load the list of institutions for the super-admin dropdown.
  const { data: institutionsList, isLoading: loadingInstitutions } = useQuery({
    queryKey: ['bos', 'institutions-list'],
    queryFn: async () => {
      const res = await fetch('/api/bos/institutions');
      if (!res.ok) throw new Error('Failed to load institutions');
      return res.json() as Promise<InstitutionOption[] | { data: InstitutionOption[] }>;
    },
    enabled: scope.isSuperAdmin,
    staleTime: 10 * 60 * 1000,
  });

  // The endpoint returns either an array or `{ data: [] }` — normalize.
  const institutions: InstitutionOption[] = Array.isArray(institutionsList)
    ? institutionsList
    : (institutionsList?.data ?? []);

  // For non-super-admins, the effective institution is their own profile's;
  // for super-admins, the one selected in the dropdown. Falls through to null
  // if neither is set — the form will show an instructive empty state.
  const institutionsId = scope.isSuperAdmin
    ? selectedInstitutionId
    : (scope.userInstitutionId ?? scope.institutionsId ?? null);

  // CAS-aware sibling resolution — shows a hint when the selected institution
  // is a CAS pair so the admin knows both Aided + SF will share the same row.
  const instScope = useBosInstitutionScope(institutionsId);

  const [templateCode, setTemplateCode] = useState<string>(DEFAULT_TEMPLATE_CODE);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [originalSubject, setOriginalSubject] = useState('');
  const [originalBody, setOriginalBody] = useState('');
  const [preview, setPreview] = useState<{ subject: string; body_html: string } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [isTestSending, setIsTestSending] = useState(false);

  // Load templates (per-institution + global fallback).
  const { data: templatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['bos', 'email-templates', institutionsId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionsId) params.set('institutionsId', institutionsId);
      const res = await fetch(`/api/bos/email-templates?${params}`);
      if (!res.ok) throw new Error('Failed to load templates');
      return res.json() as Promise<{ data: TemplateRow[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Pick the active template for the selected code. Per-institution wins
  // over global default.
  const activeTemplate = (() => {
    const rows = templatesData?.data ?? [];
    const filtered = rows.filter((r) => r.template_code === templateCode);
    const specific = filtered.find((r) => r.institutions_id === institutionsId);
    return specific ?? filtered.find((r) => r.institutions_id === null) ?? null;
  })();

  // Available codes from the loaded rows — de-duplicated.
  const availableCodes = Array.from(
    new Set((templatesData?.data ?? []).map((r) => r.template_code))
  );

  // Sync form state when the active template changes.
  useEffect(() => {
    if (activeTemplate) {
      setSubject(activeTemplate.subject);
      setBodyHtml(activeTemplate.body_html);
      setOriginalSubject(activeTemplate.subject);
      setOriginalBody(activeTemplate.body_html);
      setPreview(null);
    }
  }, [activeTemplate?.id, activeTemplate?.subject, activeTemplate?.body_html]);

  const isDirty = subject !== originalSubject || bodyHtml !== originalBody;

  const handleInsertPlaceholder = (key: string) => {
    // Insert into body by default; subject gets it when focused.
    const token = `{{${key}}}`;
    const bodyEl = document.getElementById('body_html') as HTMLTextAreaElement | null;
    if (bodyEl) {
      const start = bodyEl.selectionStart;
      const end = bodyEl.selectionEnd;
      const next = bodyHtml.slice(0, start) + token + bodyHtml.slice(end);
      setBodyHtml(next);
      // Move cursor right after the inserted token.
      requestAnimationFrame(() => {
        bodyEl.focus();
        bodyEl.selectionStart = bodyEl.selectionEnd = start + token.length;
      });
    } else {
      setBodyHtml((prev) => prev + token);
    }
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const res = await fetch('/api/bos/email-templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body_html: bodyHtml }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Failed to render preview');
      setPreview(body.data);
    } catch (err) {
      logger.error('academic/bos', 'Preview failed', err);
      toast.error((err as Error).message);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!activeTemplate) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/bos/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutions_id: institutionsId,
          template_code: activeTemplate.template_code,
          template_name: activeTemplate.template_name,
          description: activeTemplate.description,
          subject,
          body_html: bodyHtml,
          is_active: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Failed to save template');
      toast.success('Template saved');
      setOriginalSubject(subject);
      setOriginalBody(bodyHtml);
      queryClient.invalidateQueries({ queryKey: ['bos', 'email-templates'] });
    } catch (err) {
      logger.error('academic/bos', 'Save failed', err);
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSubject(originalSubject);
    setBodyHtml(originalBody);
    setPreview(null);
  };

  const handleTestSend = async () => {
    if (!testRecipient) return;
    setIsTestSending(true);
    try {
      const res = await fetch('/api/bos/email-templates/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_email: testRecipient,
          subject,
          body_html: bodyHtml,
          institutionsId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Failed to send test email');
      toast.success(body.message ?? 'Test email queued');
      setTestDialogOpen(false);
    } catch (err) {
      logger.error('academic/bos', 'Test send failed', err);
      toast.error((err as Error).message);
    } finally {
      setIsTestSending(false);
    }
  };

  // Permission gate — same set the API enforces.
  if (!scope.isLoading && !scope.isSuperAdmin && !scope.isPrincipal && scope.isChairmanIn.size === 0) {
    return (
      <div>
        <PageHeader
          title='Email Settings'
          description='Manage BoS email templates.'
        />
        <Alert variant='destructive' className='mt-6 max-w-2xl'>
          <AlertDescription>
            Only super-admin, principal, or board chairman can edit email templates.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Email Settings'
        description='Configure SMTP server and BoS notification email templates.'
      />

      {/* Super-admin institution picker — non-super-admins are auto-scoped. */}
      {scope.isSuperAdmin && (
        <Card>
          <CardContent className='p-4'>
            <div className='flex flex-col gap-2 md:flex-row md:items-end md:gap-4'>
              <div className='flex-1 space-y-1.5'>
                <Label className='flex items-center gap-1.5 text-xs font-medium'>
                  <Building2 className='h-3.5 w-3.5 text-muted-foreground' />
                  Institution
                </Label>
                <SearchableSelect
                  value={selectedInstitutionId ?? ''}
                  onValueChange={setSelectedInstitutionId}
                  options={institutions.map((i) => ({
                    value: i.id,
                    label: i.institution_code
                      ? `${i.name} (${i.institution_code})`
                      : i.name,
                  }))}
                  placeholder={
                    loadingInstitutions
                      ? 'Loading institutions…'
                      : institutions.length === 0
                        ? 'No institutions available'
                        : 'Select an institution to manage'
                  }
                  searchPlaceholder='Search institution…'
                  loading={loadingInstitutions}
                  disabled={loadingInstitutions || institutions.length === 0}
                  className='w-full'
                />
                {institutionsId && instScope.isCAS && (
                  <p className='text-[11px] text-muted-foreground'>
                    CAS pair — both Aided and Self-Financing share one SMTP row by
                    institution code.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue='smtp' className='space-y-6'>
        <TabsList>
          <TabsTrigger value='smtp'>SMTP Server</TabsTrigger>
          <TabsTrigger value='template'>Email Template</TabsTrigger>
        </TabsList>

        {/* ── SMTP Server tab ────────────────────────────────────────── */}
        <TabsContent value='smtp'>
          <SmtpConfigForm institutionsId={institutionsId} />
        </TabsContent>

        {/* ── Email Template tab ─────────────────────────────────────── */}
        <TabsContent value='template' className='space-y-6'>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setTestDialogOpen(true)}
              disabled={!activeTemplate}
            >
              <Send className='mr-2 h-3.5 w-3.5' />
              Send Test
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={handleReset}
              disabled={!isDirty}
            >
              <RotateCcw className='mr-2 h-3.5 w-3.5' />
              Discard changes
            </Button>
            <Button size='sm' onClick={handleSave} disabled={!isDirty || isSaving}>
              <Save className='mr-2 h-3.5 w-3.5' />
              {isSaving ? 'Saving…' : 'Save Template'}
            </Button>
          </div>

      {/* Template selector (one option for now; ready for more) */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Template</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTemplates ? (
            <Skeleton className='h-12 w-72' />
          ) : availableCodes.length === 0 ? (
            <Alert variant='destructive'>
              <AlertDescription>
                No templates found. Apply migration <code>20260516_bos_email_templates.sql</code> to seed defaults.
              </AlertDescription>
            </Alert>
          ) : (
            <div className='flex flex-wrap gap-2'>
              {availableCodes.map((code) => (
                <Button
                  key={code}
                  size='sm'
                  variant={code === templateCode ? 'default' : 'outline'}
                  onClick={() => setTemplateCode(code)}
                >
                  <FileText className='mr-2 h-3.5 w-3.5' />
                  {code}
                </Button>
              ))}
            </div>
          )}
          {activeTemplate?.description && (
            <p className='mt-3 text-xs text-muted-foreground'>{activeTemplate.description}</p>
          )}
        </CardContent>
      </Card>

      {activeTemplate && (
        <div className='grid grid-cols-1 gap-6 xl:grid-cols-3'>
          {/* Editor — col-span 2 */}
          <div className='space-y-4 xl:col-span-2'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Subject &amp; Body</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-2'>
                  <Label htmlFor='subject'>Subject</Label>
                  <Input
                    id='subject'
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder='Use {{placeholders}} from the sidebar →'
                  />
                  <p className='text-[11px] text-muted-foreground'>
                    {subject.length} char{subject.length === 1 ? '' : 's'}
                    {subject.length >= 70 && (
                      <span className='ml-2 text-amber-700 dark:text-amber-400'>
                        (long subjects may be truncated in inbox lists)
                      </span>
                    )}
                  </p>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='body_html' className='flex items-center gap-1.5'>
                    Body HTML
                    <Badge variant='outline' className='text-[10px]'>
                      <Code2 className='mr-1 h-3 w-3' /> HTML source
                    </Badge>
                  </Label>
                  <Textarea
                    id='body_html'
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    rows={20}
                    className='font-mono text-xs leading-relaxed'
                  />
                  <p className='text-[11px] text-muted-foreground'>
                    Inline CSS is supported. Use the &quot;Preview&quot; button below to render with mock data.
                  </p>
                </div>

                <Button
                  variant='outline'
                  size='sm'
                  onClick={handlePreview}
                  disabled={isPreviewing}
                >
                  <Eye className='mr-2 h-3.5 w-3.5' />
                  {isPreviewing ? 'Rendering…' : 'Preview with sample data'}
                </Button>
              </CardContent>
            </Card>

            {preview && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Preview</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='rounded-md border bg-muted/30 p-3 text-sm'>
                    <div className='text-[11px] uppercase tracking-wide text-muted-foreground'>Subject</div>
                    <div className='mt-1 font-medium'>{preview.subject}</div>
                  </div>
                  <Tabs defaultValue='rendered'>
                    <TabsList>
                      <TabsTrigger value='rendered'>Rendered</TabsTrigger>
                      <TabsTrigger value='source'>HTML source</TabsTrigger>
                    </TabsList>
                    <TabsContent value='rendered'>
                      <div
                        className='rounded-md border bg-white p-4 max-h-[600px] overflow-y-auto'
                        // PREVIEW ONLY — mock data, never user-supplied content from external sources
                        dangerouslySetInnerHTML={{ __html: preview.body_html }}
                      />
                    </TabsContent>
                    <TabsContent value='source'>
                      <pre className='max-h-[600px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono'>
                        {preview.body_html}
                      </pre>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Placeholder sidebar — col-span 1 */}
          <aside className='xl:col-span-1'>
            <div className='space-y-4 xl:sticky xl:top-6'>
              <Card>
                <CardHeader>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <Info className='h-4 w-4 text-muted-foreground' />
                    Placeholders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-xs text-muted-foreground mb-3'>
                    Click to insert a placeholder at the cursor position. Unknown placeholders
                    will appear as-is in the rendered email.
                  </p>
                  <div className='space-y-2'>
                    {BOS_TEMPLATE_PLACEHOLDERS.map((p) => (
                      <button
                        key={p.key}
                        type='button'
                        onClick={() => handleInsertPlaceholder(p.key)}
                        className='w-full text-left rounded-md border p-2 hover:bg-muted/50 transition-colors'
                      >
                        <code className='text-[11px] font-mono text-primary'>
                          {`{{${p.key}}}`}
                        </code>
                        <div className='text-xs font-medium mt-0.5'>{p.label}</div>
                        <div className='text-[11px] text-muted-foreground leading-snug mt-0.5'>
                          {p.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </aside>
        </div>
      )}
        </TabsContent>
      </Tabs>

      {/* ── Test Send Dialog ──────────────────────────────────────────── */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className='max-w-sm'>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Queues a single email to the address below using your current draft. Subject is
              prefixed with <code>[TEST]</code>.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2 py-2'>
            <Label htmlFor='test_recipient'>Recipient Email</Label>
            <Input
              id='test_recipient'
              type='email'
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder='you@example.org'
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setTestDialogOpen(false)} disabled={isTestSending}>
              Cancel
            </Button>
            <Button
              onClick={handleTestSend}
              disabled={!testRecipient || !testRecipient.includes('@') || isTestSending}
            >
              {isTestSending ? 'Sending…' : 'Send Test'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
