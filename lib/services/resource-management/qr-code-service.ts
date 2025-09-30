// lib/services/resource-management/qr-code-service.ts
import QRCode from 'qrcode';

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
}

export const qrCodeService = new QRCodeService();
