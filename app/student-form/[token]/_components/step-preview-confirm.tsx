'use client';

import { Button } from '@/components/ui/button';
import { Loader2, Pencil } from 'lucide-react';
import type { Language } from './language-toggle';

interface Props {
  lang: Language;
  data: Record<string, any>;
  onSubmit: () => void;
  onEditBasic: () => void;
  onEditAcademic: () => void;
  onEditContact: () => void;
  submitting: boolean;
}

export function StepPreviewConfirm({
  data, onSubmit, onEditBasic, onEditAcademic, onEditContact, submitting,
}: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Review your details / உங்கள் விவரங்களை சரிபார்க்கவும்</h2>
      <p className="text-sm text-muted-foreground">
        Tap Edit to fix anything before final submit. Once submitted, you cannot change it.
      </p>

      <Section title="Basic Details / அடிப்படை" onEdit={onEditBasic}>
        {data.student_photo_url && (
          <div><img src={data.student_photo_url} alt="" className="h-20 w-20 rounded-full object-cover" /></div>
        )}
        <Row label="Name" value={`${data.first_name ?? ''} ${data.last_name ?? ''}`.trim()} />
        <Row label="DOB" value={data.date_of_birth} />
        <Row label="Gender" value={data.gender} />
        <Row label="Religion / Community / Caste"
             value={[data.religion, data.community, data.caste].filter(Boolean).join(' · ')} />
        <Row label="Father" value={`${data.father_name ?? ''}${data.father_mobile ? ` (${data.father_mobile})` : ''}`} />
        <Row label="Mother" value={`${data.mother_name ?? ''}${data.mother_mobile ? ` (${data.mother_mobile})` : ''}`} />
        <Row label="Annual income" value={data.annual_income} />
      </Section>

      <Section title="Academic / கல்வி" onEdit={onEditAcademic}>
        <Row label="10th Max / Obtained"
             value={`${data.tenth_marks?.max ?? ''} / ${data.tenth_marks?.obtained ?? ''}`} />
        <Row label="12th Max / Obtained"
             value={`${data.twelfth_marks?.max ?? ''} / ${data.twelfth_marks?.obtained ?? ''}`} />
        <Row label="12th Group" value={data.twelfth_marks?.group} />
        <Row label="Last School" value={data.last_school} />
        <Row label="Board" value={data.board_of_study} />
        <Row label="NEET Roll / Score"
             value={`${data.neet_roll_number ?? ''} / ${data.neet_score ?? ''}`} />
        <Row label="Scholarship" value={data.scholarship_type} />
        <Row label="Quota / Entry"
             value={`${data.quota ?? ''}${data.entry_type ? ` · ${data.entry_type}` : ''}`} />
      </Section>

      <Section title="Contact / தொடர்பு" onEdit={onEditContact}>
        <Row label="Mobile" value={data.student_mobile} />
        <Row label="Email" value={data.student_email} />
        <Row label="Address" value={data.permanent_address_street} />
        <Row label="State / District / Taluk"
             value={[data.permanent_address_state, data.permanent_address_district, data.permanent_address_taluk].filter(Boolean).join(' · ')} />
        <Row label="Pincode" value={data.permanent_address_pin_code} />
      </Section>

      <Button onClick={onSubmit} disabled={submitting}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white">
        {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Confirm & Submit / உறுதிசெய்க
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        After submit, this form cannot be reopened. / சமர்ப்பித்த பிறகு திருத்த முடியாது.
      </p>
    </div>
  );
}

function Section({ title, onEdit, children }: {
  title: string; onEdit: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 gap-1">
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      </div>
      <div className="px-3 py-2 space-y-1.5 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: any }) {
  const display = value && String(value).trim() ? String(value) : '—';
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{display}</span>
    </div>
  );
}
