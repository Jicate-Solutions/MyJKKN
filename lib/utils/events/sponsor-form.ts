// lib/utils/events/sponsor-form.ts
// The shared Sponsors board's add/edit dialog state → the write payload
// (BUG-006143). Pure so the trimming / blank→null / amount rules are testable
// without rendering the dialog.

import type {
  MarathonSponsor,
  SponsorPipelineStage,
  SponsorTier,
} from '@/types/events-marathon';

export interface SponsorFormState {
  company_name: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  tier: SponsorTier;
  pipeline_stage: SponsorPipelineStage;
  amount_pledged: string;
  amount_received: string;
  notes: string;
}

export const EMPTY_SPONSOR_FORM: SponsorFormState = {
  company_name: '',
  contact_person: '',
  contact_email: '',
  contact_phone: '',
  website: '',
  tier: 'bronze',
  pipeline_stage: 'lead',
  amount_pledged: '',
  amount_received: '',
  notes: '',
};

export function sponsorToForm(s: MarathonSponsor): SponsorFormState {
  return {
    company_name: s.company_name ?? '',
    contact_person: s.contact_person ?? '',
    contact_email: s.contact_email ?? '',
    contact_phone: s.contact_phone ?? '',
    website: s.website ?? '',
    tier: s.tier,
    pipeline_stage: s.pipeline_stage,
    amount_pledged: s.amount_pledged ? String(s.amount_pledged) : '',
    amount_received: s.amount_received ? String(s.amount_received) : '',
    notes: s.notes ?? '',
  };
}

const blankToNull = (v: string) => (v.trim() ? v.trim() : null);
/** Empty / negative / non-numeric → 0. */
const toAmount = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Fields written on both add and edit. amount_received is only editable on edit. */
export function sponsorFormToPayload(form: SponsorFormState, mode: 'add' | 'edit') {
  const payload = {
    company_name: form.company_name.trim(),
    contact_person: blankToNull(form.contact_person),
    contact_email: blankToNull(form.contact_email),
    contact_phone: blankToNull(form.contact_phone),
    website: blankToNull(form.website),
    tier: form.tier,
    pipeline_stage: form.pipeline_stage,
    amount_pledged: toAmount(form.amount_pledged),
    notes: blankToNull(form.notes),
  };
  return mode === 'edit'
    ? { ...payload, amount_received: toAmount(form.amount_received) }
    : payload;
}
