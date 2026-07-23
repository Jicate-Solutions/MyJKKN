'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { Language } from './language-toggle';
import {
  BOARD_OF_STUDY_OPTIONS,
  SCHOLARSHIP_TYPE_OPTIONS,
} from '@/lib/constants/learner-dropdown-values';
import {
  NEW_TWELFTH_SUBJECTS,
  TWELFTH_GROUP_LABEL_MAP,
  type TwelfthGroupKey,
} from '@/lib/utils/mappings/enquiry-excel-mappings';
import {
  LastSchoolField,
  type LastSchoolFetchers,
} from '@/components/learners/last-school-field';
import { useMemo } from 'react';

interface Props {
  lang: Language;
  data: Record<string, any>;
  token: string;
  degreeType?: 'ug' | 'pg';
  onContinue: (fields: Record<string, any>) => void;
  onBack: () => void;
  submitting: boolean;
}

// The public form has no authenticated Supabase session — school-master reads
// go through the token-validated course-options endpoint (service-role).
function buildSchoolFetchers(token: string): LastSchoolFetchers {
  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/student-form/${encodeURIComponent(token)}/course-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`course-options ${res.status}`);
    return res.json();
  };
  return {
    fetchDistricts: async () => (await post({ kind: 'school_districts' })).data ?? [],
    fetchSchools: async ({ district, search }) => {
      const json = await post({ kind: 'schools', filters: { district, search } });
      return { schools: json.data ?? [], total: json.total ?? 0 };
    },
  };
}

// Match enquiry form's group options verbatim so the admin-side UI and the
// auto-calc formulas pick up the same selection downstream.
const GROUP_OPTIONS = (
  Object.entries(TWELFTH_GROUP_LABEL_MAP) as Array<[TwelfthGroupKey, string]>
).map(([value, label]) => ({ value, label }));

function Section({
  title,
  children,
}: {
  title: { en: string; ta: string };
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t pt-5">
      <h3 className="text-base font-semibold text-foreground">
        {title.en} <span className="text-muted-foreground font-normal">/ {title.ta}</span>
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {helper && (
        <p className="text-xs text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

// Subject-marks input — small reusable to keep the JSX flat.
function SubjectInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        inputMode="numeric"
        placeholder="Marks"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-12"
      />
    </Field>
  );
}

export function StepAcademicInformation({
  data,
  token,
  degreeType,
  onContinue,
  onBack,
  submitting,
}: Props) {
  const isPG = degreeType === 'pg';
  const schoolFetchers = useMemo(() => buildSchoolFetchers(token), [token]);
  const [v, setV] = useState({
    // tenth_marks JSONB:
    //   { max_marks, obtained_marks, percentage }
    // Matches enquiry form's data model. 5,178 existing rows use this shape;
    // 0 rows use the older max/obtained shape, so no migration needed.
    //
    // 2026-05-21: Default max_marks to 500 (Tamil Nadu SSLC standard). The
    // spread order ensures legacy data takes priority — only fields the
    // student hasn't already filled get the default.
    tenth_marks: { max_marks: '500', ...(data.tenth_marks ?? {}) },
    // twelfth_marks JSONB:
    //   { max_marks, obtained_marks, percentage, group, subjects: { physics, chemistry, mathematics, biology, botany, zoology, accountancy, commerce, economics, computer_science, history, statistics, geography } }
    //
    // 2026-05-21: Default max_marks to 600 (Tamil Nadu HSC standard, 6 papers ×
    // 100 marks). Same spread-after-default pattern as 10th.
    twelfth_marks: { max_marks: '600', ...(data.twelfth_marks ?? {}) },
    last_school: data.last_school ?? '',
    last_school_id: data.last_school_id ?? null,
    school_district: data.school_district ?? '',
    board_of_study: data.board_of_study ?? '',
    neet_roll_number: data.neet_roll_number ?? '',
    neet_score: data.neet_score ?? '',
    counseling_applied: data.counseling_applied ?? false,
    counseling_number: data.counseling_number ?? '',
    scholarship_type: data.scholarship_type ?? '',
    engineering_cutoff_marks: data.engineering_cutoff_marks ?? '',
    medical_cutoff_marks: data.medical_cutoff_marks ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  // JSONB merge helpers — preserve sibling keys when updating a single key.
  const set10 = (key: string, value: string) =>
    set('tenth_marks', { ...v.tenth_marks, [key]: value });
  const set12 = (key: string, value: string) =>
    set('twelfth_marks', { ...v.twelfth_marks, [key]: value });
  const setSubject = (subject: string, value: string) =>
    set('twelfth_marks', {
      ...v.twelfth_marks,
      subjects: { ...(v.twelfth_marks.subjects ?? {}), [subject]: value },
    });

  // Auto-calculate 10th percentage from max + obtained.
  useEffect(() => {
    const max = Number(v.tenth_marks.max_marks);
    const obtained = Number(v.tenth_marks.obtained_marks);
    if (max > 0 && obtained > 0) {
      const pct = ((obtained / max) * 100).toFixed(2);
      if (v.tenth_marks.percentage !== pct) {
        set('tenth_marks', { ...v.tenth_marks, percentage: pct });
      }
    } else if (v.tenth_marks.percentage) {
      set('tenth_marks', { ...v.tenth_marks, percentage: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.tenth_marks.max_marks, v.tenth_marks.obtained_marks]);

  // Auto-calculate 12th percentage from max + obtained.
  useEffect(() => {
    const max = Number(v.twelfth_marks.max_marks);
    const obtained = Number(v.twelfth_marks.obtained_marks);
    if (max > 0 && obtained > 0) {
      const pct = ((obtained / max) * 100).toFixed(2);
      if (v.twelfth_marks.percentage !== pct) {
        set('twelfth_marks', { ...v.twelfth_marks, percentage: pct });
      }
    } else if (v.twelfth_marks.percentage) {
      set('twelfth_marks', { ...v.twelfth_marks, percentage: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.twelfth_marks.max_marks, v.twelfth_marks.obtained_marks]);

  // Auto-calculate cutoff marks from subject scores. Same formulas the enquiry
  // form uses (academic-information.tsx). Engineering: (P+C)/2 + M.
  // Medical (Bio):     (P+C)/2 + Biology.
  // Medical (Bot+Zoo): (P+C)/2 + Botany + Zoology/2.
  const subjects = v.twelfth_marks.subjects ?? {};
  const physics = Number(subjects.physics);
  const chemistry = Number(subjects.chemistry);
  const maths = Number(subjects.mathematics);
  const biology = Number(subjects.biology);
  const botany = Number(subjects.botany);
  const zoology = Number(subjects.zoology);

  useEffect(() => {
    // Engineering cutoff
    if (physics > 0 && chemistry > 0 && maths > 0) {
      const eng = ((physics + chemistry) / 2 + maths).toFixed(2);
      if (v.engineering_cutoff_marks !== eng) set('engineering_cutoff_marks', eng);
    } else if (v.engineering_cutoff_marks) {
      set('engineering_cutoff_marks', '');
    }
    // Medical cutoff — Biology variant takes precedence if present.
    if (physics > 0 && chemistry > 0 && biology > 0) {
      const med = ((physics + chemistry) / 2 + biology).toFixed(2);
      if (v.medical_cutoff_marks !== med) set('medical_cutoff_marks', med);
    } else if (physics > 0 && chemistry > 0 && botany > 0 && zoology > 0) {
      const med = ((physics + chemistry) / 2 + botany + zoology / 2).toFixed(2);
      if (v.medical_cutoff_marks !== med) set('medical_cutoff_marks', med);
    } else if (v.medical_cutoff_marks) {
      set('medical_cutoff_marks', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physics, chemistry, maths, biology, botany, zoology]);

  // Render the subject-marks fields appropriate for the picked group.
  // Mirrors enquiry-form's renderSubjectFields exactly.
  const group = v.twelfth_marks.group;
  const renderSubjects = () => {
    switch (group) {
      case 'pcbm':
        return (
          <>
            <SubjectInput label="Physics / இயற்பியல்" value={subjects.physics} onChange={(s) => setSubject('physics', s)} />
            <SubjectInput label="Chemistry / வேதியியல்" value={subjects.chemistry} onChange={(s) => setSubject('chemistry', s)} />
            <SubjectInput label="Biology / உயிரியல்" value={subjects.biology} onChange={(s) => setSubject('biology', s)} />
            <SubjectInput label="Mathematics / கணிதம்" value={subjects.mathematics} onChange={(s) => setSubject('mathematics', s)} />
          </>
        );
      case 'pccs':
        return (
          <>
            <SubjectInput label="Physics / இயற்பியல்" value={subjects.physics} onChange={(s) => setSubject('physics', s)} />
            <SubjectInput label="Chemistry / வேதியியல்" value={subjects.chemistry} onChange={(s) => setSubject('chemistry', s)} />
            <SubjectInput label="Computer Science" value={subjects.computer_science} onChange={(s) => setSubject('computer_science', s)} />
            <SubjectInput label="Mathematics / கணிதம்" value={subjects.mathematics} onChange={(s) => setSubject('mathematics', s)} />
          </>
        );
      case 'pcbz':
        return (
          <>
            <SubjectInput label="Physics / இயற்பியல்" value={subjects.physics} onChange={(s) => setSubject('physics', s)} />
            <SubjectInput label="Chemistry / வேதியியல்" value={subjects.chemistry} onChange={(s) => setSubject('chemistry', s)} />
            <SubjectInput label="Botany / தாவரவியல்" value={subjects.botany} onChange={(s) => setSubject('botany', s)} />
            <SubjectInput label="Zoology / விலங்கியல்" value={subjects.zoology} onChange={(s) => setSubject('zoology', s)} />
          </>
        );
      case 'science':
        return (
          <>
            <SubjectInput label="Physics / இயற்பியல்" value={subjects.physics} onChange={(s) => setSubject('physics', s)} />
            <SubjectInput label="Chemistry / வேதியியல்" value={subjects.chemistry} onChange={(s) => setSubject('chemistry', s)} />
            <SubjectInput label="Mathematics / கணிதம்" value={subjects.mathematics} onChange={(s) => setSubject('mathematics', s)} />
            <SubjectInput label="Biology / உயிரியல்" value={subjects.biology} onChange={(s) => setSubject('biology', s)} />
          </>
        );
      case 'commerce':
      case 'cseca':
      case 'heca':
      case 'seca':
        return (
          <>
            <SubjectInput label="Accountancy" value={subjects.accountancy} onChange={(s) => setSubject('accountancy', s)} />
            <SubjectInput label="Commerce" value={subjects.commerce} onChange={(s) => setSubject('commerce', s)} />
            <SubjectInput label="Economics" value={subjects.economics} onChange={(s) => setSubject('economics', s)} />
            {group === 'cseca' && <SubjectInput label="Computer Science" value={subjects.computer_science} onChange={(s) => setSubject('computer_science', s)} />}
            {group === 'heca' && <SubjectInput label="History / வரலாறு" value={subjects.history} onChange={(s) => setSubject('history', s)} />}
            {group === 'seca' && <SubjectInput label="Statistics" value={subjects.statistics} onChange={(s) => setSubject('statistics', s)} />}
          </>
        );
      case 'arts':
        return (
          <>
            <SubjectInput label="History / வரலாறு" value={subjects.history} onChange={(s) => setSubject('history', s)} />
            <SubjectInput label="Geography / புவியியல்" value={subjects.geography} onChange={(s) => setSubject('geography', s)} />
            <SubjectInput label="Economics" value={subjects.economics} onChange={(s) => setSubject('economics', s)} />
          </>
        );
      default: {
        // 2026-05-22: data-driven render for the 15 new streams.
        const newSubjects = NEW_TWELFTH_SUBJECTS[group as TwelfthGroupKey];
        if (!newSubjects) return null;
        return (
          <>
            {newSubjects.map(({ key, label, labelTa }) => (
              <SubjectInput
                key={key}
                label={labelTa ? `${label} / ${labelTa}` : label}
                value={(subjects as Record<string, string>)[key] ?? ''}
                onChange={(s) => setSubject(key, s)}
              />
            ))}
          </>
        );
      }
    }
  };

  const showCutoffs =
    v.engineering_cutoff_marks || v.medical_cutoff_marks ? true : false;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onContinue(v);
      }}
      className="space-y-6"
    >
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Academic Information <span className="text-muted-foreground font-normal">/ கல்வி விவரங்கள்</span>
        </h2>
      </header>

      {/* Previous Schooling / College — always visible. Board renders FIRST:
          for State Board it drives the District → School dropdown cascade
          (with manual entry fallback) inside LastSchoolField. */}
      <Section title={{ en: isPG ? 'Previous College' : 'Previous Schooling', ta: isPG ? 'முந்தைய கல்லூரி' : 'கடந்த கல்வி' }}>
        {!isPG && (
          <Field label="Board of Study / வாரியம்">
            <Select
              value={v.board_of_study}
              onValueChange={(s) => set('board_of_study', s)}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select board / வாரியம் தேர்வு செய்க" />
              </SelectTrigger>
              <SelectContent>
                {BOARD_OF_STUDY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field label={isPG ? 'College Name & Place / கல்லூரி பெயர் மற்றும் இடம்' : 'Last School / கடந்த பள்ளி'}>
          <LastSchoolField
            board={(v.board_of_study || '').toLowerCase().replace(/\s+/g, '_')}
            isPG={isPG}
            value={v.last_school}
            schoolId={v.last_school_id}
            district={v.school_district || null}
            onChange={({ name, schoolId, district }) =>
              setV((p) => ({
                ...p,
                last_school: name,
                last_school_id: schoolId,
                school_district: district ?? '',
              }))
            }
            fetchers={schoolFetchers}
            placeholder={isPG ? 'College name and place' : 'School name'}
          />
        </Field>
      </Section>

      {/* PG-specific: Previous Qualification */}
      {isPG && (
        <Section title={{ en: 'Previous Qualification', ta: 'முந்தைய தகுதி' }}>
          <Field label="Previous Course / Degree / முந்தைய பட்டம்">
            <Input
              value={v.twelfth_marks.course_name ?? ''}
              onChange={(e) => set12('course_name', e.target.value)}
              placeholder="e.g., B.Sc Computer Science"
              className="h-12"
            />
          </Field>
          <Field label="Previous Degree Percentage / முந்தைய சதவீதம்">
            <Input
              type="number"
              inputMode="numeric"
              value={v.twelfth_marks.percentage ?? ''}
              onChange={(e) => set12('percentage', e.target.value)}
              placeholder="e.g., 85"
              className="h-12"
            />
          </Field>
        </Section>
      )}

      {/* UG-only: 10th Marks */}
      {!isPG && (
        <Section title={{ en: '10th Standard Marks', ta: '10ஆம் வகுப்பு மதிப்பெண்' }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max marks">
              <Input
                placeholder="e.g. 500"
                inputMode="numeric"
                type="number"
                value={v.tenth_marks.max_marks ?? ''}
                onChange={(e) => set10('max_marks', e.target.value)}
                className="h-12"
              />
            </Field>
            <Field label="Obtained">
              <Input
                placeholder="e.g. 450"
                inputMode="numeric"
                type="number"
                value={v.tenth_marks.obtained_marks ?? ''}
                onChange={(e) => set10('obtained_marks', e.target.value)}
                className="h-12"
              />
            </Field>
          </div>
          <Field label="Percentage / சதவீதம்" helper="Auto-calculated from max + obtained">
            <Input
              value={v.tenth_marks.percentage ?? ''}
              readOnly
              placeholder="—"
              className="h-12 bg-muted/40"
            />
          </Field>
        </Section>
      )}

      {/* UG-only: 12th Marks + Group */}
      {!isPG && (
        <Section title={{ en: '12th Standard Marks', ta: '12ஆம் வகுப்பு மதிப்பெண்' }}>
          <Field label="Group / பிரிவு">
            <Select
              value={v.twelfth_marks.group ?? ''}
              onValueChange={(s) => set12('group', s)}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select group / பிரிவு தேர்வு செய்க" />
              </SelectTrigger>
              <SelectContent>
                {GROUP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Max marks">
              <Input
                placeholder="e.g. 600"
                inputMode="numeric"
                type="number"
                value={v.twelfth_marks.max_marks ?? ''}
                onChange={(e) => set12('max_marks', e.target.value)}
                className="h-12"
              />
            </Field>
            <Field label="Obtained">
              <Input
                placeholder="e.g. 540"
                inputMode="numeric"
                type="number"
                value={v.twelfth_marks.obtained_marks ?? ''}
                onChange={(e) => set12('obtained_marks', e.target.value)}
                className="h-12"
              />
            </Field>
          </div>
          <Field label="Percentage / சதவீதம்" helper="Auto-calculated from max + obtained">
            <Input
              value={v.twelfth_marks.percentage ?? ''}
              readOnly
              placeholder="—"
              className="h-12 bg-muted/40"
            />
          </Field>

          {/* Subject-wise marks (only shown once a group is picked) */}
          {group && renderSubjects() && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-4">
              <h4 className="text-sm font-medium">
                Subject-wise marks{' '}
                <span className="text-muted-foreground font-normal">
                  / பாட வாரியான மதிப்பெண்கள்
                </span>
              </h4>
              <div className="grid grid-cols-2 gap-3">{renderSubjects()}</div>
              <p className="text-xs text-muted-foreground">
                Cutoff marks are calculated automatically.
              </p>
            </div>
          )}

          {/* Auto-calculated cutoffs (read-only, only shown when relevant subjects filled) */}
          {showCutoffs && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
              {v.engineering_cutoff_marks && (
                <div>
                  <Label className="text-xs text-muted-foreground">Engineering Cutoff</Label>
                  <p className="text-lg font-semibold tabular-nums">{v.engineering_cutoff_marks}</p>
                </div>
              )}
              {v.medical_cutoff_marks && (
                <div>
                  <Label className="text-xs text-muted-foreground">Medical Cutoff</Label>
                  <p className="text-lg font-semibold tabular-nums">{v.medical_cutoff_marks}</p>
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {/* UG-only: Entrance Exam (NEET) */}
      {!isPG && (
        <Section title={{ en: 'Entrance Exam (NEET)', ta: 'நுழைவுத் தேர்வு' }}>
          <Field label="NEET Roll Number / NEET எண்">
            <Input
              value={v.neet_roll_number}
              onChange={(e) => set('neet_roll_number', e.target.value)}
              placeholder="Optional"
              className="h-12"
            />
          </Field>

          <Field label="NEET Score">
            <Input
              value={v.neet_score}
              onChange={(e) => set('neet_score', e.target.value)}
              placeholder="Optional"
              inputMode="numeric"
              type="number"
              className="h-12"
            />
          </Field>
        </Section>
      )}

      {/* Scholarship & Counseling — always visible */}
      <Section title={{ en: 'Scholarship & Counseling', ta: 'உதவித்தொகை மற்றும் கவுன்சிலிங்' }}>
        <Field label="Scholarship Type / உதவித்தொகை வகை">
          <Select
            value={v.scholarship_type}
            onValueChange={(s) => set('scholarship_type', s)}
          >
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select scholarship / உதவித்தொகை தேர்வு செய்க" />
            </SelectTrigger>
            <SelectContent>
              {SCHOLARSHIP_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Applied for Counseling? / கவுன்சிலிங் விண்ணப்பித்தீர்களா?">
          <Select
            value={
              v.counseling_applied === true
                ? 'true'
                : v.counseling_applied === false
                  ? 'false'
                  : ''
            }
            onValueChange={(s) => {
              const flipped = s === 'true';
              set('counseling_applied', flipped);
              // Clear the counseling number when toggling back to No so stale
              // values don't sneak through on save.
              if (!flipped) set('counseling_number', '');
            }}
          >
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select / தேர்வு செய்க" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes / ஆம்</SelectItem>
              <SelectItem value="false">No / இல்லை</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {v.counseling_applied === true && (
          <Field label="Counseling Number / கவுன்சிலிங் எண்">
            <Input
              value={v.counseling_number}
              onChange={(e) => set('counseling_number', e.target.value)}
              placeholder="Enter your counseling number"
              className="h-12"
            />
          </Field>
        )}
      </Section>

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12 text-sm sm:text-base"
          onClick={onBack}
          disabled={submitting}
        >
          Back / பின்
        </Button>
        <Button type="submit" className="flex-1 h-12 text-sm sm:text-base" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save & Continue / சேமித்துத் தொடரவும்
        </Button>
      </div>
    </form>
  );
}
