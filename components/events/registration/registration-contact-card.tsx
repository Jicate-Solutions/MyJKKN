'use client';

// components/events/registration/registration-contact-card.tsx
//
// Where the built-in "Your name / Phone / Email" block sits on the public
// form — or whether it is shown at all. One setting per form, saved with a
// plain UPDATE like the fee and schedule cards.
//
// 'hidden' is only safe when the organizer's own fields can identify the
// registrant: the public-register API still needs a name and one of phone /
// email. The card warns (and the public form falls back to showing the block)
// when no field on the form could supply a name.

import { useState } from 'react';
import { AlertTriangle, Contact, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useUpdateRegistrationForm, useRegistrationForm } from '@/hooks/events/use-tournament-registration-form';
import {
  CONTACT_BLOCK_MODES,
  formCanSupplyName,
  isContactBlockMode,
  type ContactBlockMode,
} from '@/lib/services/events/registration/form-prefill';
import type { EventRegistrationFormSummary } from '@/types/tournament';

export function RegistrationContactCard({
  eventId,
  form,
}: {
  eventId: string;
  form: EventRegistrationFormSummary;
}) {
  const updateForm = useUpdateRegistrationForm(eventId);
  // The saved fields, to warn before hiding a block nothing can replace.
  const { data: full } = useRegistrationForm(form.id);
  const fields = (full?.sections ?? []).flatMap((s) => s.fields ?? []);
  const canSupplyName = formCanSupplyName(fields);

  const current: ContactBlockMode = isContactBlockMode(form.contact_block) ? form.contact_block : 'top';
  const [mode, setMode] = useState<ContactBlockMode>(current);
  const dirty = mode !== current;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Contact className="h-4 w-4" />
          Name, phone &amp; email — {form.name}
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Every public form has a built-in block asking for the registrant&apos;s name, phone
          and email. Choose where it goes, or switch it off if your own questions already
          collect them.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {CONTACT_BLOCK_MODES.map((m) => (
            <label
              key={m.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                mode === m.value ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <input
                type="radio"
                name={`contact_block_${form.id}`}
                className="mt-1"
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
              />
              <div className="space-y-0.5">
                <Label className="cursor-pointer text-sm">{m.label}</Label>
                <p className="text-xs text-muted-foreground">
                  {m.value === 'top' && 'Shown first, above your sections.'}
                  {m.value === 'bottom' &&
                    'Shown after your sections — use this when a banner or a category question should lead the page.'}
                  {m.value === 'hidden' &&
                    'Not shown. The name, phone and email are read from your own fields — map them with "Prefill from profile", or label them with "name", "mobile" and "email".'}
                </p>
              </div>
            </label>
          ))}
        </div>

        {mode === 'hidden' && !canSupplyName && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No field on this form can supply the registrant&apos;s name yet. Add a text field with
            &ldquo;name&rdquo; in its label (or map one to Full name), or the public form will keep
            asking for it.
          </p>
        )}

        <Button
          onClick={() => updateForm.mutate({ formId: form.id, updates: { contact_block: mode } })}
          disabled={!dirty || updateForm.isPending}
          className="gap-1.5"
        >
          {updateForm.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
