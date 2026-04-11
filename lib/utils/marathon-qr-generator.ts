import QRCode from 'qrcode';
import sharp from 'sharp';

export interface QRGeneratorInput {
  bibNumber: string;
  participantName: string;
  stallCode: string | null;
  eventName: string;
}

/**
 * Generates a branded QR code PNG for a marathon participant.
 *
 * Approach: Generate QR as SVG string, embed it inside a full SVG
 * document with text, then render the entire SVG to PNG via sharp.
 * This uses librsvg (NOT Pango) for text rendering, which handles
 * fonts differently and works on Vercel's serverless environment.
 */
export async function generateMarathonQR(input: QRGeneratorInput): Promise<Buffer> {
  const { bibNumber, participantName, stallCode, eventName } = input;

  const W = 400;
  const H = 540;
  const QR_SIZE = 260;
  const QR_X = (W - QR_SIZE) / 2;

  // 1. Generate QR code as SVG string
  const qrSvgString = await QRCode.toString(bibNumber.startsWith('BIB:') ? bibNumber : `BIB:${bibNumber}`, {
    type: 'svg',
    width: QR_SIZE,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });

  // Extract viewBox dimensions and inner SVG content
  const viewBoxMatch = qrSvgString.match(/viewBox="0 0 (\d+) (\d+)"/);
  const qrNativeSize = viewBoxMatch ? parseInt(viewBoxMatch[1]) : 33;
  const qrScale = QR_SIZE / qrNativeSize;

  const innerQr = qrSvgString
    .replace(/<\?xml[^?]*\?>\s*/g, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>/, '');

  // 2. Escape text for XML
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');

  const truncName = participantName.length > 35
    ? participantName.slice(0, 35) + '...'
    : participantName;

  // 3. Calculate vertical positions
  let y = 30; // Event name
  const eventNameY = y;
  y = 50; // QR starts
  const qrY = y;
  y = qrY + QR_SIZE + 25; // BIB
  const bibY = y;
  y += 25; // Stall or name
  const stallY = stallCode ? y : 0;
  if (stallCode) y += 22;
  const nameY = y;
  y += 25; // Divider
  const dividerY = y;
  y += 18; // JKKN
  const jkknY = y;
  y += 18; // Tagline
  const taglineY = y;

  // 4. Build complete SVG document
  // Using generic font families that librsvg resolves to available system fonts
  const stallLine = stallCode
    ? `<text x="${W / 2}" y="${stallY}" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="#e94560">${esc('Stall: ' + stallCode)}</text>`
    : '';

  const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- White background -->
  <rect width="${W}" height="${H}" fill="white"/>

  <!-- Event name -->
  <text x="${W / 2}" y="${eventNameY}" text-anchor="middle"
    font-family="sans-serif" font-size="14" font-weight="bold" fill="#111827">
    ${esc(eventName)}
  </text>

  <!-- QR Code (scaled from ${qrNativeSize}x${qrNativeSize} to ${QR_SIZE}x${QR_SIZE}) -->
  <g transform="translate(${QR_X}, ${qrY}) scale(${qrScale})">
    ${innerQr}
  </g>

  <!-- BIB Number -->
  <text x="${W / 2}" y="${bibY}" text-anchor="middle"
    font-family="monospace" font-size="24" font-weight="bold" fill="#111827">
    BIB: ${esc(bibNumber)}
  </text>

  <!-- Stall (optional) -->
  ${stallLine}

  <!-- Participant name -->
  <text x="${W / 2}" y="${nameY}" text-anchor="middle"
    font-family="sans-serif" font-size="13" fill="#374151">
    ${esc(truncName)}
  </text>

  <!-- Divider -->
  <line x1="50" y1="${dividerY}" x2="${W - 50}" y2="${dividerY}" stroke="#e5e7eb" stroke-width="2"/>

  <!-- JKKN branding -->
  <text x="${W / 2}" y="${jkknY}" text-anchor="middle"
    font-family="sans-serif" font-size="12" font-weight="bold" fill="#111827">
    JKKN Educational Institutions
  </text>

  <!-- Tagline -->
  <text x="${W / 2}" y="${taglineY}" text-anchor="middle"
    font-family="sans-serif" font-size="11" font-weight="bold" fill="#e94560">
    India&apos;s 1st AI Empowered Marathon
  </text>
</svg>`;

  // 5. Render SVG to PNG
  const image = await sharp(Buffer.from(fullSvg)).png().toBuffer();

  return image;
}
