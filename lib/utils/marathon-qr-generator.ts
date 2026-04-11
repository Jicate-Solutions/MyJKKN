import QRCode from 'qrcode';
import sharp from 'sharp';

export interface QRGeneratorInput {
  bibNumber: string;
  participantName: string;
  stallCode: string | null;
  eventName: string;
}

interface TextLayer {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Render text as PNG using sharp's native Pango engine.
 * Returns buffer + actual dimensions for manual centering.
 */
async function renderText(
  text: string,
  options: {
    fontSize: number;
    bold?: boolean;
    color: string;
    mono?: boolean;
    maxWidth?: number;
    allCaps?: boolean;
    letterSpacing?: boolean;
  }
): Promise<TextLayer> {
  const {
    fontSize, bold = false, color, mono = false,
    maxWidth, allCaps = false, letterSpacing = false,
  } = options;

  let displayText = allCaps ? text.toUpperCase() : text;
  // Simulate letter spacing by adding thin spaces between chars
  if (letterSpacing) {
    displayText = displayText.split('').join(' ');
  }

  const escaped = displayText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const fontFace = mono ? 'monospace' : 'sans';
  const b1 = bold ? '<b>' : '';
  const b2 = bold ? '</b>' : '';
  const markup = `<span foreground="${color}" font="${fontFace} ${fontSize}">${b1}${escaped}${b2}</span>`;

  const textOpts: any = { text: markup, rgba: true };
  if (maxWidth) textOpts.width = maxWidth;

  const buffer = await sharp({ text: textOpts }).png().toBuffer();
  const meta = await sharp(buffer).metadata();

  return { buffer, width: meta.width ?? 100, height: meta.height ?? 20 };
}

/**
 * Generates a branded QR code PNG for a marathon participant.
 * All elements centered on a 400x540 white canvas.
 */
export async function generateMarathonQR(input: QRGeneratorInput): Promise<Buffer> {
  const { bibNumber, participantName, stallCode, eventName } = input;

  const W = 400;
  const H = 540;
  const QR_SIZE = 260;

  // 1. QR code
  const qrBuffer = await QRCode.toBuffer(`BIB:${bibNumber}`, {
    type: 'png',
    width: QR_SIZE,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  // 2. Render text layers with improved sizing
  const truncName = participantName.length > 30
    ? participantName.slice(0, 30) + '...'
    : participantName;

  const [eventTxt, bibTxt, nameTxt, jkknTxt, tagTxt, stallTxt] = await Promise.all([
    // Event name — prominent at top
    renderText(eventName, { fontSize: 14, bold: true, color: '#111827', maxWidth: W - 30 }),
    // BIB — large and bold
    renderText(`BIB: ${bibNumber}`, { fontSize: 24, bold: true, color: '#111827', mono: true }),
    // Participant name — medium, readable
    renderText(truncName, { fontSize: 13, color: '#374151', maxWidth: W - 30 }),
    // JKKN — clear branding, slightly larger
    renderText('JKKN Educational Institutions', { fontSize: 12, bold: true, color: '#111827' }),
    // Tagline — accent color, readable
    renderText("India's 1st AI Empowered Marathon", { fontSize: 11, bold: true, color: '#e94560' }),
    // Stall — if assigned
    stallCode ? renderText(`Stall: ${stallCode}`, { fontSize: 15, bold: true, color: '#e94560' }) : null,
  ]);

  // 3. Divider
  const divW = 300;
  const divider = await sharp({
    create: { width: divW, height: 2, channels: 4, background: { r: 229, g: 231, b: 235, alpha: 1 } },
  }).png().toBuffer();

  // Center helper
  const cx = (lw: number) => Math.max(0, Math.round((W - lw) / 2));

  // 4. Compose all layers
  const layers: sharp.OverlayOptions[] = [];
  let y = 18;

  // Event name
  layers.push({ input: eventTxt.buffer, top: y, left: cx(eventTxt.width) });
  y += eventTxt.height + 14;

  // QR code
  layers.push({ input: qrBuffer, top: y, left: cx(QR_SIZE) });
  y += QR_SIZE + 14;

  // BIB number
  layers.push({ input: bibTxt.buffer, top: y, left: cx(bibTxt.width) });
  y += bibTxt.height + 4;

  // Stall
  if (stallTxt) {
    layers.push({ input: stallTxt.buffer, top: y, left: cx(stallTxt.width) });
    y += stallTxt.height + 4;
  }

  // Participant name
  layers.push({ input: nameTxt.buffer, top: y, left: cx(nameTxt.width) });
  y += nameTxt.height + 12;

  // Divider (slightly thicker, lighter color)
  layers.push({ input: divider, top: y, left: cx(divW) });
  y += 12;

  // JKKN branding
  layers.push({ input: jkknTxt.buffer, top: y, left: cx(jkknTxt.width) });
  y += jkknTxt.height + 4;

  // Tagline
  layers.push({ input: tagTxt.buffer, top: y, left: cx(tagTxt.width) });

  // 5. White canvas + composite
  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite(layers)
    .png()
    .toBuffer();
}
