import QRCode from 'qrcode';
import sharp from 'sharp';

export interface QRGeneratorInput {
  bibNumber: string;
  participantName: string;
  stallCode: string | null;
  eventName: string;
}

/**
 * Create a text image using sharp's built-in text rendering.
 * Uses Pango markup which works on Vercel's Linux environment
 * with DejaVu Sans (guaranteed available).
 */
async function renderText(
  text: string,
  options: {
    width: number;
    height: number;
    fontSize: number;
    fontWeight?: 'normal' | 'bold';
    color: string;
    align?: 'centre' | 'left';
    fontFamily?: string;
  }
): Promise<Buffer> {
  const {
    width,
    height,
    fontSize,
    fontWeight = 'normal',
    color,
    align = 'centre',
    fontFamily = 'sans-serif',
  } = options;

  const weight = fontWeight === 'bold' ? ' font_weight="bold"' : '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const svgText = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${align === 'centre' ? width / 2 : 10}" y="${Math.round(height * 0.75)}"
      text-anchor="${align === 'centre' ? 'middle' : 'start'}"
      font-family="${fontFamily}, DejaVu Sans, Liberation Sans, sans-serif"
      font-size="${fontSize}"
      ${fontWeight === 'bold' ? 'font-weight="bold"' : ''}
      fill="${color}">${escaped}</text>
  </svg>`;

  return sharp(Buffer.from(svgText))
    .png()
    .toBuffer();
}

/**
 * Generates a branded QR code PNG image for a marathon participant.
 *
 * Layout (400×520px white background):
 *   Line 1  – event name (16px bold, centered)
 *   QR code – 300×300, encodes `BIB:{bibNumber}`
 *   Line 2  – BIB number (28px bold monospace)
 *   Line 3  – Stall code (18px, red, optional)
 *   Line 4  – Participant name (14px, grey)
 *   Divider
 *   Line 5  – JKKN Educational Institutions (12px bold)
 *   Line 6  – Tagline (10px, red)
 *
 * Uses DejaVu Sans / Liberation Sans fonts which are available on
 * Vercel's serverless Linux environment. Does NOT depend on Arial.
 */
export async function generateMarathonQR(input: QRGeneratorInput): Promise<Buffer> {
  const { bibNumber, participantName, stallCode, eventName } = input;

  const WIDTH = 400;
  const HEIGHT = 520;

  // 1. Generate QR code buffer
  const qrBuffer = await QRCode.toBuffer(`BIB:${bibNumber}`, {
    type: 'png',
    width: 300,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  // 2. Render each text line as a separate PNG
  const [eventNameImg, bibImg, nameImg, jkknImg, taglineImg, stallImg, dividerImg] =
    await Promise.all([
      // Event name (top)
      renderText(eventName, {
        width: WIDTH,
        height: 30,
        fontSize: 15,
        fontWeight: 'bold',
        color: '#1a1a2e',
      }),
      // BIB number
      renderText(`BIB: ${bibNumber}`, {
        width: WIDTH,
        height: 36,
        fontSize: 26,
        fontWeight: 'bold',
        color: '#1a1a2e',
        fontFamily: 'monospace, DejaVu Sans Mono, Liberation Mono',
      }),
      // Participant name
      renderText(participantName.length > 30 ? participantName.slice(0, 30) + '...' : participantName, {
        width: WIDTH,
        height: 24,
        fontSize: 13,
        color: '#555555',
      }),
      // JKKN branding
      renderText('JKKN Educational Institutions', {
        width: WIDTH,
        height: 22,
        fontSize: 11,
        fontWeight: 'bold',
        color: '#1a1a2e',
      }),
      // Tagline
      renderText("India's 1st AI Empowered Marathon", {
        width: WIDTH,
        height: 20,
        fontSize: 10,
        color: '#e94560',
      }),
      // Stall (optional)
      stallCode
        ? renderText(`Stall: ${stallCode}`, {
            width: WIDTH,
            height: 26,
            fontSize: 16,
            fontWeight: 'bold',
            color: '#e94560',
          })
        : Promise.resolve(null),
      // Divider line
      sharp({
        create: {
          width: WIDTH - 80,
          height: 1,
          channels: 4,
          background: { r: 204, g: 204, b: 204, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    ]);

  // 3. Compose everything onto white background
  const composites: sharp.OverlayOptions[] = [
    // Event name at top
    { input: eventNameImg, top: 10, left: 0 },
    // QR code centered
    { input: qrBuffer, top: 50, left: 50 },
    // BIB number
    { input: bibImg, top: 360, left: 0 },
  ];

  let nextY = 396;

  // Stall (if assigned)
  if (stallImg) {
    composites.push({ input: stallImg, top: nextY, left: 0 });
    nextY += 26;
  }

  // Participant name
  composites.push({ input: nameImg, top: nextY, left: 0 });
  nextY += 28;

  // Divider
  composites.push({ input: dividerImg, top: nextY + 4, left: 40 });
  nextY += 16;

  // JKKN branding
  composites.push({ input: jkknImg, top: nextY, left: 0 });
  nextY += 20;

  // Tagline
  composites.push({ input: taglineImg, top: nextY, left: 0 });

  // 4. Create white background and composite all layers
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
