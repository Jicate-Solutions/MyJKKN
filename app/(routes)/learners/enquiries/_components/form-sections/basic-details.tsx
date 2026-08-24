// ============================================
// BASIC DETAILS FORM SECTION
// ============================================
// Created: 2025-01-18
// Purpose: Personal and family information fields
// ============================================

import { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProfileImageUpload } from '../profile-image-upload';
import { OccupationField } from '@/components/admission/occupation-field';
import { CommunityField, CasteField } from '@/components/admission/community-caste-selector';
import {
  TAMIL_LEGACY_ENCODINGS,
  TAMIL_LEGACY_ENCODING_LABELS,
  convertLegacyTamilToUnicode,
  looksLikeLegacyTamil,
  type TamilLegacyEncoding,
} from '@/lib/utils/tamil-legacy-encoding';

/** Keyboard the operator is typing the Tamil name with. */
type TamilKeyboard = 'unicode' | TamilLegacyEncoding;

/**
 * OS-resident Tamil font stack. Nirmala UI / Latha ship with Windows and Noto
 * Sans Tamil with most everything else, so the glyphs shape correctly without
 * this form downloading a webfont.
 *
 * Note this is deliberately NOT the Bamini/SunTommy font: those are legacy
 * glyph fonts with no Unicode Tamil glyphs at all, so naming them here would
 * do nothing. Legacy input is handled by CONVERTING it (below), not by
 * rendering it in the legacy font.
 */
const TAMIL_FONT_STACK = "'Noto Sans Tamil', 'Nirmala UI', 'Latha', sans-serif";

/**
 * Normalises an externally-issued identifier: upper-cases and removes ALL
 * whitespace, so "ed 4538 7190 9686" pasted out of a PDF and "ED453871909686"
 * typed by hand become the same stored string.
 *
 * Hyphens and slashes are deliberately KEPT — some issuing formats include
 * them, and stripping a separator that turns out to be significant is not
 * recoverable from the stored value.
 */
function normalizeIdentifier(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

interface IdentifierFieldProps {
  form: UseFormReturn<any>;
  name: string;
  label: string;
  placeholder: string;
  hint: string;
}

/**
 * One external-identifier input (ABC ID / EMIS / UMIS).
 *
 * Normalisation runs on BLUR rather than per keystroke: upper-casing while the
 * caret is mid-string fights the user, and stripping spaces as they type moves
 * the caret unpredictably.
 */
function IdentifierField({ form, name, label, placeholder, hint }: IdentifierFieldProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              {...field}
              value={field.value || ''}
              onBlur={(e) => {
                const normalized = normalizeIdentifier(e.target.value);
                if (normalized !== e.target.value) field.onChange(normalized);
                field.onBlur();
              }}
            />
          </FormControl>
          <p className="text-xs text-muted-foreground">{hint}</p>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface TamilNameFieldProps {
  form: UseFormReturn<any>;
  name: string;
  label: string;
  placeholder: string;
  keyboard: TamilKeyboard;
}

/**
 * One Tamil-script name input.
 *
 * When a legacy keyboard is selected, conversion runs on BLUR rather than on
 * every keystroke. Converting per-keystroke would corrupt the input: legacy
 * encodings store the pre-base vowel signs before their consonant, so the lone
 * `n` of `nf` (கெ) would be converted to a stray ெ the instant it was typed and
 * could never combine with the `f` that follows. The live preview underneath
 * gives immediate feedback without mutating what the operator is typing.
 */
function TamilNameField({ form, name, label, placeholder, keyboard }: TamilNameFieldProps) {
  const isLegacy = keyboard !== 'unicode';

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const raw: string = field.value || '';
        const pending = isLegacy && looksLikeLegacyTamil(raw);
        const preview = pending
          ? convertLegacyTamilToUnicode(raw, keyboard as TamilLegacyEncoding)
          : '';

        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Input
                placeholder={placeholder}
                lang="ta"
                spellCheck={false}
                autoComplete="off"
                style={{ fontFamily: isLegacy ? undefined : TAMIL_FONT_STACK }}
                {...field}
                value={raw}
                onBlur={(e) => {
                  const typed = e.target.value;
                  // looksLikeLegacyTamil() is false once the value already holds
                  // Tamil codepoints, so re-editing a saved name never
                  // double-converts.
                  if (isLegacy && looksLikeLegacyTamil(typed)) {
                    field.onChange(
                      convertLegacyTamilToUnicode(typed, keyboard as TamilLegacyEncoding),
                    );
                  }
                  field.onBlur();
                }}
              />
            </FormControl>
            {pending && (
              <p className="text-xs text-muted-foreground">
                Converts to{' '}
                <span style={{ fontFamily: TAMIL_FONT_STACK }} className="font-medium text-foreground">
                  {preview}
                </span>{' '}
                when you leave this field
              </p>
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

interface BasicDetailsProps {
  form: UseFormReturn<any>;
  onImageFileChange?: (file: File | null) => void;
  isStudentView?: boolean;
  /**
   * Render the Tamil-script name inputs (first_name_tamil / last_name_tamil).
   * Passed true only by the Learner Profiles create + edit screens; the
   * enquiry and student self-fill flows that also mount this section were
   * deliberately left unchanged.
   */
  showTamilNames?: boolean;
  /**
   * Render the external-identifier inputs (ABC ID / EMIS / UMIS). Same scoping
   * rationale as showTamilNames — Learner Profiles create + edit only. Kept as
   * a separate flag so the two groups can be turned on independently.
   */
  showLearnerIdentifiers?: boolean;
}

export function BasicDetailsSection({
  form,
  onImageFileChange,
  isStudentView = false,
  showTamilNames = false,
  showLearnerIdentifiers = false,
}: BasicDetailsProps) {
  // Defaults to 'unicode' so nothing is transformed unless the operator opts in.
  // A wrong auto-guess here would silently rewrite a person's name.
  const [tamilKeyboard, setTamilKeyboard] = useState<TamilKeyboard>('unicode');

  // 2026-04-23: yearOptions removed. Admission Year moved to the Course
  // Selection tab and is now a cascading FK picker (institution + program ->
  // admission_years rows) via <AdmissionYearSelect/>. The hardcoded year
  // dropdown was disconnected from the admission_years table, lived in the
  // wrong section (next to blood group), and produced inconsistent labels
  // vs. how the lead form rendered the same concept.

  // Religion options (values match database format - uppercase)
  const religionOptions = [
    { value: 'HINDU', label: 'Hindu' },
    { value: 'CHRISTIAN', label: 'Christian' },
    { value: 'MUSLIM', label: 'Muslim' },
    { value: 'OTHERS', label: 'Others' }
  ];

  // Blood group options
  const bloodGroupOptions = [
    { value: 'A+', label: 'A+' },
    { value: 'A-', label: 'A-' },
    { value: 'B+', label: 'B+' },
    { value: 'B-', label: 'B-' },
    { value: 'AB+', label: 'AB+' },
    { value: 'AB-', label: 'AB-' },
    { value: 'O+', label: 'O+' },
    { value: 'O-', label: 'O-' },
    { value: 'A1+', label: 'A1+' },
    { value: 'A1B', label: 'A1B' }
  ];

  return (
    <div className="space-y-6">
      {/* Profile Image Upload */}
      <div className="flex justify-center mb-6">
        <ProfileImageUpload
          value={form.watch('student_photo_url')}
          onChange={(url) => form.setValue('student_photo_url', url)}
          delayUpload={true}
          onFileChange={onImageFileChange}
        />
      </div>

      {/* Academic IDs - Show in Student View */}
      {isStudentView && (
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-lg font-semibold">Academic Identification</h3>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <FormField
              control={form.control}
              name="roll_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Roll Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter your roll number" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="register_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Register Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter your register number" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      )}

      {/* Admitted Date - Hidden in Student View */}
      {/* (Admission Year was removed from this section 2026-04-23 — now lives
          in the Course Selection tab as a cascading FK picker.) */}
      {!isStudentView && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <FormField
            control={form.control}
            name="enquiry_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Admitted Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Personal Information */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">Personal Information</h3>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <FormField
            control={form.control}
            name="first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  First Name <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Enter first name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

        <FormField
          control={form.control}
          name="last_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last Name <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input placeholder="Enter last name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tamil-script name — optional, nullable columns, always stored as
            Unicode. The picker below only says which keyboard the operator is
            typing WITH; Bamini/SunTommy keystrokes are converted to Unicode
            before they are saved, so the database never holds legacy bytes. */}
        {showTamilNames && (
          <>
            {/* Row 2 of the grid, directly under First Name / Last Name, so the
                English and Tamil spellings of the same name sit side by side.
                The keyboard picker follows BELOW them rather than above: it is
                a once-per-session setting, and putting it between the two rows
                broke the visual pairing. */}
            <TamilNameField
              form={form}
              name="first_name_tamil"
              label="First Name (Tamil) / முதல் பெயர்"
              placeholder={tamilKeyboard === 'unicode' ? 'எ.கா. முருகன்' : 'e.g. Kj;J'}
              keyboard={tamilKeyboard}
            />

            <TamilNameField
              form={form}
              name="last_name_tamil"
              label="Last Name (Tamil) / கடைசி பெயர்"
              placeholder={tamilKeyboard === 'unicode' ? 'எ.கா. செல்வம்' : 'e.g. nry;tk;'}
              keyboard={tamilKeyboard}
            />

            <div className="md:col-span-2">
              <label className="text-sm font-medium" htmlFor="tamil-keyboard">
                Tamil keyboard
              </label>
              <Select
                value={tamilKeyboard}
                onValueChange={(value) => setTamilKeyboard(value as TamilKeyboard)}
              >
                <SelectTrigger id="tamil-keyboard" className="mt-2 md:max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unicode">Unicode (type Tamil directly)</SelectItem>
                  {TAMIL_LEGACY_ENCODINGS.map((encoding) => (
                    <SelectItem key={encoding} value={encoding}>
                      {TAMIL_LEGACY_ENCODING_LABELS[encoding]} (converted to Unicode)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {tamilKeyboard === 'unicode'
                  ? 'Type or paste Tamil directly. Saved exactly as entered.'
                  : `Type or paste ${TAMIL_LEGACY_ENCODING_LABELS[tamilKeyboard as TamilLegacyEncoding]} text — it is converted to Unicode Tamil when you leave the field.`}
              </p>
            </div>
          </>
        )}

        <FormField
          control={form.control}
          name="date_of_birth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date of Birth <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Gender <span className="text-red-500">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="religion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Religion <span className="text-red-500">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select religion" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {religionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Community and Caste — separate cells in the 3-col grid so
              Religion | Community | Caste sit on one row at md:+ widths. */}
          <CommunityField
            value={form.watch('community_category_id') ?? ''}
            onChange={(val) =>
              form.setValue('community_category_id', val, { shouldDirty: true, shouldValidate: true })
            }
            onCascadeReset={() =>
              form.setValue('caste_id', '', { shouldDirty: true, shouldValidate: true })
            }
            required
          />
          <CasteField
            communityCategoryId={form.watch('community_category_id') ?? ''}
            value={form.watch('caste_id') ?? ''}
            onChange={(val) =>
              form.setValue('caste_id', val, { shouldDirty: true, shouldValidate: true })
            }
            required
            legacyCasteText={form.watch('caste') ?? ''}
          />
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <FormField
            control={form.control}
            name="aadhar_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Aadhar Number</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter 12-digit Aadhar number"
                    maxLength={12}
                    {...field}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="blood_group"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Blood Group</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select blood group" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {bloodGroupOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

        </div>

        {/* External identifiers issued by bodies outside this system. All three
            are optional and stored as free-form alphanumeric text — the issuing
            formats have changed over time, so nothing here rejects a value. */}
        {showLearnerIdentifiers && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            <IdentifierField
              form={form}
              name="abc_id"
              label="ABC ID"
              placeholder="e.g. ED453871909686"
              hint="Academic Bank of Credits ID"
            />
            <IdentifierField
              form={form}
              name="emis"
              label="EMIS Number"
              placeholder="e.g. 33150200123"
              hint="Education Management Information System (school)"
            />
            <IdentifierField
              form={form}
              name="umis"
              label="UMIS Number"
              placeholder="e.g. UM2024005567"
              hint="University Management Information System"
            />
          </div>
        )}
      </div>

      {/* Father's Information */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">Father&apos;s Information</h3>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <FormField
            control={form.control}
            name="father_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Father&apos;s Name <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="Enter father's name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="father_occupation"
            render={({ field }) => (
              <FormItem>
                <OccupationField
                  label="Father's Occupation"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="father_mobile"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Father&apos;s Mobile</FormLabel>
                <FormControl>
                  <Input placeholder="Enter mobile number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Mother's Information */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">Mother&apos;s Information</h3>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <FormField
            control={form.control}
            name="mother_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mother&apos;s Name <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="Enter mother's name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mother_occupation"
            render={({ field }) => (
              <FormItem>
                <OccupationField
                  label="Mother's Occupation"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mother_mobile"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mother&apos;s Mobile</FormLabel>
                <FormControl>
                  <Input placeholder="Enter mobile number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Additional Information */}
      <FormField
        control={form.control}
        name="annual_income"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Annual Family Income</FormLabel>
            <FormControl>
              <Input placeholder="Enter annual income" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
