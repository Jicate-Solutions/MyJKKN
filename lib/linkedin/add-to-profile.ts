/**
 * LinkedIn "Add to Profile" URL builder.
 *
 * Pure URL construction — NO API, NO OAuth, NO developer app required. It just
 * pre-fills LinkedIn's "add a certification" dialog on the member's own profile.
 * Docs: https://addtoprofile.linkedin.com/  ·  LinkedIn Help answer a528030.
 *
 * This is deliberately decoupled from the Community Management API (which is
 * pending approval). Certificates can link to LinkedIn today with zero deps.
 */

/**
 * JKKN's LinkedIn identity for the certification "issuing organization".
 *
 * Starts with `name` only (renders as plain text — works immediately, no
 * dependency). Once the Community Management API app is approved, populate `id`
 * with the numeric LinkedIn Organization ID (from the `organizationAcls`
 * response) — LinkedIn will then render a LINKED JKKN page + logo on the
 * member's profile instead of plain text. That upgrade is this one line only.
 */
export const JKKN_LINKEDIN_ORG = {
  name: 'J.K.K. Nattraja Educational Institutions',
  /** Numeric LinkedIn Organization ID — fill once CMA access is approved. */
  id: null as string | null,
};

export interface AddToProfileCert {
  /** Certification title shown on the profile (e.g. the course name). Required. */
  name: string;
  /** Credential / certificate number. */
  certId?: string | null;
  /** PUBLIC "see credential" URL (must be reachable without login). */
  certUrl?: string | null;
  /** Issue date (ISO string or Date). */
  issuedAt?: string | Date | null;
  /** Optional expiry date. */
  expiresAt?: string | Date | null;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Build the LinkedIn "Add to Profile" URL for a certification.
 * All optional fields are omitted when absent; whatever is present is
 * pre-filled in the LinkedIn dialog. Values are percent-encoded.
 */
export function buildAddToProfileUrl(cert: AddToProfileCert): string {
  const params = new URLSearchParams();
  params.set('startTask', 'CERTIFICATION_NAME');
  params.set('name', cert.name);

  // Prefer the numeric org ID (linked page + logo) when we have it; else name.
  if (JKKN_LINKEDIN_ORG.id) {
    params.set('organizationId', JKKN_LINKEDIN_ORG.id);
  } else {
    params.set('organizationName', JKKN_LINKEDIN_ORG.name);
  }

  const issued = toDate(cert.issuedAt);
  if (issued) {
    params.set('issueYear', String(issued.getFullYear()));
    params.set('issueMonth', String(issued.getMonth() + 1));
  }

  const expires = toDate(cert.expiresAt);
  if (expires) {
    params.set('expirationYear', String(expires.getFullYear()));
    params.set('expirationMonth', String(expires.getMonth() + 1));
  }

  if (cert.certId) params.set('certId', cert.certId);
  if (cert.certUrl) params.set('certUrl', cert.certUrl);

  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}
