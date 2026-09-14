'use client';

/**
 * Insta Solver — the complaint form.
 *
 * Phone-first: one column, full-width controls, nothing that needs a mouse.
 * Reading level is deliberately plain — this screen is used by people who are
 * upset, on a phone, possibly for the first time.
 *
 * Two checkboxes carry the two decisions that make this different from the
 * Learners Council board:
 *   I7  "File without my name" — offered only where it can be honoured, and
 *       when it cannot, SHOWN DISABLED with the reason in words. It used to be
 *       unmounted instead, which left a tick the person had made sitting in
 *       state and silently ignored at submit time: they believed they had filed
 *       without a name and they had not. The retraction is now explicit.
 *   I8  "This is about my HOD or manager" — sends it past them.
 *
 * The description rule is mirrored from the database through
 * validateGrievanceDescription, the same function the board uses (BUG-01), so
 * a short entry is caught here and never comes back as a database error.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  GRIEVANCE_DESCRIPTION_MIN_LENGTH,
  validateGrievanceDescription,
} from '@/lib/validations/grievance-ticket';
import {
  SUBJECT_MAX_LENGTH,
  characterCount,
  resolveAnonymousChoice,
  validateSubject,
  type ComplaintCategory,
} from '@/lib/instasolver/complaint';

interface ComplaintClientProps {
  categories: ComplaintCategory[];
  /** False while the per-type anonymous setting is not in the database yet. */
  anonymousAvailable: boolean;
  /**
   * Why there is no list to choose from, when there is none. An empty list and
   * a failed read need different sentences — one is a thing to phone the
   * helpdesk about, the other a thing to retry.
   */
  loadFailure: 'empty' | 'error' | null;
}

interface Filed {
  ticketNumber: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  notice: string | null;
}

/** The sentence shown whenever the chosen type cannot be filed without a name. */
const NAME_REQUIRED_SENTENCE =
  'This category cannot be filed without a name — your name will be attached.';

export function ComplaintClient({
  categories,
  anonymousAvailable,
  loadFailure,
}: ComplaintClientProps) {
  const { toast } = useToast();

  const [categoryId, setCategoryId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [anonymousRetracted, setAnonymousRetracted] = useState(false);
  const [aboutSuperior, setAboutSuperior] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filed, setFiled] = useState<Filed | null>(null);
  const [copied, setCopied] = useState(false);

  const chosen = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId]
  );

  const canFileWithoutName =
    resolveAnonymousChoice({ anonymousAvailable, category: chosen, ticked: false }).allowed;
  const effectiveAnonymous = anonymous && canFileWithoutName;

  /**
   * Changing the type can withdraw the no-name promise. When it does, the tick
   * is cleared HERE — so state and screen agree — and the withdrawal is put on
   * screen rather than discovered at submit time.
   */
  function handleCategoryChange(nextId: string) {
    setCategoryId(nextId);
    const next = categories.find((c) => c.id === nextId) ?? null;
    const choice = resolveAnonymousChoice({ anonymousAvailable, category: next, ticked: anonymous });
    setAnonymous(choice.anonymous);
    setAnonymousRetracted(choice.retracted);
  }

  const subjectError = validateSubject(subject);
  const descriptionError = validateGrievanceDescription(description);
  const descriptionCount = characterCount(description);

  async function handleSubmit() {
    setTouched(true);
    if (!categoryId || subjectError || descriptionError) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/instasolver/complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          subject: subject.trim(),
          description: description.trim(),
          anonymous: effectiveAnonymous,
          about_superior: aboutSuperior,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        ticket_number?: string | null;
        tracking_code?: string | null;
        tracking_url?: string | null;
        notice?: string | null;
      };

      if (!res.ok || !payload.success) {
        toast({
          title: 'Not filed',
          description: payload.error || 'Something went wrong. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      setFiled({
        ticketNumber: payload.ticket_number ?? null,
        trackingCode: payload.tracking_code ?? null,
        trackingUrl: payload.tracking_url ?? null,
        notice: payload.notice ?? null,
      });
    } catch {
      toast({
        title: 'Not filed',
        description: 'Your phone could not reach the server. Check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Write the code down instead.',
        variant: 'destructive',
      });
    }
  }

  // ── Filed ────────────────────────────────────────────────────────────────
  if (filed) {
    return (
      <Card className="mt-4">
        <CardContent className="space-y-5 py-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">Your complaint has been filed</p>
              {filed.ticketNumber ? (
                <p className="text-sm text-muted-foreground">
                  Its number is <span className="font-mono font-semibold">{filed.ticketNumber}</span>.
                </p>
              ) : null}
            </div>
          </div>

          {filed.notice ? (
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm">{filed.notice}</p>
            </div>
          ) : null}

          {filed.trackingCode ? (
            <div className="space-y-3 rounded-md border bg-muted/40 p-4">
              <p className="text-sm font-medium">Save this — it is the only way to check progress</p>
              <p className="break-all font-mono text-lg font-semibold sm:text-xl">
                {filed.trackingCode}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyCode(filed.trackingCode as string)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? 'Copied' : 'Copy the code'}
                </Button>
                {filed.trackingUrl ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={filed.trackingUrl}>Check progress</Link>
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Your name is not shown on the complaint. Nobody can look it up for you, so if you
                lose the code it cannot be recovered.
              </p>
            </div>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFiled(null);
              setCategoryId('');
              setSubject('');
              setDescription('');
              setAnonymous(false);
              setAnonymousRetracted(false);
              setAboutSuperior(false);
              setTouched(false);
            }}
          >
            Raise another one
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <Card className="mt-4">
      <CardContent className="space-y-6 py-6">
        {loadFailure === 'empty' ? (
          <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm">
              Your college has not set up any complaint types yet — contact the IT helpdesk.
            </p>
          </div>
        ) : null}

        {loadFailure === 'error' ? (
          <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm">
              We couldn&apos;t load the complaint types right now — try again in a minute.
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="complaint-category">What is this about?</Label>
          <Select value={categoryId} onValueChange={handleCategoryChange}>
            <SelectTrigger id="complaint-category" className="w-full">
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {touched && !categoryId ? (
            <p className="text-sm text-destructive">Please choose what this is about.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="complaint-subject">Give it a short title</Label>
          <Input
            id="complaint-subject"
            value={subject}
            maxLength={SUBJECT_MAX_LENGTH}
            placeholder="In a few words"
            onChange={(e) => setSubject(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          {touched && subjectError ? (
            <p className="text-sm text-destructive">{subjectError}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="complaint-description">What happened?</Label>
          <Textarea
            id="complaint-description"
            value={description}
            rows={6}
            placeholder="Tell us what happened, where, and when."
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          <p className="text-xs text-muted-foreground">
            At least {GRIEVANCE_DESCRIPTION_MIN_LENGTH} characters. You have written{' '}
            {descriptionCount}.
          </p>
          {touched && descriptionError ? (
            <p className="text-sm text-destructive">{descriptionError}</p>
          ) : null}
        </div>

        {/* Mounted whether or not it can be used, so a withdrawn promise is
            visible instead of vanishing off the screen. */}
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="complaint-anonymous"
            checked={anonymous}
            disabled={!canFileWithoutName}
            onCheckedChange={(v) => {
              setAnonymous(v === true);
              setAnonymousRetracted(false);
            }}
          />
          <div className="space-y-1">
            <Label
              htmlFor="complaint-anonymous"
              className={canFileWithoutName ? 'font-medium' : 'font-medium text-muted-foreground'}
            >
              File without my name
            </Label>
            {canFileWithoutName ? (
              <p className="text-sm text-muted-foreground">
                You&apos;ll get a private code to check progress. Your name is not shown on the
                complaint.
              </p>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {!anonymousAvailable
                  ? 'Filing without a name opens once the database update lands. Until then your name will be attached.'
                  : !chosen
                    ? 'Choose what this is about first — some complaint types can be filed without a name.'
                    : anonymousRetracted
                      ? `You had asked to file without your name. ${NAME_REQUIRED_SENTENCE}`
                      : NAME_REQUIRED_SENTENCE}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="complaint-superior"
            checked={aboutSuperior}
            onCheckedChange={(v) => setAboutSuperior(v === true)}
          />
          <div className="space-y-1">
            <Label htmlFor="complaint-superior" className="font-medium">
              This is about my HOD or manager
            </Label>
            <p className="text-sm text-muted-foreground">
              It will skip them and go to senior management — or to central review if that route is
              not set up yet.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || categories.length === 0}
            className="w-full sm:w-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending
              </>
            ) : (
              'Send my complaint'
            )}
          </Button>
          {effectiveAnonymous ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Name not shown
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
