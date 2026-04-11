import QRCode from 'qrcode';
import sharp from 'sharp';

export interface QRGeneratorInput {
  bibNumber: string;
  participantName: string;
  stallCode: string | null;
  eventName: string;
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
 */
export async function generateMarathonQR(input: QRGeneratorInput): Promise<Buffer> {
  const { bibNumber, participantName, stallCode, eventName } = input;

  // 1. Generate QR code buffer
  const qrBuffer = await QRCode.toBuffer(`BIB:${bibNumber}`, {
    type: 'png',
    width: 300,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  // 2. Escape XML special characters for SVG
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // 3. Build SVG text overlay
  const stallLine = stallCode
    ? `<text x="200" y="415" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#e94560">Stall: ${esc(stallCode)}</text>`
    : '';

  const svg = `<svg width="400" height="520" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="520" fill="white"/>
  <text x="200" y="35" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#1a1a2e">${esc(eventName)}</text>
  <text x="200" y="385" text-anchor="middle" font-family="monospace" font-size="28" font-weight="bold" fill="#1a1a2e">BIB: ${esc(bibNumber)}</text>
  ${stallLine}
  <text x="200" y="445" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#555555">${esc(participantName)}</text>
  <line x1="40" y1="465" x2="360" y2="465" stroke="#cccccc" stroke-width="1"/>
  <text x="200" y="488" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#1a1a2e">JKKN Educational Institutions</text>
  <text x="200" y="508" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#e94560">India&#39;s 1st AI Empowered Marathon</text>
</svg>`;

  const svgBuffer = Buffer.from(svg);

  // 4. Composite QR code onto SVG background
  const image = await sharp(svgBuffer)
    .composite([{ input: qrBuffer, top: 55, left: 50 }])
    .png()
    .toBuffer();

  return image;
}
