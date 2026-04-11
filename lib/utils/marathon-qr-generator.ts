import QRCode from 'qrcode';
import sharp from 'sharp';

export interface QRGeneratorInput {
  bibNumber: string;
  participantName: string;
  stallCode: string | null;
  eventName: string;
}

/**
 * Render text as a PNG buffer using sharp's native Pango text engine.
 * This does NOT use SVG — it goes through libvips/Pango directly,
 * which works reliably on Vercel's serverless Linux environment.
 */
async function renderText(
  text: string,
  options: {
    width: number;
    fontSize: number;
    bold?: boolean;
    color: string;
    align?: 'centre' | 'left';
    mono?: boolean;
  }
): Promise<Buffer> {
  const {
    width,
    fontSize,
    bold = false,
    color,
    align = 'centre',
    mono = false,
  } = options;

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const fontFace = mono ? 'monospace' : 'sans';
  const boldOpen = bold ? '<b>' : '';
  const boldClose = bold ? '</b>' : '';
  const markup = `<span foreground="${color}" font="${fontFace} ${fontSize}">${boldOpen}${escaped}${boldClose}</span>`;

  return sharp({
    text: {
      text: markup,
      width,
      align,
      rgba: true,
    },
  })
    .png()
    .toBuffer();
}

/**
 * Generates a branded QR code PNG image for a marathon participant.
 *
 * Uses sharp's native Pango text engine (NOT SVG fonts) so text
 * renders correctly on all environments including Vercel serverless.
 *
 * Layout (400×520px):
 *   Event name → QR code → BIB → Stall → Name → divider → JKKN → tagline
 */
export async function generateMarathonQR(input: QRGeneratorInput): Promise<Buffer> {
  const { bibNumber, participantName, stallCode, eventName } = input;

  const WIDTH = 400;
  const HEIGHT = 520;
  const QR_SIZE = 300;

  // 1. Generate QR code
  const qrBuffer = await QRCode.toBuffer(`BIB:${bibNumber}`, {
    type: 'png',
    width: QR_SIZE,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  // 2. Render all text lines using Pango (NOT SVG)
  const truncatedName = participantName.length > 35
    ? participantName.slice(0, 35) + '...'
    : participantName;

  const textLayers = await Promise.all([
    renderText(eventName, { width: WIDTH - 40, fontSize: 14, bold: true, color: '#1a1a2e' }),
    renderText(`BIB: ${bibNumber}`, { width: WIDTH - 40, fontSize: 24, bold: true, color: '#1a1a2e', mono: true }),
    renderText(truncatedName, { width: WIDTH - 40, fontSize: 12, color: '#555555' }),
    renderText('JKKN Educational Institutions', { width: WIDTH - 40, fontSize: 11, bold: true, color: '#1a1a2e' }),
    renderText("India's 1st AI Empowered Marathon", { width: WIDTH - 40, fontSize: 9, color: '#e94560' }),
    stallCode
      ? renderText(`Stall: ${stallCode}`, { width: WIDTH - 40, fontSize: 15, bold: true, color: '#e94560' })
      : null,
  ]);

  const [eventNameImg, bibImg, nameImg, jkknImg, taglineImg, stallImg] = textLayers;

  // 3. Get actual heights of rendered text
  const getHeight = async (buf: Buffer) => (await sharp(buf).metadata()).height ?? 20;

  const heights = await Promise.all([
    getHeight(eventNameImg),
    getHeight(bibImg),
    getHeight(nameImg),
    getHeight(jkknImg),
    getHeight(taglineImg),
    stallImg ? getHeight(stallImg) : 0,
  ]);

  // 4. Create divider line
  const dividerImg = await sharp({
    create: { width: WIDTH - 80, height: 1, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 1 } },
  }).png().toBuffer();

  // 5. Build composite layers with proper vertical positioning
  const composites: sharp.OverlayOptions[] = [];

  // Event name centered at top
  const eventNameLeft = Math.max(0, Math.round((WIDTH - (WIDTH - 40)) / 2));
  composites.push({ input: eventNameImg, top: 12, left: eventNameLeft });

  // QR code centered below event name
  const qrTop = 12 + heights[0] + 8;
  const qrLeft = Math.round((WIDTH - QR_SIZE) / 2);
  composites.push({ input: qrBuffer, top: qrTop, left: qrLeft });

  // Text below QR
  let y = qrTop + QR_SIZE + 10;

  // BIB number
  composites.push({ input: bibImg, top: y, left: 20 });
  y += heights[1] + 4;

  // Stall (if assigned)
  if (stallImg) {
    composites.push({ input: stallImg, top: y, left: 20 });
    y += heights[5] + 2;
  }

  // Participant name
  composites.push({ input: nameImg, top: y, left: 20 });
  y += heights[2] + 10;

  // Divider
  composites.push({ input: dividerImg, top: y, left: 40 });
  y += 10;

  // JKKN branding
  composites.push({ input: jkknImg, top: y, left: 20 });
  y += heights[3] + 2;

  // Tagline
  composites.push({ input: taglineImg, top: y, left: 20 });

  // 6. Create white canvas and composite everything
  const image = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return image;
}
