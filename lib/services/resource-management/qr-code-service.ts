// lib/services/resource-management/qr-code-service.ts
import QRCode from 'qrcode';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Resource } from '@/types/resource-management';

export interface QRCodeData {
  resourceId: string;
  resourceName: string;
  resourceCode?: string;
  type: 'resource' | 'maintenance' | 'reservation';
  timestamp: string;
}

class QRCodeService {
  /**
   * Generate QR code as data URL
   */
  async generateQRCode(data: QRCodeData): Promise<string> {
    const payload = JSON.stringify(data);

    try {
      const qrDataUrl = await QRCode.toDataURL(payload, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });

      return qrDataUrl;
    } catch (error) {
      console.error('QR Code generation error:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate QR code for resource
   */
  async generateResourceQRCode(
    resourceId: string,
    resourceName: string,
    resourceCode?: string
  ): Promise<string> {
    const data: QRCodeData = {
      resourceId,
      resourceName,
      resourceCode,
      type: 'resource',
      timestamp: new Date().toISOString()
    };

    return this.generateQRCode(data);
  }

  /**
   * Generate QR code as SVG
   */
  async generateQRCodeSVG(data: QRCodeData): Promise<string> {
    const payload = JSON.stringify(data);

    try {
      const qrSvg = await QRCode.toString(payload, {
        type: 'svg',
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M'
      });

      return qrSvg;
    } catch (error) {
      console.error('QR Code SVG generation error:', error);
      throw new Error('Failed to generate QR code SVG');
    }
  }

  /**
   * Parse QR code data
   */
  parseQRCodeData(rawData: string): QRCodeData | null {
    try {
      const parsed = JSON.parse(rawData);

      if (
        parsed &&
        typeof parsed === 'object' &&
        'resourceId' in parsed &&
        'type' in parsed
      ) {
        return parsed as QRCodeData;
      }

      return null;
    } catch (error) {
      console.error('QR Code parsing error:', error);
      return null;
    }
  }

  /**
   * Generate QR code download link
   */
  async downloadQRCode(
    data: QRCodeData,
    filename: string = 'qrcode.png'
  ): Promise<void> {
    const qrDataUrl = await this.generateQRCode(data);

    // Create download link
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Generate printable QR code
   */
  async generatePrintableQRCode(
    resourceId: string,
    resourceName: string,
    resourceCode?: string
  ): Promise<string> {
    const qrCode = await this.generateResourceQRCode(
      resourceId,
      resourceName,
      resourceCode
    );

    // Create HTML for printing
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code - ${resourceName}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
            }
            .qr-container {
              text-align: center;
              padding: 30px;
              border: 2px solid #000;
              border-radius: 8px;
              background: white;
            }
            .qr-code {
              margin: 20px 0;
            }
            h1 {
              margin: 0 0 10px 0;
              font-size: 24px;
            }
            .code {
              color: #666;
              font-size: 14px;
              margin-bottom: 20px;
            }
            @media print {
              body {
                background: white;
              }
            }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <h1>${resourceName}</h1>
            ${
              resourceCode
                ? `<div class="code">Code: ${resourceCode}</div>`
                : ''
            }
            <div class="qr-code">
              <img src="${qrCode}" alt="QR Code" />
            </div>
            <p>Scan to view resource details</p>
          </div>
        </body>
      </html>
    `;

    return html;
  }

  /**
   * Print QR code
   */
  async printQRCode(
    resourceId: string,
    resourceName: string,
    resourceCode?: string
  ): Promise<void> {
    const html = await this.generatePrintableQRCode(
      resourceId,
      resourceName,
      resourceCode
    );

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();

      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  }

  // ===== Wave 1.5 PR-2: qr_code_token-based methods =====

  /**
   * Generate (or retrieve) the opaque qr_code_token for a resource.
   *
   * If the resource already has qr_code_token set (auto-populated by the
   * tg_resources_set_qr_token DB trigger on INSERT per Wave 1.5 PR-1), this
   * returns the existing token. Otherwise it generates one in JS using crypto
   * randomness, writes it back to the row, and returns it.
   *
   * Token format: 'res_' + 16 lowercase hex chars (matches DB trigger format).
   *
   * Throws on missing resource or Supabase error.
   */
  async generateQrTokenForResource(resourceId: string): Promise<string> {
    const supabase = createClientSupabaseClient();
    const { data: existing, error: readErr } = await (supabase as any)
      .from('resources')
      .select('id, qr_code_token')
      .eq('id', resourceId)
      .single();

    if (readErr) {
      console.error('qr-code-service: failed to read resource', readErr);
      throw new Error(readErr.message || 'Failed to read resource for QR token');
    }
    if (!existing) throw new Error('Resource not found');

    if (existing.qr_code_token) return existing.qr_code_token as string;

    // Generate token client-side (browser crypto.getRandomValues — present in jsdom + node 19+).
    const bytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      // Fallback for SSR contexts without webcrypto (rare).
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const token = `res_${hex}`;

    const { error: updateErr } = await (supabase as any)
      .from('resources')
      .update({ qr_code_token: token, updated_at: new Date().toISOString() })
      .eq('id', resourceId);

    if (updateErr) {
      console.error('qr-code-service: failed to write token', updateErr);
      throw new Error(updateErr.message || 'Failed to persist QR token');
    }

    return token;
  }

  /**
   * Look up a resource by its qr_code_token.
   *
   * Returns the full Resource row joined with parent_category / subcategory /
   * institution for the scan detail card. Returns null when no row matches
   * (rather than throwing) so the scan UI can show "no match" gracefully.
   */
  async lookupResourceByQrToken(token: string): Promise<Resource | null> {
    if (!token || typeof token !== 'string') return null;
    const trimmed = token.trim();
    if (!trimmed) return null;

    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('resources')
      .select(
        `
          *,
          parent_category:resource_parent_categories(id, name, image_url),
          subcategory:resource_sub_categories(id, name, image_url),
          institution:institutions(id, name)
        `
      )
      .eq('qr_code_token', trimmed)
      .maybeSingle();

    if (error) {
      console.error('qr-code-service: lookup error', error);
      return null;
    }
    return (data as unknown as Resource) || null;
  }

  /**
   * Render the qr_code_token as a PNG data URL suitable for embedding in a
   * label sheet or sending to a thermal printer.
   *
   * The encoded payload is just the token string (no JSON wrapper) so that a
   * generic QR reader on a phone produces something pasteable into the manual
   * scan input as a fallback.
   */
  async renderQrPngDataUrlForToken(token: string): Promise<string> {
    if (!token) throw new Error('Token required');
    try {
      const dataUrl = await QRCode.toDataURL(token, {
        width: 240,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      });
      return dataUrl;
    } catch (error) {
      console.error('qr-code-service: PNG render error', error);
      throw new Error('Failed to render QR PNG');
    }
  }
}

export const qrCodeService = new QRCodeService();
