'use client';

// Read-only inventory of the fields EVERY tournament registration collects,
// shown in the builder so an organizer can see the whole form before adding to
// it. The builder previously showed only custom fields, so organizers could not
// tell what was already being asked — one duplicated the built-in institution
// field as a custom "College name?" and registrants were asked twice.
//
// Purely presentational: no props, no state, no hooks, no data fetching.
//
// KEEP IN SYNC: STANDARD_FIELDS mirrors the hardcoded JSX in
// app/p/tournament/[id]/register/_components/register-form.tsx, in render
// order. Adding, removing or renaming a standard field there means editing this
// list too — deliberately static, so nothing enforces it at build time.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';

interface StandardField {
  label: string;
  control: string;
  shownWhen: string;
}

const STANDARD_FIELDS: readonly StandardField[] = [
  { label: 'Event / division', control: 'Dropdown', shownWhen: 'Always' },
  { label: 'Team name / Your name', control: 'Text', shownWhen: 'Always' },
  { label: 'External (non-JKKN)', control: 'Toggle', shownWhen: 'Always' },
  {
    label: 'School / club or College',
    control: 'Text or directory picker',
    shownWhen: 'Always',
  },
  {
    label: 'Gender, Age',
    control: 'Dropdown + number',
    shownWhen: 'Individual events only',
  },
  {
    label: 'Roster (name + jersey no)',
    control: 'Repeater rows',
    shownWhen: 'Team events only',
  },
  {
    label: 'Phone, Email',
    control: 'Text',
    shownWhen: 'Guests and external entrants',
  },
];

/** Full read-only card for the builder column. */
export function StandardFieldsCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="rounded-md bg-muted p-1.5">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </span>
          Standard fields
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-3 text-sm text-muted-foreground">
          Every tournament collects these automatically, before your custom
          sections. They are built in, so you cannot edit them here — and you
          should not re-create them as custom fields.
        </p>
        <ul className="divide-y rounded-lg border">
          {STANDARD_FIELDS.map((field) => (
            <li
              key={field.label}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                {field.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {field.control} · {field.shownWhen}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * The same fields rendered for the PREVIEW column, styled like one of the
 * previewed custom sections (bold section title, then the fields) so the panel
 * reads as one continuous form in the order a registrant meets it.
 *
 * Deliberately not the Card above: inside "Preview — what registrants will
 * see", a bordered admin card would read as chrome rather than as part of the
 * form. Deliberately not live inputs either — these are fixed, so a fake
 * control the organizer could type into would imply an editability that does
 * not exist.
 */
export function StandardFieldsPreview() {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">Standard fields</p>
      <ul className="space-y-2">
        {STANDARD_FIELDS.map((field) => (
          <li key={field.label}>
            <span className="flex items-center gap-1.5 text-sm">
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
              {field.label}
            </span>
            <span className="ml-[1.125rem] block text-xs text-muted-foreground">
              {field.control} · {field.shownWhen}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-b pb-3 text-xs text-muted-foreground">
        Always collected, before your custom sections below.
      </p>
    </div>
  );
}
