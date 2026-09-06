# Standard Fields Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the seven built-in registration fields, read-only, in the tournament registration form builder so an organizer stops re-creating them as custom fields.

**Architecture:** One new presentational component file exporting two pieces of copy — a full card for the builder column and a one-line note for the preview column. No props, no state, no hooks, no data fetching. The editor imports both and renders them at fixed positions. Nothing else changes.

**Tech Stack:** Next.js App Router (client components), React, TypeScript, Tailwind, shadcn/ui (`Card`, `CardHeader`, `CardTitle`, `CardContent`), lucide-react icons, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-28-tournament-builder-standard-fields-card-design.md`

> **⚠️ Amended during execution, 2026-07-28 — read before trusting the code blocks below.**
>
> This plan was written and executed with a one-line `StandardFieldsNote` in the
> preview column. Partway through Task 2 the requester rejected that: a panel
> titled "Preview — what registrants will see" has to actually show the fields.
>
> **`StandardFieldsNote` does not exist.** It was replaced by
> `StandardFieldsPreview`, which renders the full field list styled like a
> previewed custom section. Every `StandardFieldsNote` reference below — Task 1
> Steps 1 and 3, Task 2 Steps 1, 3, 5 — is superseded; see the spec's
> "Revision" note and the shipped `standard-fields-card.tsx` for what was
> actually built. Task counts changed too: 5 tests in Task 1, 4 in Task 2.
>
> The steps are left as written because they record the order the work happened
> in. Nothing else about the plan changed.

## Global Constraints

- **Read-only.** The standard fields must not become editable, toggleable, reorderable, or relabellable. No switches, no inputs, no drag handles on them.
- **Static list.** The card renders the same seven rows for every tournament. Do not read `tournament.divisions`, `participant_org_type`, or any other per-event data.
- **No duplicate detection.** Do not compare custom field labels against standard ones.
- **Builder UI only.** Do not modify anything under `app/p/tournament/`, any API route, any service, any hook, or the database. The single permitted change outside the builder is a comment (Task 2, Step 7).
- **Field list, verbatim.** Labels, controls and conditions must be exactly the seven rows in Task 1 Step 3 — they mirror the JSX order in `app/p/tournament/[id]/register/_components/register-form.tsx`.
- **Test environment.** Component tests need the `// @vitest-environment jsdom` pragma on line 1. Do not edit `vitest.config.js` — the pragma works on its own (verified against `__tests__/lib/guide/use-progress.test.tsx`).
- **Test runner.** `npx vitest run <path>`. There is no `npm test` script in this repo.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/(routes)/events/tournament/[id]/registration-form/_components/standard-fields-card.tsx` | **New.** Owns the field inventory data and both rendered forms of it (`StandardFieldsCard`, `StandardFieldsNote`). Single source of this copy. |
| `__tests__/events/standard-fields-card.test.tsx` | **New.** Unit tests for the component in isolation. |
| `app/(routes)/events/tournament/[id]/registration-form/_components/registration-form-editor.tsx` | **Modify.** Renders the card in the builder column and the note in the preview column. |
| `__tests__/events/registration-form-editor-standard-fields.test.tsx` | **New.** Integration test that both appear in the editor. |
| `app/p/tournament/[id]/register/_components/register-form.tsx` | **Modify — comment only.** Cross-reference so a future edit updates the card. |

---

### Task 1: StandardFieldsCard component

**Files:**
- Create: `app/(routes)/events/tournament/[id]/registration-form/_components/standard-fields-card.tsx`
- Test: `__tests__/events/standard-fields-card.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: two named exports, both taking no props and returning JSX:
  - `StandardFieldsCard(): React.JSX.Element` — the full card
  - `StandardFieldsNote(): React.JSX.Element` — the one-line preview note

- [ ] **Step 1: Write the failing test**

Create `__tests__/events/standard-fields-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  StandardFieldsCard,
  StandardFieldsNote,
} from '@/app/(routes)/events/tournament/[id]/registration-form/_components/standard-fields-card';

afterEach(() => cleanup());

const EXPECTED_LABELS = [
  'Event / division',
  'Team name / Your name',
  'External (non-JKKN)',
  'School / club or College',
  'Gender, Age',
  'Roster (name + jersey no)',
  'Phone, Email',
];

describe('StandardFieldsCard', () => {
  it('lists every standard field the public form collects', () => {
    render(<StandardFieldsCard />);
    for (const label of EXPECTED_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('says when each conditional field appears', () => {
    render(<StandardFieldsCard />);
    expect(screen.getByText(/Individual events only/)).toBeInTheDocument();
    expect(screen.getByText(/Team events only/)).toBeInTheDocument();
    expect(screen.getByText(/Guests and external entrants/)).toBeInTheDocument();
  });

  it('warns the organizer not to re-create them as custom fields', () => {
    render(<StandardFieldsCard />);
    expect(screen.getByText(/re-create them/i)).toBeInTheDocument();
  });
});

describe('StandardFieldsNote', () => {
  it('tells the previewer the standard fields come first', () => {
    render(<StandardFieldsNote />);
    expect(screen.getByText(/standard fields.*before these/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/events/standard-fields-card.test.tsx`
Expected: FAIL — cannot resolve the module `standard-fields-card`, because it does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `app/(routes)/events/tournament/[id]/registration-form/_components/standard-fields-card.tsx`:

```tsx
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
 * One-line note for the preview column. The panel claims to show "what
 * registrants will see", so it cannot stay silent about the standard fields —
 * but repeating the whole card there would just be noise.
 */
export function StandardFieldsNote() {
  return (
    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      Registrants fill the standard fields (division, name, college, roster,
      contact) before these.
    </p>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/events/standard-fields-card.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/events/tournament/[id]/registration-form/_components/standard-fields-card.tsx" __tests__/events/standard-fields-card.test.tsx
git commit -m "feat(tournament): add read-only standard-fields card for the form builder"
```

---

### Task 2: Render both in the builder

**Files:**
- Modify: `app/(routes)/events/tournament/[id]/registration-form/_components/registration-form-editor.tsx` (builder column at `:502`, preview column at `:557`)
- Modify: `app/p/tournament/[id]/register/_components/register-form.tsx` (comment only)
- Test: `__tests__/events/registration-form-editor-standard-fields.test.tsx`

**Interfaces:**
- Consumes: `StandardFieldsCard`, `StandardFieldsNote` from Task 1 — both take no props.
- Produces: nothing new. `RegistrationFormEditor({ eventId }: { eventId: string })` keeps its existing signature.

- [ ] **Step 1: Write the failing test**

Create `__tests__/events/registration-form-editor-standard-fields.test.tsx`.

The editor's only non-UI imports are `next/navigation` and the registration-form hooks (the hooks module pulls in the Supabase browser client, so it must be mocked). Everything else it imports is a presentational component or a plain type. `sections: []` keeps the render free of Radix `Select`, which only appears inside a field row.

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/hooks/events/use-tournament-registration-form', () => ({
  useRegistrationForm: () => ({
    data: { id: 'form-1', event_id: 'ev-1', is_enabled: true, sections: [] },
    isLoading: false,
  }),
  useSaveRegistrationForm: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { RegistrationFormEditor } from '@/app/(routes)/events/tournament/[id]/registration-form/_components/registration-form-editor';

afterEach(() => cleanup());

describe('RegistrationFormEditor standard fields', () => {
  it('shows the standard-fields card in the builder column', () => {
    render(<RegistrationFormEditor eventId="ev-1" />);
    expect(screen.getByText('Standard fields')).toBeInTheDocument();
    expect(screen.getByText('Event / division')).toBeInTheDocument();
    expect(screen.getByText('Roster (name + jersey no)')).toBeInTheDocument();
  });

  it('notes the standard fields in the preview column', () => {
    render(<RegistrationFormEditor eventId="ev-1" />);
    expect(
      screen.getByText(/standard fields.*before these/i)
    ).toBeInTheDocument();
  });

  it('still renders the empty-state prompt for custom sections', () => {
    render(<RegistrationFormEditor eventId="ev-1" />);
    expect(screen.getByText(/No custom fields yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/events/registration-form-editor-standard-fields.test.tsx`
Expected: FAIL — the first two tests cannot find "Standard fields" or the note. The third test passes already; that is intended, it is the regression guard.

- [ ] **Step 3: Import the components in the editor**

In `registration-form-editor.tsx`, directly below the existing line 30
(`import { DynamicFieldInput, isFieldVisible } from '@/components/events/dynamic-field-input';`) add:

```tsx
import { StandardFieldsCard, StandardFieldsNote } from './standard-fields-card';
```

- [ ] **Step 4: Render the card in the builder column**

Find the builder column, which currently starts:

```tsx
        {/* ── Builder ── */}
        <div className="space-y-4">
          {sections.length === 0 && (
```

Insert `<StandardFieldsCard />` as the first child of that `<div>`, so it sits above the empty-state card and every section:

```tsx
        {/* ── Builder ── */}
        <div className="space-y-4">
          <StandardFieldsCard />

          {sections.length === 0 && (
```

- [ ] **Step 5: Render the note in the preview column**

Find the preview column heading:

```tsx
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preview — what registrants will see
          </p>
```

Insert `<StandardFieldsNote />` immediately after that closing `</p>`, before the `{!isEnabled && (` block. It renders unconditionally — the standard fields are collected whether or not custom fields are enabled:

```tsx
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preview — what registrants will see
          </p>
          <StandardFieldsNote />
          {!isEnabled && (
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run __tests__/events/registration-form-editor-standard-fields.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 7: Add the cross-reference comment to the public form**

The card's list is static text describing this file. Add the reciprocal warning so a future edit here updates it.

In `app/p/tournament/[id]/register/_components/register-form.tsx`, find the start of the returned form markup:

```tsx
  return (
    <div className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
```

Insert this comment immediately above the `return (`:

```tsx
  // KEEP IN SYNC: the standard fields below are mirrored, read-only, in the
  // organizer's form builder — see standard-fields-card.tsx under
  // app/(routes)/events/tournament/[id]/registration-form/_components/.
  // Adding, removing or renaming a field here means updating STANDARD_FIELDS
  // there, or the builder will describe a form that no longer exists.
```

- [ ] **Step 8: Verify the public form is otherwise untouched**

Run: `git diff --stat "app/p/tournament/[id]/register/_components/register-form.tsx"`
Expected: 5 insertions, 0 deletions — comment only.

- [ ] **Step 9: Run the full check**

Run: `npx vitest run __tests__/events/` then `./node_modules/.bin/tsc --noEmit`
Expected: all tests pass; no type errors.

- [ ] **Step 10: Commit**

```bash
git add "app/(routes)/events/tournament/[id]/registration-form/_components/registration-form-editor.tsx" "app/p/tournament/[id]/register/_components/register-form.tsx" __tests__/events/registration-form-editor-standard-fields.test.tsx
git commit -m "feat(tournament): show standard fields in the registration form builder"
```

---

## Manual verification

After both tasks, start the dev server and open
`/events/tournament/f2a3e86d-bff9-4408-a11c-2d5568456820/registration-form`:

1. The **Standard fields** card sits at the top of the left builder column, above "VOLLEY BALL TOURNAMENTS".
2. All seven rows render, each with a lock icon, control type and condition.
3. Nothing in the card is clickable or editable.
4. The right Preview column shows the one-line note under the "Preview — what registrants will see" heading.
5. Adding, editing, reordering and saving a custom section still works unchanged.
6. `/p/tournament/f2a3e86d-bff9-4408-a11c-2d5568456820/register` renders exactly as before.

## Self-review notes

- **Spec coverage:** component (Task 1), builder placement (Task 2 Step 4), preview note (Task 2 Step 5), drift mitigation both directions (Task 1 Step 3 header comment, Task 2 Step 7), testing (Task 1 Step 1, Task 2 Step 1, Manual verification). All spec sections covered.
- **Non-goals hold:** no task adds editing, per-tournament data, or duplicate detection; Global Constraints forbid each explicitly.
- **Type consistency:** `StandardFieldsCard` and `StandardFieldsNote` are the only exported names and are spelled identically in Task 1 Step 3, Task 2 Step 3, and both test files.
