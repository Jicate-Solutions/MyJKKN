/**
 * PDF Export Utility
 * Handles client-side PDF generation from HTML using html2pdf.js
 */

interface PdfOptions {
  filename?: string;
  format?: 'a4' | 'letter';
  margin?: number;
  scale?: number;
  pageBreak?: 'avoid' | 'always' | 'auto';
}

/**
 * Convert HTML to PDF and download
 * Requires html2pdf library to be installed: npm install html2pdf.js
 */
export async function exportHtmlToPdf(
  htmlContent: string,
  filename: string = 'syllabus.pdf',
  options: PdfOptions = {}
): Promise<void> {
  try {
    // Dynamically import html2pdf to avoid bundle bloat
    const html2pdf = (await import('html2pdf.js')).default;

    if (!html2pdf) {
      throw new Error('html2pdf library not available. Please install: npm install html2pdf.js');
    }

    // Create a temporary container
    const element = document.createElement('div');
    element.innerHTML = htmlContent;
    element.style.padding = '20px';
    element.style.backgroundColor = '#ffffff';

    const config = {
      margin: options.margin ?? 10,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: options.scale ?? 2 },
      jsPDF: {
        orientation: 'portrait' as const,
        unit: 'mm',
        format: options.format ?? 'a4'
      },
      pagebreak: { mode: [options.pageBreak ?? 'avoid'] }
    };

    await html2pdf().set(config).from(element).save();

  } catch (error) {
    console.error('PDF export failed:', error);
    throw error;
  }
}

/**
 * Open HTML in new window for printing to PDF
 * Fallback method if html2pdf not available
 */
export function printHtmlToPdf(
  htmlContent: string,
  title: string = 'Document'
): void {
  const newWindow = window.open('', '_blank');
  if (!newWindow) {
    throw new Error('Failed to open print window. Check popup blocker settings.');
  }

  // Write HTML with print-friendly styling
  const styledHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          background: white;
          padding: 20mm;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
          a {
            color: inherit;
            text-decoration: none;
          }
        }
        h1, h2, h3 { color: #2c3e50; margin-top: 20px; margin-bottom: 10px; }
        h1 { border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
        }
        th, td {
          border: 1px solid #bdc3c7;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #ecf0f1;
          font-weight: bold;
        }
        .page-break {
          page-break-after: always;
        }
        .metadata {
          background-color: #f8f9fa;
          padding: 10px;
          border-radius: 5px;
          margin: 10px 0;
          font-size: 0.9em;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
      <script>
        window.addEventListener('load', function() {
          // Auto-open print dialog
          window.print();
          // Close window after printing (user can cancel)
          setTimeout(() => {
            window.close();
          }, 500);
        });
      </script>
    </body>
    </html>
  `;

  newWindow.document.write(styledHtml);
  newWindow.document.close();
}

/**
 * Download file from data URL
 */
export function downloadFile(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
