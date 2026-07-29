'use client';

import { Suspense, useEffect, useState } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Save, Eye, RotateCcw, Code2, FileText, Info, CalendarClock, Layers, FileSignature } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { BoardSendersForm } from './_components/board-senders-form';
import { LetterheadAssetsForm } from './_components/letterhead-assets-form';
import { InstitutionPicker } from '../_components/institution-picker';

interface TemplateRow {
  id: string;
  institutions_id: string | null;
  template_code: string;
  template_name: string;
  description: string | null;
  subject: string;
  body_html: string;
  is_active: boolean;
  // Per-committee + versioning fields (20260724140000)
  body_type_code: string | null;
  effective_from: string | null;
  pdf_heading: string | null;
  pdf_intro_html: string | null;
  pdf_closing_html: string | null;
  reply_to_email: string | null;
  signoff_html: string | null;
}

interface BodyTypeRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
}

const DEFAULT_TEMPLATE_CODE = 'meeting_invitation';
const DEFAULT_BODY_TYPE = 'BOS';

// A version is "active now" if it's the newest whose effective_from ≤ today.
function classifyVersion(
  effectiveFrom: string | null,
  isNewestInEffect: boolean,
  todayIso: string,
): { label: string; tone: 'active' | 'upcoming' | 'past' } {
  if (effectiveFrom && effectiveFrom > todayIso) return { label: 'Upcoming', tone: 'upcoming' };
  if (isNewestInEffect) return { label: 'Active now', tone: 'active' };
  return { label: 'Superseded', tone: 'past' };
}

const EMAIL_SETTINGS_TABS = ['smtp', 'template'] as const;

function EmailSettingsPageInner() {
  const scope = useBosBoardScope();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useTabParam('smtp', EMAIL_SETTINGS_TABS);

  // Institution context — powered by the shared InstitutionPicker, backed by
  // /api/institutions/resolve (cached + resilient). This replaces the legacy
  // /api/bos/institutions COE proxy that intermittently 404'd when COE's
  // /api/v1/institutions response was unstable, leaving this page's dropdown
  // empty. The picker auto-selects the caller's own institution for non-admins
  // and lets super-admins / read-all observers choose any.
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | undefined>(undefined);

  const institutionsId = selectedInstitutionId ?? null;

  // CAS-aware sibling resolution — shows a hint when the selected institution
  // is a CAS pair so the admin knows both Aided + SF will share the same row.
  const instScope = useBosInstitutionScope(institutionsId);

  const [templateCode, setTemplateCode] = useState<string>(DEFAULT_TEMPLATE_CODE);
  const [bodyTypeCode, setBodyTypeCode] = useState<string>(DEFAULT_BODY_TYPE);
  // Which version row is loaded in the editor (null = newest for this body).
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  // Per-committee format fields.
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [pdfHeading, setPdfHeading] = useState('');
  const [pdfIntro, setPdfIntro] = useState('');
  const [pdfClosing, setPdfClosing] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [signoffHtml, setSignoffHtml] = useState('');
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

  // Load the body-type catalog (the 9 governing bodies) for the picker.
  const { data: bodyTypesData } = useQuery({
    queryKey: ['bos', 'body-types'],
    queryFn: async () => {
      const res = await fetch('/api/bos/body-types');
      if (!res.ok) throw new Error('Failed to load body types');
      return res.json() as Promise<{ data: BodyTypeRow[] }>;
    },
    staleTime: 30 * 60 * 1000,
  });
  const bodyTypes = bodyTypesData?.data ?? [];

  const todayIso = new Date().toISOString().slice(0, 10);

  // Available template codes from the loaded rows — de-duplicated.
  const availableCodes = Array.from(
    new Set((templatesData?.data ?? []).map((r) => r.template_code))
  );

  // All versions for the selected (code, body). Prefer this institution's own
  // rows; fall back to the global defaults (institutions_id NULL) when the
  // institution has no override yet. Newest effective_from first.
  const versions = (() => {
    const rows = (templatesData?.data ?? []).filter(
      (r) => r.template_code === templateCode && (r.body_type_code ?? DEFAULT_BODY_TYPE) === bodyTypeCode,
    );
    const own = rows.filter((r) => r.institutions_id === institutionsId);
    const scoped = own.length > 0 ? own : rows.filter((r) => r.institutions_id === null);
    return [...scoped].sort((a, b) =>
      (b.effective_from ?? '').localeCompare(a.effective_from ?? ''),
    );
  })();

  // The newest version already in effect today (drives the "Active now" badge).
  const activeNowId = versions.find((v) => (v.effective_from ?? '') <= todayIso)?.id ?? null;

  // The version loaded in the editor: the explicitly-selected one, else newest.
  const activeTemplate =
    versions.find((v) => v.id === selectedVersionId) ?? versions[0] ?? null;

  // Are we editing a GLOBAL default (no institution override for this body yet)?
  // Saving then creates the institution's first override.
  const editingGlobal = activeTemplate?.institutions_id === null && institutionsId != null;

  // Sync form state when the active version changes.
  useEffect(() => {
    if (activeTemplate) {
      setSubject(activeTemplate.subject);
      setBodyHtml(activeTemplate.body_html);
      setOriginalSubject(activeTemplate.subject);
      setOriginalBody(activeTemplate.body_html);
      setEffectiveFrom(activeTemplate.effective_from ?? todayIso);
      setPdfHeading(activeTemplate.pdf_heading ?? '');
      setPdfIntro(activeTemplate.pdf_intro_html ?? '');
      setPdfClosing(activeTemplate.pdf_closing_html ?? '');
      setReplyTo(activeTemplate.reply_to_email ?? '');
      setSignoffHtml(activeTemplate.signoff_html ?? '');
      setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate?.id]);

  // Reset the selected version when the code/body/institution context changes so
  // the newest version loads by default.
  useEffect(() => {
    setSelectedVersionId(null);
  }, [templateCode, bodyTypeCode, institutionsId]);

  // Dirty if any editable field diverges, or the effective date differs from the
  // loaded version (a new date will create a new version on save).
  const isDirty =
    subject !== originalSubject ||
    bodyHtml !== originalBody ||
    (activeTemplate != null &&
      (effectiveFrom !== (activeTemplate.effective_from ?? todayIso) ||
        pdfHeading !== (activeTemplate.pdf_heading ?? '') ||
        pdfIntro !== (activeTemplate.pdf_intro_html ?? '') ||
        pdfClosing !== (activeTemplate.pdf_closing_html ?? '') ||
        replyTo !== (activeTemplate.reply_to_email ?? '') ||
        signoffHtml !== (activeTemplate.signoff_html ?? ''))) ||
    editingGlobal;

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
          body_type_code: bodyTypeCode,
          effective_from: effectiveFrom || todayIso,
          pdf_heading: pdfHeading,
          pdf_intro_html: pdfIntro,
          pdf_closing_html: pdfClosing,
          reply_to_email: replyTo,
          signoff_html: signoffHtml,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Failed to save template');
      toast.success(
        effectiveFrom && effectiveFrom !== (activeTemplate.effective_from ?? todayIso)
          ? `Saved — new version effective ${effectiveFrom}`
          : 'Format saved',
      );
      setOriginalSubject(subject);
      setOriginalBody(bodyHtml);
      // Load whatever version is newest after the save (the one just written).
      setSelectedVersionId(null);
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
    if (activeTemplate) {
      setEffectiveFrom(activeTemplate.effective_from ?? todayIso);
      setPdfHeading(activeTemplate.pdf_heading ?? '');
      setPdfIntro(activeTemplate.pdf_intro_html ?? '');
      setPdfClosing(activeTemplate.pdf_closing_html ?? '');
      setReplyTo(activeTemplate.reply_to_email ?? '');
      setSignoffHtml(activeTemplate.signoff_html ?? '');
    }
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

      {/* Institution picker — shared, resilient (/api/institutions/resolve).
          Auto-selects the caller's own institution for non-admins; super-admins
          (and read-all observers) pick any. Replaces the legacy flaky
          /api/bos/institutions proxy that left this dropdown empty on COE hiccups. */}
      <Card>
        <CardContent className='p-4'>
          <div className='space-y-1.5'>
            <InstitutionPicker
              value={selectedInstitutionId}
              onChange={setSelectedInstitutionId}
              allowAllInstitutions={scope.isSuperAdmin}
              className='w-full md:w-[420px]'
            />
            {institutionsId && instScope.isCAS && (
              <p className='text-[11px] text-muted-foreground'>
                CAS pair — both Aided and Self-Financing share one SMTP row by
                institution code.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className='space-y-6'>
        <TabsList>
          <TabsTrigger value='smtp'>SMTP Server</TabsTrigger>
          <TabsTrigger value='template'>Email Template</TabsTrigger>
        </TabsList>

        {/* ── SMTP Server tab ────────────────────────────────────────── */}
        <TabsContent value='smtp' className='space-y-6'>
          <SmtpConfigForm institutionsId={institutionsId} />
          <BoardSendersForm institutionsId={institutionsId} />
          <LetterheadAssetsForm institutionsId={institutionsId} />
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

      {/* Governing body + template + version selector */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base flex items-center gap-2'>
            <Layers className='h-4 w-4 text-muted-foreground' />
            Committee &amp; Version
          </CardTitle>
          <CardDescription className='text-xs'>
            Pick the governing body, then edit its email + call-letter format. Changes you save under a
            future “Effective from” date create a new version — meetings scheduled before that date keep
            the current format.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {loadingTemplates ? (
            <Skeleton className='h-12 w-72' />
          ) : availableCodes.length === 0 ? (
            <Alert variant='destructive'>
              <AlertDescription>
                No templates found. Apply migrations <code>20260516_bos_email_templates.sql</code> and{' '}
                <code>20260724140000_bos_per_committee_email_formats.sql</code> to seed defaults.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Body-type picker */}
              <div className='space-y-1.5'>
                <Label className='text-xs text-muted-foreground'>Governing body</Label>
                <div className='flex flex-wrap gap-2'>
                  {bodyTypes.map((bt) => (
                    <Button
                      key={bt.code}
                      size='sm'
                      variant={bt.code === bodyTypeCode ? 'default' : 'outline'}
                      onClick={() => setBodyTypeCode(bt.code)}
                      title={bt.name}
                    >
                      {bt.code}
                    </Button>
                  ))}
                </div>
                {bodyTypes.find((b) => b.code === bodyTypeCode) && (
                  <p className='text-[11px] text-muted-foreground'>
                    {bodyTypes.find((b) => b.code === bodyTypeCode)!.name}
                    {editingGlobal && (
                      <span className='ml-2 text-amber-700 dark:text-amber-400'>
                        No override yet — editing the global default. Saving creates this institution&apos;s
                        own {bodyTypeCode} format.
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Template code (only when more than one purpose exists) */}
              {availableCodes.length > 1 && (
                <div className='space-y-1.5'>
                  <Label className='text-xs text-muted-foreground'>Template</Label>
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
                </div>
              )}

              {/* Version history */}
              {versions.length > 0 && (
                <div className='space-y-1.5'>
                  <Label className='text-xs text-muted-foreground'>Version history (by effective date)</Label>
                  <div className='flex flex-wrap gap-2'>
                    {versions.map((v) => {
                      const cls = classifyVersion(v.effective_from, v.id === activeNowId, todayIso);
                      const selected = v.id === activeTemplate?.id;
                      return (
                        <button
                          key={v.id}
                          type='button'
                          onClick={() => setSelectedVersionId(v.id)}
                          className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                            selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className='flex items-center gap-1.5 font-medium'>
                            <CalendarClock className='h-3 w-3' />
                            {v.effective_from ?? '—'}
                          </div>
                          <span
                            className={`text-[10px] ${
                              cls.tone === 'active'
                                ? 'text-green-700 dark:text-green-400'
                                : cls.tone === 'upcoming'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {cls.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          {activeTemplate?.description && (
            <p className='text-xs text-muted-foreground'>{activeTemplate.description}</p>
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

            {/* Call letter (PDF) + reply-to + sign-off — per body */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base flex items-center gap-2'>
                  <FileSignature className='h-4 w-4 text-muted-foreground' />
                  Call Letter (PDF), Reply-to &amp; Sign-off
                </CardTitle>
                <CardDescription className='text-xs'>
                  These override the attached PDF&apos;s text for this body. Leave a field blank to keep the
                  system default wording. Placeholders like <code>{'{{meeting_date}}'}</code> work here too.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-2'>
                  <Label htmlFor='pdf_heading'>PDF Heading (Sub: line)</Label>
                  <Input
                    id='pdf_heading'
                    value={pdfHeading}
                    onChange={(e) => setPdfHeading(e.target.value)}
                    placeholder='Meeting of the Department Advisory Board - Intimation - Reg.'
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='pdf_intro'>PDF Intro paragraph (HTML)</Label>
                  <Textarea
                    id='pdf_intro'
                    value={pdfIntro}
                    onChange={(e) => setPdfIntro(e.target.value)}
                    rows={4}
                    className='font-mono text-xs'
                    placeholder='We are happy to invite you for the {{meeting_title}} on {{meeting_date}}…'
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='pdf_closing'>PDF Closing paragraph (HTML)</Label>
                  <Textarea
                    id='pdf_closing'
                    value={pdfClosing}
                    onChange={(e) => setPdfClosing(e.target.value)}
                    rows={3}
                    className='font-mono text-xs'
                    placeholder='Kindly accept our invitation and offer your valuable suggestions.'
                  />
                </div>
                <div className='grid gap-4 md:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label htmlFor='reply_to'>Reply-to email</Label>
                    <Input
                      id='reply_to'
                      type='email'
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                      placeholder='dab.bos@jkkn.ac.in'
                    />
                    <p className='text-[11px] text-muted-foreground'>
                      Rewrites the “inform us through mail at …” link in the email for this body.
                    </p>
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='signoff_html'>PDF Sign-off text (HTML)</Label>
                    <Textarea
                      id='signoff_html'
                      value={signoffHtml}
                      onChange={(e) => setSignoffHtml(e.target.value)}
                      rows={3}
                      className='font-mono text-xs'
                      placeholder='Chairman, Department Advisory Board'
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Effective-from — controls versioning on Save */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base flex items-center gap-2'>
                  <CalendarClock className='h-4 w-4 text-muted-foreground' />
                  Effective from
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                <Input
                  id='effective_from'
                  type='date'
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className='w-56'
                />
                <p className='text-[11px] text-muted-foreground'>
                  Meetings scheduled on/after this date use this format. Keep the current date to edit this
                  version in place; pick a <strong>future</strong> date and Save to publish a new version
                  while leaving older meetings on the existing format.
                </p>
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

export default function EmailSettingsPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <EmailSettingsPageInner />
    </Suspense>
  );
}
