/**
 * scan-normalize — turns whatever a scanner produced into a clean lookup query.
 *
 * Shared by the JKKN-ID lookup surfaces (`/users/jkkn-id`, `JkknScanButton`).
 * The campus-living lanes (mess/gate) deliberately keep their own local copy —
 * see the DELIBERATELY LOCAL note in mess-scan-resolver.ts — so a change here
 * can never silently alter who a door refuses.
 *
 * Barcode wedges and camera decoders both like to append a newline, and a
 * hand-typed JKKN ID arrives with the dash missing or padded — none of which
 * should read as "not recognised".
 */

/** What the scanned string looks like, before any database is touched. */
export type ScannedCodeShape = 'uuid' | 'jkkn_id' | 'other';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JKKN_ID_RE = /^[0-9]{6}-[0-9]$/;

export function classifyScannedCode(raw: string | null | undefined): {
  code: string;
  shape: ScannedCodeShape;
} {
  const code = (raw ?? '').replace(/[\r\n]/g, '').trim();
  if (UUID_RE.test(code)) return { code, shape: 'uuid' };
  const compact = code.replace(/[\s-]/g, '');
  if (/^[0-9]{7}$/.test(compact)) {
    return { code: `${compact.slice(0, 6)}-${compact.slice(6)}`, shape: 'jkkn_id' };
  }
  if (JKKN_ID_RE.test(code)) return { code, shape: 'jkkn_id' };
  return { code, shape: 'other' };
}
