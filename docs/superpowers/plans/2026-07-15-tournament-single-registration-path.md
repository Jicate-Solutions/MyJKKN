# Tournament Single Registration Path + Form Builder Page — Implementation Plan

> **For agents:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make learner self-registration the only way a tournament entry is created (admins can no longer register anyone), and move the registration-form builder onto its own page where editing is local-state with an explicit Save.

**Architecture:** The builder stops writing on every keystroke. A new page loads the form once into local React state; **Save** sends the whole desired form to a new `save_event_registration_form` Postgres RPC that deletes and re-inserts sections+fields in one transaction. Admin registration is removed at both ends: the Add Entry UI is deleted and `POST /entries` is dropped, leaving `public-register` as the sole entry-creation path.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres + RLS), TanStack Query v5, Shadcn UI + Tailwind, `react-hot-toast`, `lucide-react`.

## Global Constraints

- **There is no test runner in this repo.** No `npm test`, no pytest/jest harness. NEVER write "run the tests" steps and never claim tests pass. Verification = IDE diagnostics (`mcp__ide__getDiagnostics`) + the `check:*` gates + applying the migration + exercising the feature in a browser.
- **Do not run `npm run typecheck`** (3–4 min, OOM-prone). Use `mcp__ide__getDiagnostics` per touched file.
- **Supabase errors are plain objects, not `Error` instances.** Always destructure `{ error }` and check it; never fire-and-forget a mutation.
- **Commit the real SQL body** to `supabase/migrations/` — never a `SELECT 1;` placeholder — and mirror functions into `supabase/setup/02_functions.sql`.
- **Do not hardcode role names in SQL.** Authorization for the form tables is already handled by the existing `_manage` RLS policies.
- Branch: `feat/tournament-single-registration-path`. Commit after every task.
- Spec: `docs/superpowers/specs/2026-07-15-tournament-single-registration-path-and-form-builder-page-design.md`

---

### Task 1: Bulk-save RPC (`save_event_registration_form`)

**Why:** The builder needs one atomic write for "here is the whole form." `custom_fields` answers key on `field_key` (not row `id`), so delete-all-then-reinsert is safe and removes all diffing logic.

**Files:**
- Create: `supabase/migrations/20260715090000_save_event_registration_form_rpc.sql`
- Modify: `supabase/setup/02_functions.sql` (append the same function)

**Interfaces:**
- Produces: RPC `save_event_registration_form(p_event_id uuid, p_is_enabled boolean, p_sections jsonb) RETURNS void`, callable by `authenticated`. Task 2 consumes it.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260715090000_save_event_registration_form_rpc.sql`:

```sql
-- Atomic bulk save for a tournament's dynamic registration form.
--
-- SECURITY INVOKER (default) on purpose: the existing
-- event_registration_form{s,_sections,_fields} "_manage" RLS policies already
-- encode exactly the tournament manage rule --
--   is_super_admin() OR is_admin() OR fn_is_event_incharge(event_id)
--   OR (user_has_permission('sports.tournaments.manage') AND institution access)
-- -- so running as the caller reuses that gate verbatim (in-charges included)
-- and needs no service-role and no re-encoded auth. A non-manager who calls
-- this simply fails the RLS WITH CHECK inside the function, which raises and
-- rolls the whole transaction back.
--
-- Strategy: delete-all-then-reinsert. Safe because
-- events_registrations.custom_fields keys answers by field_key, never by the
-- field row id -- so churning ids on save orphans nothing. This keeps the
-- client payload a plain "desired final state" with no ids and no diffing.

BEGIN;

CREATE OR REPLACE FUNCTION save_event_registration_form(
  p_event_id uuid,
  p_is_enabled boolean,
  p_sections jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_form_id    uuid;
  v_section    jsonb;
  v_section_id uuid;
  v_field      jsonb;
BEGIN
  -- 1. Lazy-create / update the form row (RLS authorizes via WITH CHECK).
  INSERT INTO event_registration_forms (event_id, is_enabled)
  VALUES (p_event_id, COALESCE(p_is_enabled, true))
  ON CONFLICT (event_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled
  RETURNING id INTO v_form_id;

  -- 2. Clear existing structure; fields cascade off sections.
  DELETE FROM event_registration_form_sections WHERE form_id = v_form_id;

  -- 3. Re-insert the desired structure, in payload order.
  FOR v_section IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_sections, '[]'::jsonb))
  LOOP
    INSERT INTO event_registration_form_sections (form_id, event_id, title, display_order)
    VALUES (
      v_form_id,
      p_event_id,
      COALESCE(NULLIF(btrim(v_section->>'title'), ''), 'Section'),
      COALESCE((v_section->>'display_order')::int, 0)
    )
    RETURNING id INTO v_section_id;

    FOR v_field IN
      SELECT * FROM jsonb_array_elements(COALESCE(v_section->'fields', '[]'::jsonb))
    LOOP
      INSERT INTO event_registration_form_fields (
        section_id, event_id, field_key, field_label, field_type, is_required,
        display_order, placeholder, help_text, min_length, max_length,
        min_value, max_value, pattern, options, condition
      )
      VALUES (
        v_section_id,
        p_event_id,
        v_field->>'field_key',
        v_field->>'field_label',
        v_field->>'field_type',
        COALESCE((v_field->>'is_required')::boolean, false),
        COALESCE((v_field->>'display_order')::int, 0),
        v_field->>'placeholder',
        v_field->>'help_text',
        (v_field->>'min_length')::int,
        (v_field->>'max_length')::int,
        (v_field->>'min_value')::numeric,
        (v_field->>'max_value')::numeric,
        v_field->>'pattern',
        CASE WHEN jsonb_typeof(v_field->'options')   = 'array'  THEN v_field->'options'   ELSE NULL END,
        CASE WHEN jsonb_typeof(v_field->'condition') = 'object' THEN v_field->'condition' ELSE NULL END
      );
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION save_event_registration_form(uuid, boolean, jsonb) IS
  'Atomically replaces a tournament registration form (sections + fields) from a desired-state payload. SECURITY INVOKER: authorization comes from the event_registration_form_* _manage RLS policies.';

REVOKE ALL ON FUNCTION save_event_registration_form(uuid, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION save_event_registration_form(uuid, boolean, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION save_event_registration_form(uuid, boolean, jsonb) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply the migration**

Apply it with the Supabase MCP tool `mcp__supabase__apply_migration` (name: `save_event_registration_form_rpc`, body: the SQL above **without** the `BEGIN;`/`COMMIT;` wrapper — the tool wraps it), or `supabase db push`.

Expected: success, no error.

- [ ] **Step 3: Verify the function exists and is correctly configured**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT p.proname,
       p.prosecdef  AS is_security_definer,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'save_event_registration_form';
```

Expected: exactly one row; `is_security_definer` = `false`; `args` = `p_event_id uuid, p_is_enabled boolean, p_sections jsonb`.

- [ ] **Step 4: Mirror into the setup reference**

Append the same `CREATE OR REPLACE FUNCTION save_event_registration_form(...)` block (plus its `COMMENT`/`GRANT` lines) to `supabase/setup/02_functions.sql`, following the file's existing ordering/comment style.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260715090000_save_event_registration_form_rpc.sql supabase/setup/02_functions.sql
git commit -m "feat(tournament): add atomic save_event_registration_form RPC

SECURITY INVOKER so the existing _manage RLS policies authorize (incl.
in-charges). Delete-all-then-reinsert is safe: custom_fields answers key
on field_key, not row id.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Service method + save hook

**Files:**
- Modify: `lib/services/events/tournament/event-registration-form-service.ts` (add `saveForm`)
- Modify: `hooks/events/use-tournament-registration-form.ts` (add `useSaveRegistrationForm`)

**Interfaces:**
- Consumes: RPC `save_event_registration_form` from Task 1.
- Produces:
  - `SaveFormFieldPayload` / `SaveFormSectionPayload` (exported types)
  - `EventRegistrationFormService.saveForm(eventId: string, isEnabled: boolean, sections: SaveFormSectionPayload[]): Promise<void>`
  - `useSaveRegistrationForm(eventId: string)` — a mutation taking `{ isEnabled: boolean; sections: SaveFormSectionPayload[] }`. Task 3 consumes both.

- [ ] **Step 1: Add the payload types + `saveForm` to the service**

In `lib/services/events/tournament/event-registration-form-service.ts`, add these exported types just above `export class EventRegistrationFormService {`:

```ts
/** One field in a bulk-save payload. Carries no row id — the RPC reinserts fresh. */
export interface SaveFormFieldPayload {
  field_key: string;
  field_label: string;
  field_type: FormFieldType;
  is_required: boolean;
  display_order: number;
  placeholder: string | null;
  help_text: string | null;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  pattern: string | null;
  options: FormFieldOption[] | null;
  condition: FormFieldCondition | null;
}

/** One section in a bulk-save payload. */
export interface SaveFormSectionPayload {
  title: string;
  display_order: number;
  fields: SaveFormFieldPayload[];
}
```

Extend the existing type import at the top of the file to include the three new names:

```ts
import type {
  EventRegistrationForm,
  EventRegistrationFormSection,
  EventRegistrationFormField,
  CreateFormSectionDto,
  UpdateFormSectionDto,
  CreateFormFieldDto,
  UpdateFormFieldDto,
  FormFieldType,
  FormFieldOption,
  FormFieldCondition,
} from '@/types/tournament';
```

Add this method inside the class, immediately after `updateForm`:

```ts
  /**
   * Atomically replace the whole form (sections + fields) with the desired
   * state. One RPC = one transaction, so a partial failure rolls back.
   * Authorization is the tables' _manage RLS policies (the RPC is SECURITY
   * INVOKER) — the same gate the granular CRUD above already relies on.
   */
  static async saveForm(
    eventId: string,
    isEnabled: boolean,
    sections: SaveFormSectionPayload[]
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any).rpc('save_event_registration_form', {
      p_event_id: eventId,
      p_is_enabled: isEnabled,
      p_sections: sections,
    });
    if (error) throw error;
  }
```

- [ ] **Step 2: Add the save hook**

In `hooks/events/use-tournament-registration-form.ts`, extend the service import and add the hook after `useUpdateRegistrationForm`:

```ts
import {
  EventRegistrationFormService,
  type SaveFormSectionPayload,
} from '@/lib/services/events/tournament/event-registration-form-service';
```

```ts
/** Save the entire form in one atomic RPC (the builder page's only write). */
export function useSaveRegistrationForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      isEnabled,
      sections,
    }: {
      isEnabled: boolean;
      sections: SaveFormSectionPayload[];
    }) => EventRegistrationFormService.saveForm(eventId, isEnabled, sections),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.form(eventId) });
      toast.success('Registration form saved');
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to save the form'),
  });
}
```

Add this import at the top of the hooks file (Supabase errors are plain objects — `e.message` alone can be empty):

```ts
import { getErrorMessage } from '@/lib/utils';
```

- [ ] **Step 3: Verify types**

Run `mcp__ide__getDiagnostics` on:
- `lib/services/events/tournament/event-registration-form-service.ts`
- `hooks/events/use-tournament-registration-form.ts`

Expected: no errors. If `getErrorMessage` is not exported from `@/lib/utils`, grep for its real location (`grep -rn "export function getErrorMessage" lib/`) and fix the import path.

- [ ] **Step 4: Commit**

```bash
git add lib/services/events/tournament/event-registration-form-service.ts hooks/events/use-tournament-registration-form.ts
git commit -m "feat(tournament): add saveForm service method + useSaveRegistrationForm hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Dedicated builder page with local-state editing

**Why:** This is the actual bug fix. The old builder bound inputs to server state and mutated on every `onChange`, so each keystroke triggered a refetch that overwrote the input mid-typing.

**Files:**
- Create: `app/(routes)/events/tournament/[id]/registration-form/_components/registration-form-editor.tsx`
- Create: `app/(routes)/events/tournament/[id]/registration-form/page.tsx`

**Interfaces:**
- Consumes: `useRegistrationForm`, `useSaveRegistrationForm`, `SaveFormSectionPayload` (Task 2); `DynamicFieldInput` from `@/components/events/dynamic-field-input`; `FORM_FIELD_TYPES` from `@/types/tournament`; `useTournament` from `@/hooks/events/use-tournaments`; `useTournamentAccess` from `@/hooks/events/use-tournament-access`.
- Produces: route `/events/tournament/[id]/registration-form`. Task 4 links to it.

- [ ] **Step 1: Create the editor component**

Create `app/(routes)/events/tournament/[id]/registration-form/_components/registration-form-editor.tsx`:

```tsx
'use client';

// Registration Form editor — full-page builder for one tournament's custom
// fields, layered on the fixed core fields (division / name / roster / contact)
// every registration already collects.
//
// Local-state editing on purpose: the previous inline builder bound each input
// to server state and fired a mutation + refetch on every onChange, so the
// round-trip raced the keyboard and reverted characters. Here nothing touches
// the network until Save, which sends the whole desired form to one atomic RPC.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, ArrowLeft, Save } from 'lucide-react';
import { useRegistrationForm, useSaveRegistrationForm } from '@/hooks/events/use-tournament-registration-form';
import type { SaveFormSectionPayload } from '@/lib/services/events/tournament/event-registration-form-service';
import { DynamicFieldInput, isFieldVisible } from '@/components/events/dynamic-field-input';
import { FORM_FIELD_TYPES } from '@/types/tournament';
import type {
  EventRegistrationFormField,
  FormFieldType,
  FormFieldOption,
  FormFieldCondition,
} from '@/types/tournament';

// ── Editable shapes (client-only) ────────────────────────────────────────────
// `uid` is a React key only. `field_key` is null for a brand-new field and is
// assigned from the label at save time; a loaded field keeps its DB key forever
// so previously submitted answers (stored in custom_fields BY key) never orphan.
// The attributes this UI does not expose are carried through verbatim so a save
// never silently drops them.

interface EditableField {
  uid: string;
  field_key: string | null;
  field_label: string;
  field_type: FormFieldType;
  is_required: boolean;
  help_text: string | null;
  options: FormFieldOption[] | null;
  placeholder: string | null;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  pattern: string | null;
  condition: FormFieldCondition | null;
}

interface EditableSection {
  uid: string;
  title: string;
  fields: EditableField[];
}

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `uid_${uidCounter}`;
}

function slugifyKey(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '_')
      .replace(/^_|_$/g, '') || 'field'
  );
}

function toEditableField(f: EventRegistrationFormField): EditableField {
  return {
    uid: nextUid(),
    field_key: f.field_key,
    field_label: f.field_label,
    field_type: f.field_type,
    is_required: f.is_required,
    help_text: f.help_text,
    options: f.options,
    placeholder: f.placeholder,
    min_length: f.min_length,
    max_length: f.max_length,
    min_value: f.min_value,
    max_value: f.max_value,
    pattern: f.pattern,
    condition: f.condition,
  };
}

function newField(): EditableField {
  return {
    uid: nextUid(),
    field_key: null,
    field_label: '',
    field_type: 'text',
    is_required: false,
    help_text: null,
    options: null,
    placeholder: null,
    min_length: null,
    max_length: null,
    min_value: null,
    max_value: null,
    pattern: null,
    condition: null,
  };
}

/** Serialize editor state into the RPC's desired-state payload. */
function serialize(sections: EditableSection[]): SaveFormSectionPayload[] {
  // Seed with keys already assigned so generated keys can't collide
  // (event_registration_form_fields has UNIQUE (event_id, field_key)).
  const used = new Set<string>();
  for (const s of sections) {
    for (const f of s.fields) if (f.field_key) used.add(f.field_key);
  }
  const uniquify = (base: string): string => {
    let key = base;
    let n = 2;
    while (used.has(key)) {
      key = `${base}_${n}`;
      n += 1;
    }
    used.add(key);
    return key;
  };

  return sections.map((s, si) => ({
    title: s.title.trim() || 'Section',
    display_order: si,
    fields: s.fields.map((f, fi) => ({
      field_key: f.field_key ?? uniquify(slugifyKey(f.field_label)),
      field_label: f.field_label.trim() || 'Field',
      field_type: f.field_type,
      is_required: f.is_required,
      display_order: fi,
      placeholder: f.placeholder,
      help_text: f.help_text?.trim() ? f.help_text.trim() : null,
      min_length: f.min_length,
      max_length: f.max_length,
      min_value: f.min_value,
      max_value: f.max_value,
      pattern: f.pattern,
      options: f.options && f.options.length > 0 ? f.options : null,
      condition: f.condition,
    })),
  }));
}

/** Preview needs a shape DynamicFieldInput accepts; only these props are read. */
function toPreviewField(f: EditableField, index: number): EventRegistrationFormField {
  return {
    id: f.uid,
    section_id: '',
    event_id: '',
    field_key: f.field_key ?? `preview_${index}`,
    field_label: f.field_label || 'Untitled field',
    field_type: f.field_type,
    is_required: f.is_required,
    display_order: index,
    placeholder: f.placeholder,
    help_text: f.help_text,
    min_length: f.min_length,
    max_length: f.max_length,
    min_value: f.min_value,
    max_value: f.max_value,
    pattern: f.pattern,
    options: f.options,
    condition: f.condition,
    created_at: '',
    updated_at: '',
  };
}

// ── Field row ────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  isFirst,
  isLast,
  onMove,
  onUpdate,
  onDelete,
}: {
  field: EditableField;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onUpdate: (updates: Partial<EditableField>) => void;
  onDelete: () => void;
}) {
  const needsOptions =
    field.field_type === 'select' || field.field_type === 'multi_select' || field.field_type === 'radio';
  const optionsText = (field.options ?? []).map((o) => o.label).join('\n');

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Field label</Label>
          <Input
            value={field.field_label}
            onChange={(e) => onUpdate({ field_label: e.target.value })}
            placeholder="e.g. T-shirt size"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Field type</Label>
          <Select
            value={field.field_type}
            onValueChange={(v) => onUpdate({ field_type: v as FormFieldType })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORM_FIELD_TYPES.filter((t) => t.value !== 'file').map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {needsOptions && (
        <div className="space-y-1.5">
          <Label>Options (one per line)</Label>
          <Textarea
            rows={3}
            value={optionsText}
            onChange={(e) =>
              onUpdate({
                options: e.target.value
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l) => ({ label: l, value: slugifyKey(l) })),
              })
            }
            placeholder={'Small\nMedium\nLarge'}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Help text (optional)</Label>
        <Input
          value={field.help_text ?? ''}
          onChange={(e) => onUpdate({ help_text: e.target.value || null })}
          placeholder="Shown under the field"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={field.is_required} onCheckedChange={(v) => onUpdate({ is_required: v })} />
          <Label className="text-sm">Required</Label>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={isFirst} onClick={() => onMove('up')} title="Move up">
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={isLast} onClick={() => onMove('down')} title="Move down">
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onDelete} title="Remove field">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────

export function RegistrationFormEditor({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { data: form, isLoading } = useRegistrationForm(eventId);
  const save = useSaveRegistrationForm(eventId);

  const [sections, setSections] = useState<EditableSection[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});

  // Seed local state from the server ONCE. Re-seeding on every refetch is what
  // made the old builder clobber in-progress typing.
  useEffect(() => {
    if (!form || seeded) return;
    setSections(
      (form.sections ?? []).map((s) => ({
        uid: nextUid(),
        title: s.title,
        fields: (s.fields ?? []).map(toEditableField),
      }))
    );
    setIsEnabled(form.is_enabled !== false);
    setSeeded(true);
  }, [form, seeded]);

  // Warn before losing unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function mutate(next: EditableSection[]) {
    setSections(next);
    setDirty(true);
  }

  function addSection() {
    mutate([...sections, { uid: nextUid(), title: 'New section', fields: [] }]);
  }
  function updateSection(uid: string, title: string) {
    mutate(sections.map((s) => (s.uid === uid ? { ...s, title } : s)));
  }
  function deleteSection(uid: string) {
    mutate(sections.filter((s) => s.uid !== uid));
  }
  function moveSection(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next);
  }
  function addField(sectionUid: string) {
    mutate(sections.map((s) => (s.uid === sectionUid ? { ...s, fields: [...s.fields, newField()] } : s)));
  }
  function updateField(sectionUid: string, fieldUid: string, updates: Partial<EditableField>) {
    mutate(
      sections.map((s) =>
        s.uid === sectionUid
          ? { ...s, fields: s.fields.map((f) => (f.uid === fieldUid ? { ...f, ...updates } : f)) }
          : s
      )
    );
  }
  function deleteField(sectionUid: string, fieldUid: string) {
    mutate(
      sections.map((s) =>
        s.uid === sectionUid ? { ...s, fields: s.fields.filter((f) => f.uid !== fieldUid) } : s
      )
    );
  }
  function moveField(sectionUid: string, index: number, direction: 'up' | 'down') {
    mutate(
      sections.map((s) => {
        if (s.uid !== sectionUid) return s;
        const target = direction === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= s.fields.length) return s;
        const fields = [...s.fields];
        [fields[index], fields[target]] = [fields[target], fields[index]];
        return { ...s, fields };
      })
    );
  }

  async function onSave() {
    await save.mutateAsync({ isEnabled, sections: serialize(sections) });
    setDirty(false);
    // Let the refetch reseed with server-assigned field_keys.
    setSeeded(false);
  }

  const previewSections = useMemo(
    () =>
      sections.map((s) => ({
        uid: s.uid,
        title: s.title,
        fields: s.fields.map(toPreviewField),
      })),
    [sections]
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/events/tournament/${eventId}`)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Switch
              id="form-enabled"
              checked={isEnabled}
              onCheckedChange={(v) => {
                setIsEnabled(v);
                setDirty(true);
              }}
            />
            <Label htmlFor="form-enabled" className="text-sm">
              Collect custom fields
            </Label>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
          <Button onClick={onSave} disabled={!dirty || save.isPending}>
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Add custom questions learners answer when they register, on top of the standard
        division / name / roster / contact fields every tournament already collects. These apply
        to all divisions in this tournament.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Builder ── */}
        <div className="space-y-4">
          {sections.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No custom fields yet — add a section to get started.
              </CardContent>
            </Card>
          )}

          {sections.map((section, sIdx) => (
            <div key={section.uid} className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={section.title}
                  onChange={(e) => updateSection(section.uid, e.target.value)}
                  placeholder="Section title"
                />
                <Button type="button" variant="ghost" size="icon" disabled={sIdx === 0} onClick={() => moveSection(sIdx, 'up')} title="Move section up">
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" disabled={sIdx === sections.length - 1} onClick={() => moveSection(sIdx, 'down')} title="Move section down">
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => deleteSection(section.uid)} title="Remove section">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>

              <div className="space-y-2">
                {section.fields.map((field, fIdx) => (
                  <FieldRow
                    key={field.uid}
                    field={field}
                    isFirst={fIdx === 0}
                    isLast={fIdx === section.fields.length - 1}
                    onMove={(dir) => moveField(section.uid, fIdx, dir)}
                    onUpdate={(updates) => updateField(section.uid, field.uid, updates)}
                    onDelete={() => deleteField(section.uid, field.uid)}
                  />
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={() => addField(section.uid)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add field
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addSection}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add section
          </Button>
        </div>

        {/* ── Live preview ── */}
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preview — what registrants will see
          </p>
          {!isEnabled && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Custom fields are turned off — learners will only see the standard fields.
            </p>
          )}
          {isEnabled && previewSections.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
          {isEnabled &&
            previewSections.map((section) => (
              <div key={section.uid} className="space-y-3">
                <p className="text-sm font-semibold">{section.title || 'Untitled section'}</p>
                {section.fields
                  .filter((f) => isFieldVisible(f, previewValues))
                  .map((f) => (
                    <DynamicFieldInput
                      key={f.id}
                      field={f}
                      value={previewValues[f.field_key]}
                      onChange={(v) => setPreviewValues((prev) => ({ ...prev, [f.field_key]: v }))}
                    />
                  ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

Create `app/(routes)/events/tournament/[id]/registration-form/page.tsx`:

```tsx
'use client';

// Registration Form builder — dedicated page for one tournament.
// Split out of the detail page (2026-07): the inline builder was cramped and
// saved on every keystroke. Reached from the detail page's Registration card;
// gated by the same canManage rule the inline section used.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useTournament } from '@/hooks/events/use-tournaments';
import { useTournamentAccess } from '@/hooks/events/use-tournament-access';
import { RegistrationFormEditor } from './_components/registration-form-editor';

export default function TournamentRegistrationFormPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: tournament, isLoading } = useTournament(id);
  const access = useTournamentAccess(id, tournament);
  const canManage = access.canManage;

  // Managers only — mirrors the old inline builder's `if (!canManage) return null`.
  useEffect(() => {
    if (!isLoading && tournament && !canManage) {
      router.replace(`/events/tournament/${id}`);
    }
  }, [isLoading, tournament, canManage, id, router]);

  if (isLoading) {
    return (
      <ContentLayout title="Registration Form">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (!tournament) {
    return (
      <ContentLayout title="Registration Form">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Tournament not found, or you don&apos;t have access to it.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!canManage) return null; // redirecting

  return (
    <ContentLayout title={`Registration Form · ${tournament.name}`}>
      <PageBreadcrumb
        items={[
          { label: 'Events', href: '/events' },
          { label: 'Tournaments', href: '/events/tournament' },
          { label: tournament.name, href: `/events/tournament/${id}` },
          { label: 'Registration Form' },
        ]}
      />
      <RegistrationFormEditor eventId={id} />
    </ContentLayout>
  );
}
```

- [ ] **Step 3: Verify types**

Run `mcp__ide__getDiagnostics` on both new files. Expected: no errors.

If `useTournamentAccess`'s signature differs, open `hooks/events/use-tournament-access.ts` and match the detail page's usage at `app/(routes)/events/tournament/[id]/page.tsx:303`.

- [ ] **Step 4: Exercise it in the browser**

Run `npm run dev`. As a user with `sports.tournaments.manage` (or an in-charge), open
`/events/tournament/<a real tournament id>/registration-form`.

Verify, and do not proceed until all pass:
1. Add a section, type a title **fast** — every character sticks, no reverts, no cursor jump.
2. Add a field, type a label fast — same.
3. Set type = "Dropdown (single choice)", enter 3 options — the right-hand preview renders a working dropdown.
4. "Unsaved changes" appears; **Save** persists and toasts "Registration form saved".
5. Reload the page — everything you built is still there.
6. Reorder a field with the arrows, Save, reload — order persisted.
7. Delete a field, Save, reload — it's gone.

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/events/tournament/[id]/registration-form"
git commit -m "feat(tournament): dedicated registration-form builder page

Local-state editing + explicit Save via the atomic RPC. Fixes the inline
builder's per-keystroke mutate+refetch, which reverted typing.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Detail page — Registration card in, Add Entry out

**Files:**
- Create: `app/(routes)/events/tournament/[id]/_components/registration-form-card.tsx`
- Modify: `app/(routes)/events/tournament/[id]/page.tsx`
- Delete: `app/(routes)/events/tournament/[id]/_components/add-entry-dialog.tsx`
- Delete: `app/(routes)/events/tournament/[id]/_components/registration-form-builder.tsx`

**Interfaces:**
- Consumes: route `/events/tournament/[id]/registration-form` (Task 3); `useRegistrationForm` (existing).
- Produces: `RegistrationFormCard({ eventId, canManage })`.

- [ ] **Step 1: Create the Registration card**

Create `app/(routes)/events/tournament/[id]/_components/registration-form-card.tsx`:

```tsx
'use client';

// Compact Registration card on the tournament detail page. Replaces the old
// inline builder: the builder now lives on its own page. Learners register
// only through the public link — organizers configure the questions here.

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { useRegistrationForm } from '@/hooks/events/use-tournament-registration-form';

export function RegistrationFormCard({
  eventId,
  canManage,
}: {
  eventId: string;
  canManage: boolean;
}) {
  const { data: form } = useRegistrationForm(canManage ? eventId : '');

  if (!canManage) return null;

  const sections = form?.sections ?? [];
  const fieldCount = sections.reduce((n, s) => n + (s.fields?.length ?? 0), 0);
  const enabled = form?.is_enabled !== false;

  const summary = !enabled
    ? 'Custom fields are turned off.'
    : fieldCount === 0
      ? 'No custom fields yet — learners only answer the standard fields.'
      : `${fieldCount} custom ${fieldCount === 1 ? 'field' : 'fields'} across ${sections.length} ${
          sections.length === 1 ? 'section' : 'sections'
        }.`;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="rounded-md bg-emerald-50 p-1.5 dark:bg-emerald-950/50">
            <ClipboardList className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </span>
          Registration Form
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
        <p className="text-sm text-muted-foreground">
          Configure the questions learners answer when they register. {summary}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href={`/events/tournament/${eventId}/registration-form`}>
            Manage registration form <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Swap the imports in the detail page**

In `app/(routes)/events/tournament/[id]/page.tsx`, delete these two lines (~67 and ~70):

```tsx
import { AddEntryDialog } from './_components/add-entry-dialog';
import { RegistrationFormBuilder } from './_components/registration-form-builder';
```

and add:

```tsx
import { RegistrationFormCard } from './_components/registration-form-card';
```

- [ ] **Step 3: Remove the dialog state**

Delete these two lines (~312–313):

```tsx
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDivision, setDialogDivision] = useState<string | undefined>(undefined);
```

- [ ] **Step 4: Swap the builder for the card**

Replace (~557–558):

```tsx
      {/* ── Registration Form builder ────────────────────────────────────── */}
      <RegistrationFormBuilder eventId={id} canManage={canManage} />
```

with:

```tsx
      {/* ── Registration form (builder lives on its own page) ─────────────── */}
      <RegistrationFormCard eventId={id} canManage={canManage} />
```

- [ ] **Step 5: Remove the per-division Add Entry button**

Delete this whole block from the division card header (~643–653):

```tsx
                  {canManage && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setDialogDivision(d.id);
                        setDialogOpen(true);
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add Entry
                    </Button>
                  )}
```

- [ ] **Step 6: Remove the dialog render**

Delete this block near the end (~761–767):

```tsx
      <AddEntryDialog
        eventId={id}
        divisions={divisions}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDivisionId={dialogDivision}
      />
```

- [ ] **Step 7: Fix the now-unused `Plus` import**

`Plus` was only used by the Add Entry button. Remove `Plus,` from the `lucide-react` import block (~31) **only if** no other usage remains:

```bash
grep -n "Plus" "app/(routes)/events/tournament/[id]/page.tsx"
```

If the only hit is the import line, delete `Plus,` from it. Also update the empty-divisions copy (~616) which tells organizers to "register entries here":

```tsx
            No divisions yet. Add divisions from the tournament edit screen. Learners then register
            themselves through the public registration link.
```

- [ ] **Step 8: Delete the two dead components**

```bash
git rm "app/(routes)/events/tournament/[id]/_components/add-entry-dialog.tsx" "app/(routes)/events/tournament/[id]/_components/registration-form-builder.tsx"
```

- [ ] **Step 9: Verify**

Run `mcp__ide__getDiagnostics` on `app/(routes)/events/tournament/[id]/page.tsx` and the new card. Expected: no errors, no unresolved imports.

Then confirm nothing still imports the deleted files:

```bash
grep -rn "add-entry-dialog\|registration-form-builder" app/ components/ hooks/ lib/
```

Expected: no output.

In the browser, open a tournament detail page and verify:
1. **No "Add Entry" button** on any division.
2. A **Registration Form** card appears with a working "Manage registration form →" link.
3. Existing entries still list, and mark-paid / payment-link / withdraw still work.

- [ ] **Step 10: Commit**

```bash
git add -A "app/(routes)/events/tournament/[id]"
git commit -m "feat(tournament): replace inline builder with Registration card, remove Add Entry UI

Learners self-register via the public link; organizers only configure the
questions. Deletes add-entry-dialog and the old inline builder.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Server lockdown + dead-code removal

**Why:** Deleting the UI is cosmetic — an admin could still POST. This closes the path for real.

**Files:**
- Modify: `app/api/events/tournament/[eventId]/entries/route.ts` (drop `POST`, keep `GET`)
- Modify: `hooks/events/use-tournament-registrations.ts` (drop `useRegisterEntry`)
- Modify: `lib/services/events/tournament/tournament-registration-service.ts` (drop `register`)
- Delete: `app/api/events/tournament/learner-search/route.ts`

- [ ] **Step 1: Drop the POST handler**

In `app/api/events/tournament/[eventId]/entries/route.ts`, delete **everything from** the `// ---------------------------------------------------------------------------` / `// POST — register an entry` banner (~line 80) **to the end of the file** — i.e. the entire `export async function POST(...) { ... }`. Keep `GET` untouched.

Then update the file's header comment (lines 3–12) to:

```ts
// /api/events/tournament/[eventId]/entries
//   GET — organizer list of entries for a tournament (joined with payment + roster).
//
// There is deliberately NO POST here. Tournament entries are created ONLY by
// learners self-registering through /api/events/tournament/[eventId]/public-register
// (single registration path, 2026-07); organizers configure the form and manage
// existing entries, but cannot register anyone. Removing the handler makes POST
// return 405.
```

Finally, prune imports that only POST used. After deleting POST, these become unused:

```ts
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';
import { checkEligibility, type EligibilitySubject } from '@/lib/services/events/tournament/eligibility';
import { validateCustomFields } from '@/lib/services/events/tournament/event-registration-form-service';
import type { CreateEntryDto, EligibilityRules } from '@/types/tournament';
```

Reduce the import block to exactly what `GET` uses:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { canViewTournament } from '@/lib/services/events/tournament/organizer-access';
```

- [ ] **Step 2: Remove `useRegisterEntry`**

In `hooks/events/use-tournament-registrations.ts`, delete this whole hook (~25–40):

```ts
/** Register a team/individual. Returns the result (incl. an online payment_url). */
export function useRegisterEntry(eventId: string) { /* ... */ }
```

Leave `useTournamentEntries`, `useUpdateEntry`, `useMarkEntryPaid`, `useWithdrawEntry`, `useGeneratePaymentLink` untouched.

- [ ] **Step 3: Remove the service `register` method**

In `lib/services/events/tournament/tournament-registration-service.ts`, delete (~31–39):

```ts
  /** Register a team or individual into a division. */
  static async register(eventId: string, dto: CreateEntryDto): Promise<RegisterEntryResult> { /* ... */ }
```

Then drop `CreateEntryDto` and `RegisterEntryResult` from the type import block if nothing else in the file uses them (check with `grep -n "CreateEntryDto\|RegisterEntryResult" lib/services/events/tournament/tournament-registration-service.ts`). The block should end up as:

```ts
import type { TournamentEntry, UpdateEntryDto } from '@/types/tournament';
```

Leave the `CreateEntryDto` / `RegisterEntryResult` definitions in `types/tournament.ts` alone — `public-register` still uses that shape.

- [ ] **Step 4: Delete the dead learner-search route**

Only the Add Entry dialog called it.

```bash
git rm "app/api/events/tournament/learner-search/route.ts"
```

**Do not touch `lib/utils/learner-search.ts`** — that's a different, widely-used shared util.

- [ ] **Step 5: Verify no dangling references**

```bash
grep -rn "useRegisterEntry\|TournamentRegistrationService.register\b" app/ components/ hooks/ lib/
grep -rn "events/tournament/learner-search" app/ components/ hooks/ lib/
```

Expected: no output from either (a comment referencing the pattern in `app/api/events/committees/member-directory/route.ts` is fine — it's only prose; leave it).

Run `mcp__ide__getDiagnostics` on the three modified files. Expected: no errors.

- [ ] **Step 6: Verify POST is actually blocked**

With `npm run dev` running and signed in as a manager, in the browser console on the app's origin:

```js
await fetch('/api/events/tournament/<REAL_EVENT_ID>/entries', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
}).then(r => r.status);
```

Expected: `405`.

Then confirm `GET` still works — reload the detail page and see entries listed.

- [ ] **Step 7: Commit**

```bash
git add -A app/api/events/tournament hooks/events/use-tournament-registrations.ts lib/services/events/tournament/tournament-registration-service.ts
git commit -m "feat(tournament): block organizer entry creation, remove dead registration code

Drops POST /entries (GET kept), useRegisterEntry, the service register
method, and the Add-Entry-only learner-search route. public-register is
now the only path that creates an entry.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Gates + end-to-end verification

**Files:**
- Modify (if the gate demands it): the route manifest / reachability exemption config.

- [ ] **Step 1: Regenerate the route manifest**

```bash
npm run gen:routes
```

Expected: succeeds; the manifest now includes `/events/tournament/[id]/registration-form`.

- [ ] **Step 2: Run the nav/permission gates**

```bash
npm run check:reachability
npm run check:menus
```

Expected: both pass. If `check:reachability` flags `/events/tournament/[id]/registration-form` as unreachable, it is reachable in practice via the Registration card's `<Link>`; if the checker still can't see it, add it to the same exemption list that already exempts the parent `[id]` route. Find that list with:

```bash
grep -rn "reachab" scripts/ package.json | head -20
```

Add the sub-route beside the existing tournament `[id]` entry, with a one-line comment: `# detail sub-page, reached from the Registration card`.

- [ ] **Step 3: Full end-to-end pass (as a manager)**

With `npm run dev`:
1. Detail page → **no Add Entry** anywhere; Registration card present.
2. **Manage registration form →** opens the new page; add a section + a required text field + a dropdown; type fast — nothing reverts; **Save**.
3. Reload the builder page — everything persisted.
4. Copy the registration link from the detail header, open `/p/tournament/<id>/register` (a logged-out window is fine) — your custom fields render under their section.
5. Submit a registration there; leaving the required custom field blank must be rejected.
6. Back on the detail page, the new entry appears; **mark paid** / **withdraw** still work.
7. `POST /entries` returns `405` (from Task 5, Step 6).

- [ ] **Step 4: Verify the answers landed under the right keys**

Via `mcp__supabase__execute_sql`:

```sql
SELECT custom_fields
FROM events_registrations
WHERE event_id = '<REAL_EVENT_ID>'
ORDER BY created_at DESC
LIMIT 1;
```

Expected: a JSON object keyed by readable `field_key`s derived from your labels (e.g. `{"t_shirt_size": "medium"}`) — **not** `field_1752…` style keys.

- [ ] **Step 5: Confirm the non-manager path**

As a user without `sports.tournaments.manage` who is not an in-charge, open
`/events/tournament/<id>/registration-form`. Expected: redirected to the detail page; no Registration card visible.

- [ ] **Step 6: Commit any gate changes**

```bash
git add -A
git commit -m "chore(tournament): route manifest + reachability for registration-form page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** single path (T4+T5) · builder page (T3) · explicit Save (T2+T3) · atomic RLS-enforced RPC (T1) · `field_key` stability (T3 `serialize` + T6 Step 4) · detail-page card (T4) · dead-code removal (T4+T5) · gates (T6). Copy-link stays in the header per the spec default (untouched — no task needed).
- **Type consistency:** `SaveFormSectionPayload` / `SaveFormFieldPayload` are defined in Task 2 and consumed by name in Task 3; `RegistrationFormEditor({ eventId })` (T3) is rendered by the T3 page; `RegistrationFormCard({ eventId, canManage })` (T4) matches its usage in the detail page.
- **Known deviation from spec:** the spec's original "PUT API route + SECURITY DEFINER RPC" was superseded (in the committed spec) by the SECURITY INVOKER RPC once the `_manage` policies were confirmed to already encode `canManageTournament`.
