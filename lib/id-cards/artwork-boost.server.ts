// ============================================================================
// lib/id-cards/artwork-boost.server.ts — SERVER ONLY (imports sharp).
//
// Card artwork (header text, logo, bands) is exported for screens: mid-tone
// greens and the logo print noticeably lighter on YMC ribbon than they look in
// the browser. The render route pushes every artwork towards print before it
// is composited: a mid-tone gamma curve (net exponent ≈ 1.32 — white and black
// stay put; the Matric header green #12724 5 → #075B24) plus saturation ×1.15.
// Preview and plastic move together. Photos are NOT touched.
//
// Lives apart from render-data.ts because that module is shared with browser
// bundles (template editor types) and sharp cannot be bundled for the client.
// Fail-soft: any sharp error returns the original bytes.
// ============================================================================

import 'server-only';

// sharp.gamma(a, b): brighten by a, darken by b → net darkening when b < a.
const ARTWORK_GAMMA_IN = 2.9;
const ARTWORK_GAMMA_OUT = 2.2;
const ARTWORK_SATURATION = 1.15;

export async function boostArtworkForPrint(dataUrl: string | null): Promise<string | null> {
  if (!dataUrl) return null;
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return dataUrl;
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(Buffer.from(m[2], 'base64'))
      .gamma(ARTWORK_GAMMA_IN, ARTWORK_GAMMA_OUT)
      .modulate({ saturation: ARTWORK_SATURATION })
      .png()
      .toBuffer();
    return `data:image/png;base64,${out.toString('base64')}`;
  } catch (err) {
    console.warn('[id-cards/render] artwork density boost skipped:', err);
    return dataUrl;
  }
}
