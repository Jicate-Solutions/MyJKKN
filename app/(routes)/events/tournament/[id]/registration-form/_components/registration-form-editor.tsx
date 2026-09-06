'use client';

// Registration Form editor — full-page builder for one tournament's custom
// fields, layered on the fixed core fields (division / name / roster / contact)
// every registration already collects.
//
// Local-state editing on purpose: the previous inline builder bound each input
// to server state and fired a mutation + refetch on every onChange, so the
// round-trip raced the keyboard and reverted characters. Here nothing touches
// the network until Save, which sends the whole desired form to one atomic RPC.

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { StandardFieldsCard, StandardFieldsPreview } from './standard-fields-card';
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
  /** Public image URL for an 'image_display' field; null for every other type. */
  media_url: string | null;
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
    media_url: f.media_url ?? null,
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
    media_url: null,
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
      // Without this the save RPC (which DELETEs and reinserts every field)
      // would wipe the organizer's image on any unrelated edit.
      media_url: f.media_url,
    })),
  }));
}

/** Preview needs a shape DynamicFieldInput accepts; only these props are read. */
function toPreviewField(f: EditableField, index: number): EventRegistrationFormField {
  return {
    id: f.uid,
    section_id: '',
    form_id: '',
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
    media_url: f.media_url,
    created_at: '',
    updated_at: '',
  };
}

// ── Display-image picker ─────────────────────────────────────────────────────

/**
 * Uploads the image an 'image_display' field shows and hands back its PUBLIC
 * URL. Organizer-side only: this posts to the authenticated /form-media route
 * and the public `event-form-media` bucket — never the private bucket that
 * holds registrants' documents.
 */
function FormMediaPicker({
  eventId,
  formId,
  value,
  onChange,
}: {
  eventId: string;
  formId: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('form_id', formId);
      const res = await fetch(`/api/events/${eventId}/form-media`, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
      onChange(json.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>Image shown to registrants</Label>
      {value ? (
        <div className="flex items-start gap-3 rounded-md border p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Form image" className="h-20 w-20 rounded object-cover" />
          <div className="flex-1 space-y-1.5">
            <p className="text-xs text-muted-foreground break-all">{value}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
              Remove image
            </Button>
          </div>
        </div>
      ) : (
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={busy}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      )}
      {busy && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!value && <p className="text-xs text-muted-foreground">JPG, PNG, WebP or GIF · max 5 MB</p>}
    </div>
  );
}

// ── Field row ────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  isFirst,
  isLast,
  onMove,
  onUpdate,
  onDelete,
  eventId,
  formId,
}: {
  field: EditableField;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onUpdate: (updates: Partial<EditableField>) => void;
  onDelete: () => void;
  /** Needed to upload a display image against the right form. */
  eventId: string;
  formId: string;
}) {
  const needsOptions =
    field.field_type === 'select' || field.field_type === 'multi_select' || field.field_type === 'radio';
  const optionsText = (field.options ?? []).map((o) => o.label).join('\n');
  // Display-only: it publishes an image instead of asking a question, so the
  // answer-shaped settings (Required, validation) are meaningless for it.
  const isDisplayImage = field.field_type === 'image_display';

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
              {/* 'file' used to be filtered out here, so an organizer could
                  never actually add one — the type existed in the union, the DB
                  constraint and the renderer, but not in this list. It stays now
                  that uploads really store the file. */}
              {FORM_FIELD_TYPES.map((t) => (
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

      {isDisplayImage && (
        <FormMediaPicker
          eventId={eventId}
          formId={formId}
          value={field.media_url}
          onChange={(url) => onUpdate({ media_url: url })}
        />
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
          {isDisplayImage ? (
            <p className="text-xs text-muted-foreground">
              Shown to everyone — collects no answer.
            </p>
          ) : (
            <>
              <Switch
                checked={field.is_required}
                onCheckedChange={(v) => onUpdate({ is_required: v })}
              />
              <Label className="text-sm">Required</Label>
            </>
          )}
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

export function RegistrationFormEditor({
  eventId,
  formId,
  variant = 'tournament',
  backHref,
}: {
  eventId: string;
  /**
   * WHICH form on the event is being edited. An event holds many named forms
   * (one per monthly run, say), so the builder is addressed by form, not by
   * event — keying it on eventId is what used to make every form show every
   * other form's fields.
   */
  formId: string;
  /**
   * Which event this builder is editing. 'tournament' shows the built-in
   * division / roster / entry-fee panels; 'general' hides them, because a
   * lecture or cultural programme has no such fields — advertising them would
   * promise registrants a form that does not exist. Defaults to 'tournament'
   * so the original caller is unchanged.
   */
  variant?: 'tournament' | 'general';
  /** Where "Back" returns to. Defaults to the tournament detail page. */
  backHref?: string;
}) {
  const router = useRouter();
  const isTournament = variant === 'tournament';
  const backTo = backHref ?? `/events/tournament/${eventId}`;
  const { data: form, isLoading } = useRegistrationForm(formId);
  const save = useSaveRegistrationForm(eventId);

  const [sections, setSections] = useState<EditableSection[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});

  // Latest editable state, readable after an await. Lets onSave tell whether the
  // user changed anything while the save was in flight (inputs and the enable
  // switch both stay live during a save).
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  const isEnabledRef = useRef(isEnabled);
  useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);

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

  function applyLocal(next: EditableSection[]) {
    setSections(next);
    setDirty(true);
  }

  function addSection() {
    applyLocal([...sections, { uid: nextUid(), title: 'New section', fields: [] }]);
  }
  function updateSection(uid: string, title: string) {
    applyLocal(sections.map((s) => (s.uid === uid ? { ...s, title } : s)));
  }
  function deleteSection(uid: string) {
    applyLocal(sections.filter((s) => s.uid !== uid));
  }
  function moveSection(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    applyLocal(next);
  }
  function addField(sectionUid: string) {
    applyLocal(sections.map((s) => (s.uid === sectionUid ? { ...s, fields: [...s.fields, newField()] } : s)));
  }
  function updateField(sectionUid: string, fieldUid: string, updates: Partial<EditableField>) {
    applyLocal(
      sections.map((s) =>
        s.uid === sectionUid
          ? { ...s, fields: s.fields.map((f) => (f.uid === fieldUid ? { ...f, ...updates } : f)) }
          : s
      )
    );
  }
  function deleteField(sectionUid: string, fieldUid: string) {
    applyLocal(
      sections.map((s) =>
        s.uid === sectionUid ? { ...s, fields: s.fields.filter((f) => f.uid !== fieldUid) } : s
      )
    );
  }
  function moveField(sectionUid: string, index: number, direction: 'up' | 'down') {
    applyLocal(
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
    const snapshot = sections;
    const enabledSnapshot = isEnabled;
    const payload = serialize(snapshot);

    // Capture uid -> the key we are about to persist, BEFORE the await, so the
    // mapping survives any edit/reorder the user makes while the save is inflight.
    const keyByUid = new Map<string, string>();
    snapshot.forEach((section, si) =>
      section.fields.forEach((field, fi) => {
        const assigned = payload[si]?.fields[fi]?.field_key;
        if (assigned) keyByUid.set(field.uid, assigned);
      })
    );

    await save.mutateAsync({ formId, isEnabled: enabledSnapshot, sections: payload });

    // Inputs and the enable switch stay live during a save, so anything changed
    // in that window was never sent. Every local edit replaces the sections
    // array, so an unchanged reference (and an unchanged switch) means nothing
    // was touched and we can safely mark the form clean.
    const editedDuringSave =
      sectionsRef.current !== snapshot || isEnabledRef.current !== enabledSnapshot;

    // Adopt the persisted keys so a brand-new field keeps a stable field_key on
    // the next save. Deliberately NOT done by re-seeding from the refetch:
    // mutateAsync resolves before the invalidated query refetches, so re-seeding
    // would race and could restore pre-save state.
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        fields: section.fields.map((field) => ({
          ...field,
          field_key: field.field_key ?? keyByUid.get(field.uid) ?? null,
        })),
      }))
    );
    setDirty(editedDuringSave);
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
          <Button variant="ghost" size="sm" onClick={() => router.push(backTo)}>
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

      {isTournament ? (
        <>
          <p className="text-sm text-muted-foreground">
            Add custom questions learners answer when they register, on top of the standard
            division / name / roster / contact fields every tournament already collects. These apply
            to all divisions in this tournament.
          </p>
          <p className="text-sm text-muted-foreground">
            Payment is not a field here — each division carries its own{' '}
            <span className="font-medium text-foreground">Entry Fee</span>, editable from the
            tournament page. Set it above ₹0 and the registration form collects it online
            automatically.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Build the questions attendees answer when they register for this event. Unlike a
          tournament, nothing is collected automatically — every question here is one you add.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Builder ── */}
        <div className="space-y-4">
          {/* Pinned above the sections: what the form already collects, so an
              organizer does not re-create a built-in field as a custom one.
              Tournament-only — a general event collects nothing by default. */}
          {isTournament && <StandardFieldsCard />}

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
                    eventId={eventId}
                    formId={formId}
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
          {/* Unconditional for tournaments: the standard fields are collected
              whether or not custom fields are enabled, so this heading would
              otherwise lie. A general event has no standard fields to show. */}
          {isTournament && <StandardFieldsPreview />}
          {!isEnabled && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {isTournament
                ? 'Custom fields are turned off — learners will only see the standard fields.'
                : 'Custom fields are turned off — this form collects nothing.'}
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
