import QRCode from 'qrcode';
import sharp from 'sharp';

export interface QRGeneratorInput {
  bibNumber: string;
  participantName: string;
  stallCode: string | null;
  eventName: string;
}

/**
 * Render a single line of text as PNG using a minimal SVG.
 * Each SVG is tiny and self-contained — librsvg handles these reliably
 * even on Vercel's minimal runtime.
 */
async function textToPng(
  text: string,
  fontSize: number,
  color: string,
  bold = false,
  mono = false,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');

  const font = mono ? 'monospace' : 'sans-serif';
  const weight = bold ? 'font-weight="bold"' : '';
  // Estimate width: ~0.6 * fontSize per char for sans, ~0.6 for mono
  const estimatedWidth = Math.ceil(text.length * fontSize * 0.65) + 20;
  const h = Math.ceil(fontSize * 1.6);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${estimatedWidth}" height="${h}">
<text x="0" y="${Math.ceil(fontSize * 1.15)}" font-family="${font}" font-size="${fontSize}" ${weight} fill="${color}">${esc(text)}</text>
</svg>`;

  const raw = await sharp(Buffer.from(svg)).png().toBuffer();
  // Trim transparent padding to get actual text dimensions
  const trimmed = await sharp(raw).trim().png().toBuffer();
  const meta = await sharp(trimmed).metadata();

  return { buffer: trimmed, width: meta.width ?? 50, height: meta.height ?? 20 };
}

/**
 * Generates a branded QR code PNG for a marathon participant.
 *
 * Strategy: QR as raster PNG + each text line as individually rendered
 * SVG→PNG (trimmed). All layers composited onto a white canvas.
 * This avoids any font/scaling issues on serverless environments.
 */
export async function generateMarathonQR(input: QRGeneratorInput): Promise<Buffer> {
  const { bibNumber, participantName, stallCode, eventName } = input;

  const W = 400;
  const H = 540;
  const QR_SIZE = 260;

  // 1. Generate QR as PNG raster
  const qrBuffer = await QRCode.toBuffer(
    bibNumber.startsWith('BIB:') ? bibNumber : `BIB:${bibNumber}`,
    { type: 'png', width: QR_SIZE, margin: 1, errorCorrectionLevel: 'M' }
  );

  // 2. Render text lines
  const truncName = participantName.length > 35
    ? participantName.slice(0, 35) + '...'
    : participantName;

  const textLines = await Promise.all([
    textToPng(eventName, 14, '#111827', true),
    textToPng(`BIB: ${bibNumber}`, 24, '#111827', true, true),
    textToPng(truncName, 13, '#374151'),
    textToPng('JKKN Educational Institutions', 12, '#111827', true),
    textToPng("India's 1st AI Empowered Marathon", 11, '#e94560', true),
    stallCode ? textToPng(`Stall: ${stallCode}`, 15, '#e94560', true) : null,
  ]);

  const [eventTxt, bibTxt, nameTxt, jkknTxt, tagTxt, stallTxt] = textLines;

  // 3. Create divider
  const divider = await sharp({
    create: { width: 300, height: 2, channels: 4, background: { r: 229, g: 231, b: 235, alpha: 1 } },
  }).png().toBuffer();

  // 4. Center helper
  const cx = (layerW: number) => Math.max(0, Math.round((W - layerW) / 2));

  // 5. Position all layers
  const layers: sharp.OverlayOptions[] = [];
  let y = 14;

  // Event name
  layers.push({ input: eventTxt.buffer, top: y, left: cx(eventTxt.width) });
  y += eventTxt.height + 10;

  // QR code
  layers.push({ input: qrBuffer, top: y, left: cx(QR_SIZE) });
  y += QR_SIZE + 12;

  // BIB
  layers.push({ input: bibTxt.buffer, top: y, left: cx(bibTxt.width) });
  y += bibTxt.height + 4;

  // Stall
  if (stallTxt) {
    layers.push({ input: stallTxt.buffer, top: y, left: cx(stallTxt.width) });
    y += stallTxt.height + 4;
  }

  // Name
  layers.push({ input: nameTxt.buffer, top: y, left: cx(nameTxt.width) });
  y += nameTxt.height + 10;

  // Divider
  layers.push({ input: divider, top: y, left: cx(300) });
  y += 12;

  // JKKN
  layers.push({ input: jkknTxt.buffer, top: y, left: cx(jkknTxt.width) });
  y += jkknTxt.height + 4;

  // Tagline
  layers.push({ input: tagTxt.buffer, top: y, left: cx(tagTxt.width) });

  // 6. Composite onto white canvas
  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite(layers)
    .png()
    .toBuffer();
}
