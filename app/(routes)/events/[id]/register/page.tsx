'use client';

// app/(routes)/events/[id]/register/page.tsx
// The page an organizer's shared link points at. INSIDE the auth group on
// purpose: registration for a general event is JKKN-internal, so identity comes
// from the session and is never typed in. That removes everything the public
// tournament form needs for guests — no name/institution inputs, no access
// code, no divisions, no payment.
//
// The window decision comes from the same pure helper the API route uses, so
// the message here and the server's verdict cannot disagree. The server still
// re-checks: this page is convenience, not security.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useGeneralEvent } from '@/hooks/events/use-general-events';
import { useRegistrationForm } from '@/hooks/events/use-tournament-registration-form';
import { useMyEventRegistration } from '@/hooks/events/use-my-event-registration';
import { checkRegistrationWindow } from '@/lib/services/events/shared/event-registration-window';
import { DynamicFieldInput, isFieldVisible } from '@/components/events/dynamic-field-input';
import type { EventRegistrationFormField } from '@/types/tournament';

/** Centred single-message card — every closed/blocked state uses this. */
function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card className="mx-auto mt-8 max-w-lg">
      <CardContent className="space-y-2 py-12 text-center">
        <p className="text-base font-medium">{title}</p>
        {children}
      </CardContent>
    </Card>
  );
}

export default function EventRegisterPage() {
  const params = useParams();
  const eventId = String(params?.id ?? '');

  const { profile, isLoading: authLoading } = useAuth();
  const { data: event, isLoading: eventLoading } = useGeneralEvent(eventId);
  const { data: form } = useRegistrationForm(eventId);
  const { data: mine, isLoading: mineLoading, refetch } = useMyEventRegistration(
    eventId,
    profile?.id
  );

  const [phone, setPhone] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const sections = useMemo(
    () => (form?.is_enabled === false ? [] : form?.sections ?? []),
    [form]
  );

  if (authLoading || eventLoading || mineLoading) {
    return (
      <ContentLayout title="Register">
        <Skeleton className="mx-auto mt-8 h-64 w-full max-w-lg" />
      </ContentLayout>
    );
  }

  if (!profile) {
    return (
      <ContentLayout title="Register">
        <Notice title="Sign in with your JKKN account to register">
          <Button asChild className="mt-2 gap-1.5">
            <Link href={`/login?redirect=/events/${eventId}/register`}>
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          </Button>
        </Notice>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Register">
        <Notice title="This event could not be found." />
      </ContentLayout>
    );
  }

  const windowState = checkRegistrationWindow(event);
  if (!windowState.open) {
    return (
      <ContentLayout title={event.name}>
        <Notice title={windowState.message} />
      </ContentLayout>
    );
  }

  // Already registered (or just now registered) → the receipt, not the form.
  if (mine || done) {
    const answers = (mine?.custom_fields ?? {}) as Record<string, unknown>;
    const labelFor = (key: string) =>
      sections
        .flatMap((s) => s.fields ?? [])
        .find((f) => f.field_key === key)?.field_label ?? key;

    return (
      <ContentLayout title={event.name}>
        <Card className="mx-auto mt-8 max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              You&apos;re registered
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {event.name}
              {mine?.created_at &&
                ` · ${new Date(mine.created_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}`}
            </p>
            {Object.keys(answers).length > 0 && (
              <dl className="space-y-2 border-t pt-3 text-sm">
                {Object.entries(answers).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground">{labelFor(key)}</dt>
                    <dd>{Array.isArray(value) ? value.join(', ') : String(value ?? '—')}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, custom_fields: values }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Show the server's own wording — it names the offending field.
        setError(json.error ?? 'Could not save your registration.');
        return;
      }
      setDone(true);
      refetch();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ContentLayout title={event.name}>
      <Card className="mx-auto mt-6 max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Register for {event.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Identity — read-only. Already known; never asked twice. */}
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Registering as</p>
            <p className="text-sm font-medium">{profile.full_name ?? profile.email}</p>
            <p className="text-xs text-muted-foreground">{profile.email}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">
              Phone <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
            />
          </div>

          {sections.map((section) => (
            <div key={section.id} className="space-y-3 border-t pt-4">
              <p className="text-sm font-semibold">{section.title}</p>
              {(section.fields ?? [])
                .filter((f: EventRegistrationFormField) => isFieldVisible(f, values))
                .map((field: EventRegistrationFormField) => (
                  <DynamicFieldInput
                    key={field.id}
                    field={field}
                    value={values[field.field_key]}
                    onChange={(v) => setValues((prev) => ({ ...prev, [field.field_key]: v }))}
                  />
                ))}
            </div>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register
          </Button>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
