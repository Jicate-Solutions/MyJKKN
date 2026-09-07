// lib/certificates/registry.ts
// ============================================================================
// Certificate template catalogue for approved service requests.
//
// Each template is a code-defined layout (lib/certificates/templates/*) that is
// filled from the requester's learner record. Service types opt in per
// template via service_types.certificate_template_keys; office staff then pick
// one from the request detail page once the request is approved.
//
// Adding a template = add a key here + a renderer in templates/ + register it
// in render.ts. No schema change needed.
// ============================================================================

export type CertificateTemplateKey = 'course_completion' | 'bonafide';

/**
 * Inputs office staff may override at generation time. Everything else is
 * fetched from the learner/request record.
 */
export interface CertificateOverrides {
  /** Issue date shown on the certificate (ISO yyyy-mm-dd). Defaults to today. */
  issueDate?: string;
  /** Bonafide only — "issued only for the purpose of availing ___". */
  purpose?: string;
  /** Course Completion only — "completed the course in ___" (e.g. "April 2026"). */
  completionMonth?: string;
  /** Bonafide only — year/class label such as "I" or "II". */
  yearOfStudy?: string;
}

export interface CertificateTemplateMeta {
  key: CertificateTemplateKey;
  label: string;
  description: string;
  /** Which override inputs the generation dialog should expose. */
  inputs: Array<keyof CertificateOverrides>;
}

export const CERTIFICATE_TEMPLATES: readonly CertificateTemplateMeta[] = [
  {
    key: 'bonafide',
    label: 'Bonafide Certificate',
    description:
      'Certifies the learner is a current student of the college, issued for a stated purpose (scholarship, bank, passport, ...).',
    inputs: ['issueDate', 'yearOfStudy', 'purpose'],
  },
  {
    key: 'course_completion',
    label: 'Course Completion Certificate',
    description:
      'Certifies the learner was a bonafide student for the programme duration and completed the course in the stated month.',
    inputs: ['issueDate', 'completionMonth'],
  },
] as const;

export const CERTIFICATE_TEMPLATE_KEYS: readonly CertificateTemplateKey[] =
  CERTIFICATE_TEMPLATES.map((t) => t.key);

export function isCertificateTemplateKey(value: unknown): value is CertificateTemplateKey {
  return typeof value === 'string' && (CERTIFICATE_TEMPLATE_KEYS as string[]).includes(value);
}

export function getCertificateTemplate(key: CertificateTemplateKey): CertificateTemplateMeta {
  const meta = CERTIFICATE_TEMPLATES.find((t) => t.key === key);
  if (!meta) throw new Error(`Unknown certificate template: ${key}`);
  return meta;
}
