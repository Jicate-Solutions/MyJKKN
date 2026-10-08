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

// ── Printer back: strictly black & white ─────────────────────────────────────
//
// The card is "colour front, black back". The back is printed by the ribbon's
// single black RESIN panel (Evolis "YMCO / K", SDK duplex type colour/mono),
// which can only lay black or nothing: greys and colour either get dithered
// into speckle or — worse — make a station that picks panels from the image
// reach for a second full colour set. So the PNG handed to the print bridge is
// thresholded to pure #000 / #fff. Anti-aliased edges fall to whichever side
// they are nearer; the cut sits a little above mid-grey so thin strokes keep
// their weight on plastic. Previews are NOT thresholded — only
// side=back&format=png (the bridge download) goes through here.
//
// Output stays 3-channel sRGB: the bridge converts to RGB/BMP and should not
// have to care that the content is two-tone. Fail-soft like the boost above.
export const MONO_BACK_THRESHOLD = 150;

export async function monochromeBackForPrint(png: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(Buffer.from(png))
      .flatten({ background: '#ffffff' })
      .greyscale()
      .threshold(MONO_BACK_THRESHOLD)
      .toColourspace('srgb')
      .png({ compressionLevel: 9 })
      .toBuffer();
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  } catch (err) {
    console.warn('[id-cards/render] monochrome back skipped:', err);
    return png;
  }
}
