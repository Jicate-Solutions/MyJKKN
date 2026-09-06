'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Plug, Eye, EyeOff, CheckCircle2, XCircle, Server } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Common provider presets — one-click fill, per spec §4.1 ────────────────
const PRESETS = [
  { name: 'Gmail',      host: 'smtp.gmail.com',        port: 587, secure: true,  hint: 'Requires App Password (not your account password)' },
  { name: 'Office 365', host: 'smtp.office365.com',    port: 587, secure: true },
  { name: 'AWS SES',    host: 'email-smtp.<region>.amazonaws.com', port: 587, secure: true, hint: 'Replace <region> with your AWS region' },
  { name: 'Custom',     host: '',                      port: 587, secure: true },
];

const PASSWORD_MASK = '••••••••';

interface SmtpConfigRow {
  id?: string;
  institution_code: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password_encrypted: string;
  sender_email: string;
  sender_name: string;
  ac_sender_email: string | null;
  ac_sender_name: string | null;
  default_cc_emails: string[] | null;
  is_active: boolean;
}

interface SmtpConfigFormProps {
  institutionsId: string | null;
}

const EMPTY_FORM = {
  smtp_host: '',
  smtp_port: 587,
  smtp_secure: true,
  smtp_user: '',
  smtp_password: '',
  sender_email: '',
  sender_name: 'Controller of Examinations',
  ac_sender_email: '',
  ac_sender_name: '',
  default_cc_csv: '',
  is_active: true,
};

export function SmtpConfigForm({ institutionsId }: SmtpConfigFormProps) {
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string; elapsedMs?: number } | null
  >(null);
  const [isTesting, setIsTesting] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);

  const { data: existing, isLoading } = useQuery({
    queryKey: ['bos', 'smtp-config', institutionsId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionsId) params.set('institutionsId', institutionsId);
      const res = await fetch(`/api/bos/smtp-config?${params}`);
      if (!res.ok) throw new Error('Failed to load SMTP config');
      return res.json() as Promise<{ data: SmtpConfigRow | null }>;
    },
    enabled: !!institutionsId,
    staleTime: 5 * 60 * 1000,
  });

  // Seed the form from the loaded row.
  useEffect(() => {
    const row = existing?.data;
    if (row) {
      setForm({
        smtp_host: row.smtp_host ?? '',
        smtp_port: row.smtp_port ?? 587,
        smtp_secure: row.smtp_secure ?? true,
        smtp_user: row.smtp_user ?? '',
        // Server returns the mask if a password exists; leave the form
        // showing the mask so the admin can edit other fields without
        // re-typing the secret.
        smtp_password: row.smtp_password_encrypted ?? '',
        sender_email: row.sender_email ?? '',
        sender_name: row.sender_name ?? 'Controller of Examinations',
        ac_sender_email: row.ac_sender_email ?? '',
        ac_sender_name: row.ac_sender_name ?? '',
        default_cc_csv: (row.default_cc_emails ?? []).join(', '),
        is_active: row.is_active ?? true,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [existing?.data?.id, existing?.data]);

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setForm((f) => ({
      ...f,
      smtp_host: preset.host,
      smtp_port: preset.port,
      smtp_secure: preset.secure,
    }));
    if (preset.hint) toast(`Preset: ${preset.hint}`);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/bos/smtp-config/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp_host: form.smtp_host,
          smtp_port: form.smtp_port,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Test failed');
      setTestResult({
        ok: body.success,
        message: body.message,
        elapsedMs: body.elapsedMs,
      });
      if (body.success) toast.success(`Reachable in ${body.elapsedMs}ms`);
      else toast.error(body.message);
    } catch (err) {
      logger.error('academic/bos', 'SMTP test failed', err);
      setTestResult({ ok: false, message: (err as Error).message });
      toast.error((err as Error).message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!institutionsId) {
      toast.error('No institution context — cannot save');
      return;
    }
    setIsSaving(true);
    try {
      const ccList = form.default_cc_csv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/bos/smtp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionsId,
          smtp_host: form.smtp_host,
          smtp_port: form.smtp_port,
          smtp_secure: form.smtp_secure,
          smtp_user: form.smtp_user,
          smtp_password: form.smtp_password,
          sender_email: form.sender_email,
          sender_name: form.sender_name,
          ac_sender_email: form.ac_sender_email,
          ac_sender_name: form.ac_sender_name,
          default_cc_emails: ccList.length > 0 ? ccList : undefined,
          is_active: form.is_active,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Save failed');
      toast.success('SMTP configuration saved');
      queryClient.invalidateQueries({ queryKey: ['bos', 'smtp-config'] });
      // Reset password field to mask after save (since it's now stored).
      setForm((f) => ({ ...f, smtp_password: PASSWORD_MASK }));
      setShowPassword(false);
    } catch (err) {
      logger.error('academic/bos', 'SMTP save failed', err);
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!institutionsId) {
    return (
      <Alert>
        <AlertDescription>
          No institution context. Super-admins should select an institution to manage its SMTP.
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className='space-y-4'>
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className='h-14 w-full' />)}
      </div>
    );
  }

  const hasExisting = !!existing?.data;
  // When the form's password field equals the mask, we're not changing the
  // stored value — useful hint for the admin.
  const passwordIsMask = form.smtp_password === PASSWORD_MASK;

  return (
    <div className='space-y-6'>
      {/* Provider presets */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm font-semibold'>Provider Presets</CardTitle>
          <CardDescription className='text-xs'>
            Click to pre-fill host, port, and TLS. You'll still need to enter the username,
            password, and sender details below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex flex-wrap gap-2'>
            {PRESETS.map((p) => (
              <Button key={p.name} size='sm' variant='outline' onClick={() => applyPreset(p)}>
                <Server className='mr-2 h-3.5 w-3.5' />
                {p.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Server settings */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm font-semibold'>Server</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-[2fr,1fr,auto]'>
            <div className='space-y-2'>
              <Label htmlFor='smtp_host'>SMTP Host *</Label>
              <Input
                id='smtp_host'
                value={form.smtp_host}
                onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
                placeholder='smtp.gmail.com'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='smtp_port'>Port *</Label>
              <Input
                id='smtp_port'
                type='number'
                min={1}
                max={65535}
                value={form.smtp_port}
                onChange={(e) =>
                  setForm((f) => ({ ...f, smtp_port: parseInt(e.target.value || '587', 10) }))
                }
              />
            </div>
            <div className='space-y-2'>
              <Label className='whitespace-nowrap'>Secure (TLS)</Label>
              <div className='flex h-10 items-center'>
                <Switch
                  checked={form.smtp_secure}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, smtp_secure: v }))}
                />
              </div>
            </div>
          </div>

          {/* Test connection — TCP reachability only */}
          <div className='flex items-center gap-3'>
            <Button
              size='sm'
              variant='outline'
              onClick={handleTest}
              disabled={isTesting || !form.smtp_host}
            >
              <Plug className='mr-2 h-3.5 w-3.5' />
              {isTesting ? 'Testing…' : 'Test Connection'}
            </Button>
            {testResult && (
              <span className='inline-flex items-center gap-1.5 text-xs'>
                {testResult.ok ? (
                  <>
                    <CheckCircle2 className='h-3.5 w-3.5 text-green-600' />
                    <span className='text-green-700 dark:text-green-400'>
                      {testResult.message}
                      {testResult.elapsedMs != null && ` (${testResult.elapsedMs}ms)`}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className='h-3.5 w-3.5 text-red-600' />
                    <span className='text-red-700 dark:text-red-400'>{testResult.message}</span>
                  </>
                )}
              </span>
            )}
          </div>
          <p className='text-[11px] text-muted-foreground'>
            Verifies host:port is reachable (TCP-level only — does not authenticate).
          </p>
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm font-semibold'>Credentials</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='smtp_user'>SMTP Username *</Label>
              <Input
                id='smtp_user'
                value={form.smtp_user}
                onChange={(e) => setForm((f) => ({ ...f, smtp_user: e.target.value }))}
                placeholder='usually the sender email'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='smtp_password'>
                SMTP Password *
                {hasExisting && passwordIsMask && (
                  <Badge variant='outline' className='ml-2 text-[10px]'>
                    Hidden — type to replace
                  </Badge>
                )}
              </Label>
              <div className='relative'>
                <Input
                  id='smtp_password'
                  type={showPassword ? 'text' : 'password'}
                  value={form.smtp_password}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_password: e.target.value }))}
                  // Clear the mask the first time the admin focuses to type a new value.
                  onFocus={() => {
                    if (passwordIsMask) setForm((f) => ({ ...f, smtp_password: '' }));
                  }}
                  className='pr-9'
                  placeholder={hasExisting ? PASSWORD_MASK : 'app password or smtp secret'}
                />
                <button
                  type='button'
                  className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sender identity */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm font-semibold'>Sender Identity</CardTitle>
          <CardDescription className='text-xs'>
            The From: address and display name used on every email.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='sender_email'>Sender Email *</Label>
              <Input
                id='sender_email'
                type='email'
                value={form.sender_email}
                onChange={(e) => setForm((f) => ({ ...f, sender_email: e.target.value }))}
                placeholder='coe@jkkn.ac.in'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='sender_name'>Sender Name *</Label>
              <Input
                id='sender_name'
                value={form.sender_name}
                onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))}
                placeholder='Controller of Examinations — JKKN'
              />
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='cc'>Default CC Emails</Label>
            <Input
              id='cc'
              value={form.default_cc_csv}
              onChange={(e) => setForm((f) => ({ ...f, default_cc_csv: e.target.value }))}
              placeholder='principal@jkkn.ac.in, registrar@jkkn.ac.in'
            />
            <p className='text-[11px] text-muted-foreground'>
              Comma-separated. Applied to every email sent through this config (max 10).
            </p>
          </div>

          <div className='flex items-center gap-3'>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
            <Label className='cursor-pointer' onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}>
              Active — only active rows are used for sends
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Academic Council sender override */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm font-semibold'>Academic Council Sender (optional)</CardTitle>
          <CardDescription className='text-xs'>
            Overrides the From: address for <strong>Academic Council</strong> notices only. Uses the
            same SMTP server and credentials above — just a different sender identity. Leave blank to
            send AC notices from the sender identity above. Board of Studies emails always use the
            sender above.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='ac_sender_email'>AC Sender Email</Label>
              <Input
                id='ac_sender_email'
                type='email'
                value={form.ac_sender_email}
                onChange={(e) => setForm((f) => ({ ...f, ac_sender_email: e.target.value }))}
                placeholder='academic.council@jkkn.ac.in'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='ac_sender_name'>AC Sender Name</Label>
              <Input
                id='ac_sender_name'
                value={form.ac_sender_name}
                onChange={(e) => setForm((f) => ({ ...f, ac_sender_name: e.target.value }))}
                placeholder='Academic Council — JKKN'
              />
            </div>
          </div>
          <p className='text-[11px] text-muted-foreground'>
            Note: the SMTP provider must allow this address as a permitted sender / send-as alias for
            the authenticated account above, or the send may be rejected or rewritten.
          </p>
        </CardContent>
      </Card>

      {/* Save bar */}
      <div className='flex justify-end gap-3 border-t pt-4'>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className='mr-2 h-4 w-4' />
          {isSaving ? 'Saving…' : hasExisting ? 'Update SMTP Config' : 'Save SMTP Config'}
        </Button>
      </div>
    </div>
  );
}
