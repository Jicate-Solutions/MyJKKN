/**
 * SubmitClient — renders a published form for staff submission.
 *
 * Wave 3 M9 follow-up. Reads the published widget schema and renders each
 * widget via WidgetRenderer in interactive mode. On submit, validates required
 * fields locally then calls the submit server action.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  WidgetRenderer,
  evaluateConditional,
} from '@/components/hr/forms/widgets';
import type { Widget } from '@/types/hr-forms';

import { submitFormAction } from '../actions';

interface SubmitClientProps {
  formId: string;
  formTitle: string;
  widgets: Widget[];
}

export function SubmitClient({ formId, formTitle, widgets }: SubmitClientProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  function handleChange(widgetId: string, next: unknown) {
    setValues((prev) => ({ ...prev, [widgetId]: next }));
  }

  function validate(): string | null {
    for (const w of widgets) {
      // Skip widgets hidden by visible_when.
      if (!evaluateConditional(w.visible_when, values)) continue;
      if (!w.required) continue;
      const v = values[w.id];
      const empty =
        v === undefined ||
        v === null ||
        v === '' ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        return `"${w.label}" is required`;
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitFormAction(formId, values);
      if (!res.ok) throw new Error(res.error);
      toast.success('Submitted for approval');
      router.push('/hr/forms/inbox');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{formTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {widgets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fields configured yet — ask a director to publish the form.
            </p>
          ) : (
            widgets.map((w) => (
              <WidgetRenderer
                key={w.id}
                widget={w}
                values={values}
                onChange={handleChange}
              />
            ))
          )}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="submit"
              disabled={submitting || widgets.length === 0}
            >
              {submitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              {submitting ? 'Submitting…' : 'Submit for approval'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
