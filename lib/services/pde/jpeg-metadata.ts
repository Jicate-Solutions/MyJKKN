// lib/services/pde/jpeg-metadata.ts
// ============================================================================
// Fail-closed JPEG metadata assertion for clinical teaching images.
//
// Clinical images carry identifying data in two places: the file's metadata
// (EXIF/IPTC/XMP — patient name, GPS, device serial, capture timestamp) and the
// pixels themselves (burned-in banners). This module handles the FIRST.
//
// The PMS import path strips metadata at source (sharp re-encode on the PMS box)
// and asserts the result there. Faculty-uploaded files get the same property a
// different way: the browser re-encodes through a canvas (decode → re-encode
// drops every metadata segment by construction) and this assertion verifies the
// upload server-side, so a crafted POST that skips the browser still cannot land
// an EXIF-bearing file in the bucket.
//
// Pure + dependency-free so it is unit-testable and usable in any runtime.
// ============================================================================

/** Segments a clean, re-encoded baseline JPEG is allowed to contain. */
const ALLOWED_MARKERS = new Set<number>([
  0xd8, // SOI
  0xe0, // APP0 (JFIF)
  0xdb, // DQT
  0xc0, // SOF0 (baseline)
  0xc2, // SOF2 (progressive)
  0xc4, // DHT
  0xdd, // DRI
  0xda, // SOS
]);

function markerName(marker: number): string {
  if (marker >= 0xe0 && marker <= 0xef) return `APP${marker - 0xe0}`;
  if (marker === 0xfe) return 'COM';
  return `0x${marker.toString(16).toUpperCase()}`;
}

export interface JpegScanResult {
  ok: boolean;
  /** Metadata-bearing segments found (empty when ok). */
  offending: string[];
  /** Set when the buffer is not a parseable JPEG at all. */
  reason?: string;
}

/**
 * Walk a JPEG's segment markers and report any metadata-bearing segment
 * (APP1–APP15 carry EXIF/XMP/IPTC; COM carries free-text comments).
 *
 * Returns ok:false for anything that is not a well-formed JPEG — callers must
 * treat a non-ok result as "reject", never as "probably fine".
 */
export function scanJpegForMetadata(buf: Uint8Array): JpegScanResult {
  if (buf.length < 4) return { ok: false, offending: [], reason: 'too_short' };
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) {
    return { ok: false, offending: [], reason: 'not_jpeg' };
  }

  const offending: string[] = [];
  let i = 2;

  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) return { ok: false, offending, reason: 'desync' };

    // Skip fill bytes (0xFF padding is legal between segments).
    let marker = buf[i + 1];
    let skip = 0;
    while (marker === 0xff && i + 2 + skip < buf.length) {
      skip++;
      marker = buf[i + 1 + skip];
    }
    i += skip;

    // Start of Scan — entropy-coded image data follows; no more metadata headers.
    if (marker === 0xda) return { ok: offending.length === 0, offending };

    // Standalone markers carry no length field.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }

    if (i + 4 > buf.length) return { ok: false, offending, reason: 'truncated' };
    const length = (buf[i + 2] << 8) | buf[i + 3];
    if (length < 2) return { ok: false, offending, reason: 'bad_segment_length' };

    if (!ALLOWED_MARKERS.has(marker)) offending.push(markerName(marker));

    i += 2 + length;
  }

  // Ran off the end without reaching SOS — not a usable image.
  return { ok: false, offending, reason: 'no_scan_data' };
}

/** True when the buffer starts with the JPEG magic bytes. */
export function isJpegMagic(buf: Uint8Array): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
