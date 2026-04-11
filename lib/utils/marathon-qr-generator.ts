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
 * Render text as PNG and return buffer with dimensions.
 * Uses sharp's native Pango engine — works on Vercel.
 */
async function renderText(
  text: string,
  options: {
    fontSize: number;
    bold?: boolean;
    color: string;
    mono?: boolean;
    maxWidth?: number;
  }
): Promise<TextLayer> {
  const { fontSize, bold = false, color, mono = false, maxWidth } = options;

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const fontFace = mono ? 'monospace' : 'sans';
  const boldOpen = bold ? '<b>' : '';
  const boldClose = bold ? '</b>' : '';
  const markup = `<span foreground="${color}" font="${fontFace} ${fontSize}">${boldOpen}${escaped}${boldClose}</span>`;

  const textOpts: any = { text: markup, rgba: true };
  if (maxWidth) textOpts.width = maxWidth;

  const buffer = await sharp({ text: textOpts }).png().toBuffer();
  const meta = await sharp(buffer).metadata();

  return {
    buffer,
    width: meta.width ?? 100,
    height: meta.height ?? 20,
  };
}

/**
 * Generates a branded QR code PNG for a marathon participant.
 * All elements are horizontally centered on a 400×520 white canvas.
 */
export async function generateMarathonQR(input: QRGeneratorInput): Promise<Buffer> {
  const { bibNumber, participantName, stallCode, eventName } = input;

  const W = 400;
  const H = 520;
  const QR_SIZE = 280;

  // 1. QR code
  const qrBuffer = await QRCode.toBuffer(`BIB:${bibNumber}`, {
    type: 'png',
    width: QR_SIZE,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  // 2. Render text layers
  const truncName = participantName.length > 35
    ? participantName.slice(0, 35) + '...'
    : participantName;

  const [eventTxt, bibTxt, nameTxt, jkknTxt, tagTxt, stallTxt] = await Promise.all([
    renderText(eventName, { fontSize: 13, bold: true, color: '#1a1a2e', maxWidth: W - 20 }),
    renderText(`BIB: ${bibNumber}`, { fontSize: 22, bold: true, color: '#1a1a2e', mono: true }),
    renderText(truncName, { fontSize: 11, color: '#555555', maxWidth: W - 20 }),
    renderText('JKKN Educational Institutions', { fontSize: 10, bold: true, color: '#1a1a2e' }),
    renderText("India's 1st AI Empowered Marathon", { fontSize: 9, color: '#e94560' }),
    stallCode ? renderText(`Stall: ${stallCode}`, { fontSize: 14, bold: true, color: '#e94560' }) : null,
  ]);

  // 3. Divider
  const divW = 320;
  const divider = await sharp({
    create: { width: divW, height: 1, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 1 } },
  }).png().toBuffer();

  // Helper: center horizontally
  const cx = (layerWidth: number) => Math.max(0, Math.round((W - layerWidth) / 2));

  // 4. Build composites — all centered
  const layers: sharp.OverlayOptions[] = [];

  // Event name
  layers.push({ input: eventTxt.buffer, top: 14, left: cx(eventTxt.width) });

  // QR code
  const qrTop = 14 + eventTxt.height + 10;
  layers.push({ input: qrBuffer, top: qrTop, left: cx(QR_SIZE) });

  // Below QR
  let y = qrTop + QR_SIZE + 10;

  // BIB
  layers.push({ input: bibTxt.buffer, top: y, left: cx(bibTxt.width) });
  y += bibTxt.height + 4;

  // Stall
  if (stallTxt) {
    layers.push({ input: stallTxt.buffer, top: y, left: cx(stallTxt.width) });
    y += stallTxt.height + 2;
  }

  // Name
  layers.push({ input: nameTxt.buffer, top: y, left: cx(nameTxt.width) });
  y += nameTxt.height + 10;

  // Divider
  layers.push({ input: divider, top: y, left: cx(divW) });
  y += 10;

  // JKKN
  layers.push({ input: jkknTxt.buffer, top: y, left: cx(jkknTxt.width) });
  y += jkknTxt.height + 3;

  // Tagline
  layers.push({ input: tagTxt.buffer, top: y, left: cx(tagTxt.width) });

  // 5. Compose
  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite(layers)
    .png()
    .toBuffer();
}
