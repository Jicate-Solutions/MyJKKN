'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Pencil, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Language } from './language-toggle';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { CasteService } from '@/lib/services/admission/caste-service';

interface Props {
  lang: Language;
  data: Record<string, any>;
  token: string;
  degreeType?: 'ug' | 'pg';
  onSubmit: () => void;
  onEditBasic: () => void;
  onEditAcademic: () => void;
  onEditCourse: () => void;
  onEditAccommodation: () => void;
  onEditContact: () => void;
  submitting: boolean;
}

interface CourseNames {
  institution?: string;
  quota?: string;
  degree?: string;
  department?: string;
  program?: string;
  semester?: string;
  route?: string;
  stop?: string;
}

const EMPTY = '—';

// Friendlier label maps for enum values so the preview doesn't show raw
// codes like "OC" / "state_board" / "FIRST GRADUATE". The student typed
// these in English/Tamil via the dropdowns, so showing the human label
// makes verification easier.
const BOARD_LABELS: Record<string, string> = {
  state_board: 'State Board',
  cbse: 'CBSE',
  icse: 'ICSE',
  matriculation: 'Matriculation',
  anglo_indian: 'Anglo Indian',
  others: 'Others',
};

const GROUP_LABELS: Record<string, string> = {
  science: 'Science (General)',
  pcbm: 'PCBM',
  pccs: 'PCCS',
  pcbz: 'PCBZ',
  commerce: 'Commerce',
  cseca: 'CSECA',
  heca: 'HECA',
  seca: 'SECA',
  arts: 'Arts',
  vocational: 'Vocational',
  diploma: 'Diploma',
};

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

const RELIGION_LABELS: Record<string, string> = {
  HINDU: 'Hindu',
  CHRISTIAN: 'Christian',
  MUSLIM: 'Muslim',
  SIKH: 'Sikh',
  BUDDHIST: 'Buddhist',
  JAIN: 'Jain',
  OTHERS: 'Others',
};

const ACCOMMODATION_LABELS: Record<string, string> = {
  HOSTEL: 'Hostel',
  'DAY SCHOLAR': 'Day Scholar',
  HOME: 'Home',
};

const looksFilled = (v: unknown) => v !== undefined && v !== null && String(v).trim().length > 0;

export function StepPreviewConfirm({
  data,
  token,
  degreeType,
  onSubmit,
  onEditBasic,
  onEditAcademic,
  onEditCourse,
  onEditAccommodation,
  onEditContact,
  submitting,
}: Props) {
  const isPG = degreeType === 'pg';
  const fullName = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim();
  const tenth = data.tenth_marks ?? {};
  const twelfth = data.twelfth_marks ?? {};
  const subjects = (twelfth.subjects ?? {}) as Record<string, string>;
  const hasSubjects = Object.values(subjects).some(looksFilled);
  const hasCutoff = looksFilled(data.engineering_cutoff_marks) || looksFilled(data.medical_cutoff_marks);
  const hasNeet = looksFilled(data.neet_roll_number) || looksFilled(data.neet_score);

  // Resolve display names for the course IDs. data.* has UUIDs; we show names.
  // Single batched call to /course-options?kind=names returns all 5 labels.
  const [courseNames, setCourseNames] = useState<CourseNames>({});
  const [coursesLoading, setCoursesLoading] = useState(false);

  // Community is stored as community_category_id (FK); resolve its code for the
  // preview (the legacy `community` text column is retired). RLS on
  // community_categories is open to anon, so this works on the public form.
  const [communityCode, setCommunityCode] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const id = (data as { community_category_id?: string }).community_category_id;
    if (!id) return;
    LookupService.listCommunityCategories(true)
      .then((rows) => { if (alive) setCommunityCode(rows.find((r) => r.id === id)?.code); })
      .catch(() => {});
    return () => { alive = false; };
  }, [data.community_category_id]);

  // Caste is stored as caste_id (FK); resolve its name for the preview.
  const [casteName, setCasteName] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const id = (data as { caste_id?: string }).caste_id;
    if (!id) return;
    CasteService.get(id)
      .then((c) => { if (alive) setCasteName(c?.name); })
      .catch(() => {});
    return () => { alive = false; };
  }, [data.caste_id]);

  useEffect(() => {
    const ids = {
      institution_id: data.institution_id,
      quota_id: data.quota_id,
      degree_id: data.degree_id,
      department_id: data.department_id,
      program_id: data.program_id,
      semester_id: data.semester_id,
      route_id: data.transport_route_id,
      stop_id: data.transport_stop_id,
    };
    if (!Object.values(ids).some(Boolean)) return;
    let alive = true;
    setCoursesLoading(true);
    fetch(`/api/student-form/${encodeURIComponent(token)}/course-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'names', filters: ids }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        if (alive && j?.data) setCourseNames(j.data);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setCoursesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, data.institution_id, data.quota_id, data.degree_id, data.department_id, data.program_id, data.semester_id, data.transport_route_id, data.transport_stop_id]);

  const hasCourse =
    looksFilled(data.institution_id) ||
    looksFilled(data.degree_id) ||
    looksFilled(data.program_id) ||
    looksFilled(data.quota_id) ||
    looksFilled(data.entry_type) ||
    looksFilled(data.semester_id);

  return (
    <div className="space-y-5 pb-24">
      {/* Page header */}
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Review your details{' '}
          <span className="text-muted-foreground font-normal">/ விவரங்களை சரிபார்க்கவும்</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Tap <span className="font-medium text-foreground">Edit</span> on any section to fix
          mistakes before final submit. Once submitted, you cannot change it.
        </p>
      </header>

      {/* Student summary card */}
      <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-4">
        <div className="flex items-center gap-4">
          {data.student_photo_url ? (
            <img
              src={data.student_photo_url}
              alt=""
              className="h-16 w-16 rounded-full object-cover border-2 border-primary/20 shrink-0"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-semibold shrink-0">
              {fullName ? fullName[0].toUpperCase() : '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-lg truncate">{fullName || 'Unnamed student'}</p>
            <p className="text-sm text-muted-foreground truncate">
              {data.student_mobile || 'No mobile'} · {data.student_email || 'No email'}
            </p>
          </div>
        </div>
      </div>

      {/* Basic Details */}
      <Section
        title="Basic Details"
        titleTamil="அடிப்படை விவரங்கள்"
        onEdit={onEditBasic}
      >
        <SubGroup title="Personal">
          <Row label="Name / பெயர்" value={fullName} />
          <Row label="Date of Birth / பிறந்த தேதி" value={data.date_of_birth} />
          <Row label="Gender / பாலினம்" value={GENDER_LABELS[data.gender] ?? data.gender} />
          <Row
            label="Religion / Community / Caste"
            value={[
              RELIGION_LABELS[data.religion] ?? data.religion,
              communityCode,
              casteName,
            ]
              .filter(looksFilled)
              .join(' · ')}
          />
        </SubGroup>

        <SubGroup title="Father">
          <Row label="Name / பெயர்" value={data.father_name} />
          <Row label="Occupation / தொழில்" value={data.father_occupation} />
          <Row label="Mobile / கைபேசி" value={data.father_mobile} />
        </SubGroup>

        <SubGroup title="Mother">
          <Row label="Name / பெயர்" value={data.mother_name} />
          <Row label="Occupation / தொழில்" value={data.mother_occupation} />
          <Row label="Mobile / கைபேசி" value={data.mother_mobile} />
        </SubGroup>

        {looksFilled(data.annual_income) && (
          <SubGroup title="Additional">
            <Row label="Annual income / ஆண்டு வருமானம்" value={`₹ ${data.annual_income}`} />
          </SubGroup>
        )}
      </Section>

      {/* Academic */}
      <Section
        title="Academic Information"
        titleTamil="கல்வி விவரங்கள்"
        onEdit={onEditAcademic}
      >
        <SubGroup title={isPG ? 'Previous College' : 'Previous Schooling'}>
          <Row label={isPG ? 'College Name & Place / கல்லூரி' : 'Last School / கடந்த பள்ளி'} value={data.last_school} />
          {!isPG && (
            <Row
              label="Board of Study / வாரியம்"
              value={BOARD_LABELS[data.board_of_study] ?? data.board_of_study}
            />
          )}
        </SubGroup>

        {isPG && (
          <SubGroup title="Previous Qualification">
            <Row label="Previous Course / முந்தைய பட்டம்" value={twelfth.course_name} />
            <Row label="Percentage / சதவீதம்" value={twelfth.percentage} />
          </SubGroup>
        )}

        {!isPG && (
          <SubGroup title="10th Standard">
            <MarksRow
              max={tenth.max_marks}
              obtained={tenth.obtained_marks}
              percentage={tenth.percentage}
            />
          </SubGroup>
        )}

        {!isPG && (
          <SubGroup title="12th Standard">
            <Row
              label="Group / பிரிவு"
              value={GROUP_LABELS[twelfth.group] ?? twelfth.group}
            />
            <MarksRow
              max={twelfth.max_marks}
              obtained={twelfth.obtained_marks}
              percentage={twelfth.percentage}
            />
            {hasSubjects && <SubjectChips subjects={subjects} />}
          </SubGroup>
        )}

        {!isPG && hasCutoff && (
          <SubGroup title="Cutoff Scores">
            <div className="grid grid-cols-2 gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <CutoffChip label="Engineering" value={data.engineering_cutoff_marks} />
              <CutoffChip label="Medical" value={data.medical_cutoff_marks} />
            </div>
          </SubGroup>
        )}

        {!isPG && hasNeet && (
          <SubGroup title="NEET">
            <Row label="Roll Number / எண்" value={data.neet_roll_number} />
            <Row label="Score / மதிப்பெண்" value={data.neet_score} />
          </SubGroup>
        )}

        <SubGroup title="Scholarship & Counseling">
          <Row label="Scholarship / உதவித்தொகை" value={data.scholarship_type} />
          <Row
            label="Applied for Counseling? / கவுன்சிலிங்"
            value={
              data.counseling_applied === true
                ? 'Yes / ஆம்'
                : data.counseling_applied === false
                  ? 'No / இல்லை'
                  : undefined
            }
          />
          {data.counseling_applied === true && (
            <Row
              label="Counseling Number / எண்"
              value={data.counseling_number}
            />
          )}
        </SubGroup>
      </Section>

      {/* Course Selection */}
      <Section
        title="Course Selection"
        titleTamil="பாட தேர்வு"
        onEdit={onEditCourse}
      >
        <SubGroup title="Institution & Course">
          <Row
            label="Institution / நிறுவனம்"
            value={courseNames.institution ?? (coursesLoading && data.institution_id ? 'Loading…' : undefined)}
          />
          <Row
            label="Degree / பட்டப்படிப்பு"
            value={courseNames.degree ?? (coursesLoading && data.degree_id ? 'Loading…' : undefined)}
          />
          <Row
            label="Department / துறை"
            value={courseNames.department ?? (coursesLoading && data.department_id ? 'Loading…' : undefined)}
          />
          <Row
            label="Program / பாடம்"
            value={courseNames.program ?? (coursesLoading && data.program_id ? 'Loading…' : undefined)}
          />
        </SubGroup>

        <SubGroup title="Entry & Semester">
          <Row
            label="Quota / ஒதுக்கீடு"
            value={courseNames.quota ?? (coursesLoading && data.quota_id ? 'Loading…' : undefined)}
          />
          <Row label="Entry Type / சேர்க்கை வகை" value={data.entry_type} />
          <Row
            label="Semester / பருவம்"
            value={courseNames.semester ?? (coursesLoading && data.semester_id ? 'Loading…' : undefined)}
          />
        </SubGroup>
      </Section>

      {/* Accommodation Preferences */}
      <Section
        title="Accommodation"
        titleTamil="தங்குமிட விருப்பம்"
        onEdit={onEditAccommodation}
      >
        <SubGroup title="Where the Student Will Stay">
          <Row
            label="Accommodation Type / தங்குமிட வகை"
            value={ACCOMMODATION_LABELS[data.accommodation_type] ?? data.accommodation_type}
          />
          {data.accommodation_type === 'DAY SCHOLAR' && (
            <Row
              label="Bus Required? / பேருந்து தேவையா?"
              value={
                data.bus_required === true
                  ? 'Yes'
                  : data.bus_required === false
                  ? 'No'
                  : undefined
              }
            />
          )}
          {data.accommodation_type === 'DAY SCHOLAR' && data.bus_required === true && (
            <>
              <Row
                label="Route / வழித்தடம்"
                value={courseNames.route ?? (coursesLoading && data.transport_route_id ? 'Loading…' : undefined)}
              />
              <Row
                label="Boarding Point / ஏறும் இடம்"
                value={courseNames.stop ?? (coursesLoading && data.transport_stop_id ? 'Loading…' : undefined)}
              />
            </>
          )}
        </SubGroup>
      </Section>

      {/* Contact */}
      <Section
        title="Contact Details"
        titleTamil="தொடர்பு விவரங்கள்"
        onEdit={onEditContact}
      >
        <SubGroup title="Reach the Student">
          <Row label="Mobile / கைபேசி" value={data.student_mobile} />
          <Row label="Email / மின்னஞ்சல்" value={data.student_email} />
        </SubGroup>

        <SubGroup title="Permanent Address">
          <Row label="Street / முகவரி" value={data.permanent_address_street} />
          <Row
            label="State / District / Taluk"
            value={[
              data.permanent_address_state,
              data.permanent_address_district,
              data.permanent_address_taluk,
            ]
              .filter(looksFilled)
              .join(' · ')}
          />
          <Row label="Pincode / அஞ்சல் குறியீடு" value={data.permanent_address_pin_code} />
        </SubGroup>
      </Section>

      {/* Final submit — sticky on mobile so it's always reachable */}
      <div className="sticky bottom-0 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          {submitting ? 'Submitting…' : 'Confirm & Submit / உறுதிசெய்க'}
        </Button>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          After submit, this form cannot be reopened. / சமர்ப்பித்த பிறகு திருத்த முடியாது.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  titleTamil,
  onEdit,
  children,
}: {
  title: string;
  titleTamil: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <h3 className="text-sm font-semibold">
          {title}{' '}
          <span className="text-muted-foreground font-normal">/ {titleTamil}</span>
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="h-8 gap-1.5 shrink-0"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </div>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function SubGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {title}
      </p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: unknown }) {
  const filled = looksFilled(value);
  return (
    <div className="grid grid-cols-[40%_60%] gap-3 items-baseline text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          filled
            ? 'text-right break-words font-medium text-foreground'
            : 'text-right text-muted-foreground italic'
        }
      >
        {filled ? String(value) : EMPTY}
      </span>
    </div>
  );
}

function MarksRow({
  max,
  obtained,
  percentage,
}: {
  max?: unknown;
  obtained?: unknown;
  percentage?: unknown;
}) {
  const hasAny = looksFilled(max) || looksFilled(obtained);
  if (!hasAny) {
    return <Row label="Marks" value={undefined} />;
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat label="Max" value={max} />
      <Stat label="Obtained" value={obtained} />
      <Stat
        label="Percentage"
        value={looksFilled(percentage) ? `${percentage}%` : undefined}
        emphasis
      />
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value?: unknown;
  emphasis?: boolean;
}) {
  const filled = looksFilled(value);
  return (
    <div
      className={
        emphasis
          ? 'rounded-md border border-primary/30 bg-primary/5 px-3 py-2'
          : 'rounded-md border bg-background px-3 py-2'
      }
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`tabular-nums ${emphasis ? 'text-base font-semibold text-primary' : 'text-sm font-medium'}`}
      >
        {filled ? String(value) : EMPTY}
      </p>
    </div>
  );
}

function CutoffChip({ label, value }: { label: string; value?: unknown }) {
  const filled = looksFilled(value);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${filled ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {filled ? String(value) : EMPTY}
      </p>
    </div>
  );
}

function SubjectChips({ subjects }: { subjects: Record<string, string> }) {
  const labelMap: Record<string, string> = {
    physics: 'Physics',
    chemistry: 'Chemistry',
    biology: 'Biology',
    botany: 'Botany',
    zoology: 'Zoology',
    mathematics: 'Mathematics',
    computer_science: 'Comp. Sci.',
    accountancy: 'Accountancy',
    commerce: 'Commerce',
    economics: 'Economics',
    history: 'History',
    statistics: 'Statistics',
    geography: 'Geography',
  };
  const entries = Object.entries(subjects).filter(([, v]) => looksFilled(v));
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Subject-wise marks</p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <span
            key={k}
            className="inline-flex items-baseline gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs"
          >
            <span className="text-muted-foreground">{labelMap[k] ?? k}</span>
            <span className="font-medium tabular-nums">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
