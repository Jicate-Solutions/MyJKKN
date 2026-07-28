'use client';

// PUBLIC (no login) — the short form an employer or an alumnus opens from their
// own token link. Four ratings and one optional comment; nothing else is asked,
// because the shape the director chose is "genuinely short" and every extra
// field is a reason not to finish it.
//
// Explicit states, never a silent redirect (rule #27): loading shows a skeleton,
// a dead/expired/spent/closed link shows a plain panel saying so, and a failed
// submit shows the reason inline with the answers still on screen.
//
// The token never leaves the URL — no email, no name and no identifier is typed
// on this page, so there is nothing here to leak into a query string.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  MAX_FREE_TEXT,
  SCALE_LABELS,
  SCALE_MAX,
  SCALE_MIN,
  type StakeholderQuestion,
} from '@/types/accreditation/stakeholder-survey';

/** What this page needs on screen once the token resolved to an open cycle. */
interface FormPayload {
  invitedName: string | null;
  institutionName: string;
  audience: string;
  academicYear: string;
  title: string;
  questions: StakeholderQuestion[];
}

/**
 * The wire shape, deliberately flat and all-optional: this is untrusted JSON
 * off the network, so it is narrowed by hand below rather than asserted into a
 * discriminated union it might not actually match.
 */
interface ApiReply {
  usable?: boolean;
  reason?: string;
  alreadyDone?: boolean;
  error?: string;
  invitedName?: string | null;
  institutionName?: string;
  audience?: string;
  academicYear?: string;
  title?: string;
  questions?: StakeholderQuestion[];
}

// Module constant — a fresh array literal here would re-run the scale row map
// on every keystroke.
const SCALE_VALUES = [1, 2, 3, 4, 5] as const;

function ScaleRow({
  question,
  value,
  onPick,
  disabled,
}: {
  question: StakeholderQuestion;
  value: number | undefined;
  onPick: (v: number) => void;
  disabled: boolean;
}) {
  const min = question.min ?? SCALE_MIN;
  const max = question.max ?? SCALE_MAX;
  return (
    <fieldset className="space-y-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">{question.label}</legend>
      <div className="flex flex-wrap gap-2">
        {SCALE_VALUES.filter((v) => v >= min && v <= max).map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={value === v ? 'default' : 'outline'}
            aria-pressed={value === v}
            disabled={disabled}
            onClick={() => onPick(v)}
            className="min-w-[92px] flex-col items-center gap-0.5 py-6"
          >
            <span className="text-base font-semibold">{v}</span>
            <span className="text-[11px] font-normal opacity-80">{SCALE_LABELS[v]}</span>
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">{children}</main>
  );
}

export default function StakeholderSurveyPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [state, setState] = useState<'loading' | 'ready' | 'closed' | 'done'>('loading');
  const [form, setForm] = useState<FormPayload | null>(null);
  const [closedReason, setClosedReason] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [consent, setConsent] = useState(false);
  const [companyFax, setCompanyFax] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setClosedReason('This feedback link is not active.');
      setState('closed');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/stakeholder-survey/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const json = (await res.json()) as ApiReply;
        if (cancelled) return;
        if (json.usable === true && Array.isArray(json.questions)) {
          setForm({
            invitedName: json.invitedName ?? null,
            institutionName: json.institutionName ?? 'JKKN',
            audience: json.audience ?? '',
            academicYear: json.academicYear ?? '',
            title: json.title ?? 'Feedback on our learning framework',
            questions: json.questions,
          });
          setState('ready');
        } else if (json.usable === false) {
          setClosedReason(json.reason ?? 'This feedback link is not active.');
          setState(json.alreadyDone ? 'done' : 'closed');
        } else {
          setClosedReason('This feedback link could not be opened right now.');
          setState('closed');
        }
      } catch {
        if (!cancelled) {
          setClosedReason('This feedback link could not be opened right now.');
          setState('closed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form) return;
      setError(null);

      const missing = form.questions.filter(
        (q) => q.type === 'scale' && typeof answers[q.key] !== 'number'
      );
      if (missing.length > 0) {
        setError('Please answer every rating question before sending.');
        return;
      }
      if (!consent) {
        setError('Please tick the consent box before sending your feedback.');
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch(
          `/api/public/stakeholder-survey/${encodeURIComponent(token)}/submit`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers, consent, company_fax: companyFax }),
          }
        );
        const json = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !json.success) {
          setError(json.error ?? 'Something went wrong. Please try again.');
          return;
        }
        setState('done');
        setClosedReason('Thank you — your feedback has been recorded.');
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [answers, companyFax, consent, form, token]
  );

  if (state === 'loading') {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (state === 'done') {
    return (
      <Shell>
        <Card>
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
            <CardTitle className="text-xl">Thank you</CardTitle>
            <CardDescription>
              {closedReason || 'Your feedback has been recorded.'} It goes to the people
              who review our learning framework, as counts and averages — your answers are
              never shown against your name.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  if (state === 'closed' || !form) {
    return (
      <Shell>
        <Card>
          <CardHeader className="items-center text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden />
            <CardTitle className="text-xl">Link not active</CardTitle>
            <CardDescription>
              {closedReason || 'This feedback link is not active.'} If you think it should
              work, reply to the email you received and we will send a fresh link.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  const isEmployer = form.audience === 'industry';

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{form.title}</CardTitle>
          <CardDescription>
            {form.invitedName ? `${form.invitedName} — ` : ''}
            {form.institutionName}, {form.academicYear}.{' '}
            {isEmployer
              ? 'Four ratings about the learners you hire from us, and one optional comment.'
              : 'Four ratings about your own time here, and one optional comment.'}{' '}
            It takes about two minutes, and your answers are read before our learning
            framework is reviewed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            {form.questions.map((q) =>
              q.type === 'scale' ? (
                <ScaleRow
                  key={q.key}
                  question={q}
                  value={typeof answers[q.key] === 'number' ? (answers[q.key] as number) : undefined}
                  disabled={submitting}
                  onPick={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))}
                />
              ) : (
                <div key={q.key} className="space-y-2">
                  <Label htmlFor={`q-${q.key}`} className="text-sm font-medium">
                    {q.label}
                  </Label>
                  <Textarea
                    id={`q-${q.key}`}
                    rows={3}
                    maxLength={MAX_FREE_TEXT}
                    disabled={submitting}
                    value={typeof answers[q.key] === 'string' ? (answers[q.key] as string) : ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                  />
                </div>
              )
            )}

            {/* Honeypot — visually hidden, never announced to screen readers. */}
            <div className="hidden" aria-hidden>
              <label htmlFor="company_fax">Fax</label>
              <input
                id="company_fax"
                name="company_fax"
                tabIndex={-1}
                autoComplete="off"
                value={companyFax}
                onChange={(e) => setCompanyFax(e.target.value)}
              />
            </div>

            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
              <Checkbox
                id="consent"
                checked={consent}
                disabled={submitting}
                onCheckedChange={(v) => setConsent(v === true)}
              />
              <Label htmlFor="consent" className="text-xs font-normal leading-relaxed">
                I agree that {form.institutionName} may use my answers to review and improve
                its learning framework, and may report them for accreditation as counts and
                averages only. My individual answers will not be published or shown against
                my name. Consent given under the Digital Personal Data Protection Act, 2023;
                you can ask us to remove your response at any time.
              </Label>
            </div>

            {error && (
              <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Sending…
                </>
              ) : (
                'Send my feedback'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}
