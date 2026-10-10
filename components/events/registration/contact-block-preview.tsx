'use client';

// components/events/registration/contact-block-preview.tsx
//
// The built-in "Your name / Phone / Email" block a GENERAL event's public form
// adds on its own (see app/p/event/[id]/register/_components/event-register-form.tsx).
// The builder used to show only the organizer's custom sections, so organizers
// could not tell registrants would also be asked for these — they are drawn
// here greyed out and locked, in the position the "Name, phone & email" card
// picked, so the builder and preview match the real page.
//
// KEEP IN SYNC with `contactBlockEl` in event-register-form.tsx (labels, order)
// and its blockMode fallback ('hidden' with no name field still shows 'top').

import { Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  formCanSupplyName,
  isContactBlockMode,
  type ContactBlockMode,
} from '@/lib/services/events/registration/form-prefill';

type ShownContactMode = Exclude<ContactBlockMode, 'hidden'>;

/**
 * Where the public form will actually draw the block, or null when it won't.
 * Mirrors event-register-form.tsx's blockMode: 'hidden' with no field able to
 * supply a name falls back to 'top'.
 */
export function resolveContactBlock(
  saved: unknown,
  fields: Parameters<typeof formCanSupplyName>[0],
): { mode: ShownContactMode | null; fellBack: boolean } {
  const chosen: ContactBlockMode = isContactBlockMode(saved) ? saved : 'top';
  if (chosen !== 'hidden') return { mode: chosen, fellBack: false };
  return formCanSupplyName(fields) ? { mode: null, fellBack: false } : { mode: 'top', fellBack: true };
}

const POSITION_NOTE: Record<ShownContactMode, string> = {
  top: 'Shown first, above your sections',
  bottom: 'Shown after your sections',
};

/** Compact locked row for the builder column. */
export function ContactBlockBuilderRow({
  mode,
  fellBack,
}: {
  mode: ShownContactMode;
  /** Organizer chose "Don't ask" but no field can supply a name, so the public form still shows it. */
  fellBack?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-muted/40 p-3 text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Your details — built in
        </span>
        <span className="text-xs">{POSITION_NOTE[mode]}</span>
      </div>
      <p className="text-xs">
        Your name <span className="text-destructive/60">*</span> · Phone · Email — asked
        automatically on every registration.{' '}
        {fellBack
          ? 'You chose "Don\'t ask", but no field on this form can supply a name yet, so it is still shown.'
          : 'Change where it goes (or switch it off) in the "Name, phone & email" card above.'}
      </p>
    </div>
  );
}

/** Greyed, non-editable copy of the public block for the preview column. */
export function ContactBlockPreview() {
  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-muted/40 p-3 opacity-70">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
        Your details
        <span className="text-xs font-normal text-muted-foreground">· built in</span>
      </p>
      <div className="space-y-1.5">
        <Label className="text-muted-foreground">
          Your name <span className="text-destructive">*</span>
        </Label>
        <Input disabled placeholder="Full name" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Phone</Label>
          <Input disabled placeholder="10-digit mobile" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Email</Label>
          <Input disabled placeholder="you@example.com" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Give at least one of phone or email so the organizer can reach you.
      </p>
    </div>
  );
}
