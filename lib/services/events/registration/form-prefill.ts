// lib/services/events/registration/form-prefill.ts
//
// "Prefill from profile" for public registration forms.
//
// A field on a custom registration form can name ONE profile attribute
// (`event_registration_form_fields.prefill_source`). When a signed-in MyJKKN
// user opens the public form, the page resolves their profile, their staff row
// (learning facilitators) and their learner row (learners) into a flat
// {source → value} map and the form seeds every such field with it. A guest
// gets nothing prefilled and types as before. Prefilled values stay editable —
// this is a convenience, not a lock.
//
// Pure module: no Supabase, no React, so the mapping is unit-testable.

/** Catalog of what a field may be prefilled from. Stored verbatim in the DB. */
export const REGISTRATION_PREFILL_SOURCES = [
  { value: 'full_name', label: 'Full name', group: 'Everyone' },
  { value: 'email', label: 'Email', group: 'Everyone' },
  { value: 'phone', label: 'Mobile number', group: 'Everyone' },
  { value: 'person_type', label: 'Learner / Learning Facilitator', group: 'Everyone' },
  { value: 'institution', label: 'Institution', group: 'Everyone' },
  { value: 'department', label: 'Department', group: 'Everyone' },
  { value: 'gender', label: 'Gender', group: 'Everyone' },
  { value: 'date_of_birth', label: 'Date of birth', group: 'Everyone' },
  { value: 'degree', label: 'Degree', group: 'Learners' },
  { value: 'program', label: 'Program', group: 'Learners' },
  { value: 'roll_number', label: 'Roll number', group: 'Learners' },
  { value: 'register_number', label: 'Register number', group: 'Learners' },
  { value: 'staff_id', label: 'Employee ID', group: 'Learning Facilitators' },
  { value: 'designation', label: 'Designation', group: 'Learning Facilitators' },
] as const;

export type RegistrationPrefillSource = (typeof REGISTRATION_PREFILL_SOURCES)[number]['value'];

export const REGISTRATION_PREFILL_SOURCE_VALUES: readonly string[] =
  REGISTRATION_PREFILL_SOURCES.map((s) => s.value);

export function isRegistrationPrefillSource(v: unknown): v is RegistrationPrefillSource {
  return typeof v === 'string' && REGISTRATION_PREFILL_SOURCE_VALUES.includes(v);
}

/** {source → value}; only sources with a non-empty value are present. */
export type RegistrationPrefill = Partial<Record<RegistrationPrefillSource, string>>;

export interface PrefillProfileRow {
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  institution_id?: string | null;
  department_id?: string | null;
}
export interface PrefillStaffRow {
  staff_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  designation?: string | null;
  institution_id?: string | null;
  department_id?: string | null;
}
export interface PrefillLearnerRow {
  first_name?: string | null;
  last_name?: string | null;
  student_email?: string | null;
  college_email?: string | null;
  student_mobile?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  roll_number?: string | null;
  register_number?: string | null;
  institution_id?: string | null;
  department_id?: string | null;
  degree_id?: string | null;
  program_id?: string | null;
}
/** id → display name lookups the page resolves for the ids above. */
export interface PrefillNameLookups {
  institutions?: Record<string, string>;
  departments?: Record<string, string>;
  degrees?: Record<string, string>;
  programs?: Record<string, string>;
}

const clean = (v: unknown): string => (v == null ? '' : String(v).trim());
const first = (...vals: unknown[]): string => {
  for (const v of vals) {
    const c = clean(v);
    if (c) return c;
  }
  return '';
};
const joinName = (a: unknown, b: unknown) => [clean(a), clean(b)].filter(Boolean).join(' ');

/** ISO / 'yyyy-MM-dd' → 'yyyy-MM-dd' for a date input; '' when unparseable. */
function dateOnly(v: unknown): string {
  const s = clean(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/**
 * Flatten what we know about the signed-in person into prefill values. Learner
 * and staff rows win over the profile for the fields they own; the profile
 * fills the gaps. A person with neither row (an admin, say) still gets name,
 * email, phone and institution from the profile.
 */
export function buildRegistrationPrefill(input: {
  profile: PrefillProfileRow | null;
  staff?: PrefillStaffRow | null;
  learner?: PrefillLearnerRow | null;
  names?: PrefillNameLookups;
}): RegistrationPrefill {
  const { profile, staff, learner, names = {} } = input;
  const out: RegistrationPrefill = {};
  const put = (k: RegistrationPrefillSource, v: string) => {
    if (v) out[k] = v;
  };
  const nameOf = (table: keyof PrefillNameLookups, id: unknown) =>
    clean(names[table]?.[clean(id)]);

  put(
    'full_name',
    first(
      learner ? joinName(learner.first_name, learner.last_name) : '',
      staff ? joinName(staff.first_name, staff.last_name) : '',
      profile?.full_name,
    ),
  );
  put('email', first(learner?.college_email, learner?.student_email, staff?.email, profile?.email));
  put('phone', first(learner?.student_mobile, staff?.phone, profile?.phone_number));
  put('gender', first(learner?.gender, staff?.gender, profile?.gender));
  put('date_of_birth', dateOnly(first(learner?.date_of_birth, staff?.date_of_birth, profile?.date_of_birth)));
  put('person_type', learner ? 'Learner' : staff ? 'Learning Facilitator' : '');

  put(
    'institution',
    first(
      nameOf('institutions', learner?.institution_id),
      nameOf('institutions', staff?.institution_id),
      nameOf('institutions', profile?.institution_id),
    ),
  );
  put(
    'department',
    first(
      nameOf('departments', learner?.department_id),
      nameOf('departments', staff?.department_id),
      nameOf('departments', profile?.department_id),
    ),
  );
  put('degree', nameOf('degrees', learner?.degree_id));
  put('program', nameOf('programs', learner?.program_id));
  put('roll_number', clean(learner?.roll_number));
  put('register_number', clean(learner?.register_number));
  put('staff_id', clean(staff?.staff_id));
  put('designation', clean(staff?.designation));

  return out;
}

/**
 * Seed answers for fields that name a prefill source, without overwriting
 * anything the person has already typed. Returns the same object when nothing
 * changes so React state updates are skipped.
 */
export function applyRegistrationPrefill<
  F extends { field_key: string; prefill_source?: string | null },
>(fields: F[], prefill: RegistrationPrefill, current: Record<string, unknown>): Record<string, unknown> {
  let next: Record<string, unknown> | null = null;
  for (const f of fields) {
    const src = f.prefill_source;
    if (!isRegistrationPrefillSource(src)) continue;
    const v = prefill[src];
    if (!v) continue;
    const existing = current[f.field_key];
    if (existing !== undefined && existing !== null && existing !== '') continue;
    if (!next) next = { ...current };
    next[f.field_key] = v;
  }
  return next ?? current;
}

// ── Built-in contact block ──────────────────────────────────────────────────
//
// Every public form used to open with its own "Your name / Phone / Email"
// block. A form whose custom fields already ask for those (the 360° Townhall
// asks per category) showed them twice, and a form that opens with a banner
// wanted the banner first. `event_registration_forms.contact_block` decides:
//   'top'    — built-in block first (the historic layout)
//   'bottom' — after the custom sections (banner / questions first)
//   'hidden' — not shown; name / phone / email are read from the answers.

export const CONTACT_BLOCK_MODES = [
  { value: 'top', label: 'At the top (default)' },
  { value: 'bottom', label: 'After my questions' },
  { value: 'hidden', label: "Don't ask — my own fields collect them" },
] as const;
export type ContactBlockMode = (typeof CONTACT_BLOCK_MODES)[number]['value'];

export function isContactBlockMode(v: unknown): v is ContactBlockMode {
  return v === 'top' || v === 'bottom' || v === 'hidden';
}

export interface DerivedContact {
  name: string;
  email: string;
  phone: string;
}

interface ContactSourceField {
  field_key: string;
  field_label: string;
  field_type: string;
  prefill_source?: string | null;
}

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * When the built-in block is hidden, find the registrant's name / email /
 * phone among the answers. A field explicitly mapped to the profile source
 * (full_name / email / phone) wins; otherwise the first email-typed, phone-
 * typed, or "name"-labelled text field. Only VISIBLE fields are passed in, so
 * a "Parent name" hidden by the category rule is never picked up.
 */
export function deriveContactFromAnswers(
  fields: ContactSourceField[],
  values: Record<string, unknown>,
): DerivedContact {
  const bySource = (src: string) =>
    fields.find((f) => f.prefill_source === src && str(values[f.field_key]));
  const byPredicate = (p: (f: ContactSourceField) => boolean) =>
    fields.find((f) => p(f) && str(values[f.field_key]));

  const nameField =
    bySource('full_name') ??
    byPredicate((f) => (f.field_type === 'text') && /\bname\b/i.test(f.field_label) && !/(parent|father|mother|guardian|school|college|institution|company|organi[sz]ation)/i.test(f.field_label)) ??
    byPredicate((f) => f.field_type === 'text' && /\bname\b/i.test(f.field_label));
  const emailField =
    bySource('email') ??
    byPredicate((f) => f.field_type === 'email') ??
    byPredicate((f) => /\be-?mail\b/i.test(f.field_label));
  const phoneField =
    bySource('phone') ??
    byPredicate((f) => f.field_type === 'phone') ??
    byPredicate((f) => /(mobile|phone|whatsapp|contact number)/i.test(f.field_label));

  return {
    name: nameField ? str(values[nameField.field_key]) : '',
    email: emailField ? str(values[emailField.field_key]) : '',
    phone: phoneField ? str(values[phoneField.field_key]) : '',
  };
}

/**
 * Builder-side check: can a form with the block hidden still identify the
 * registrant? True when some field could supply a name (mapped, or a text
 * field with "name" in its label).
 */
export function formCanSupplyName(fields: ContactSourceField[]): boolean {
  return fields.some(
    (f) => f.prefill_source === 'full_name' || (f.field_type === 'text' && /\bname\b/i.test(f.field_label)),
  );
}
