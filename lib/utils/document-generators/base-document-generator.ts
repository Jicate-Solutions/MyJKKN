/**
 * Document Generation Engine — Base Document Generator
 * Abstract class providing shared PDF drawing utilities.
 * All 15 document generators extend this class.
 *
 * Uses jsPDF directly (no html2canvas) matching existing patterns:
 * - certificate-pdf.ts (landscape certificates with QR)
 * - consolidation-report-pdf.ts (multi-page reports with autotable)
 */

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { DocumentBranding, DocumentMetadata, PageOrientation, PageSize } from '@/types/documents';
import { DEFAULT_COLORS, type RGBColor, generateQRDataUrl, formatDateIndian } from './brand-utils';

// Augment jsPDF with autoTable from jspdf-autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: Record<string, unknown>) => void;
    lastAutoTable: { finalY: number };
  }
}

export interface GeneratorOptions {
  orientation: PageOrientation;
  pageSize: PageSize;
  margin?: number;
}

export abstract class BaseDocumentGenerator {
  protected doc: jsPDF;
  protected branding: DocumentBranding;
  protected metadata: DocumentMetadata;
  protected pageWidth: number;
  protected pageHeight: number;
  protected margin: number;
  protected contentWidth: number;
  protected yPosition: number;

  constructor(branding: DocumentBranding, metadata: DocumentMetadata, options: GeneratorOptions) {
    this.branding = branding;
    this.metadata = metadata;
    this.margin = options.margin ?? 14;

    this.doc = new jsPDF({
      orientation: options.orientation,
      unit: 'mm',
      format: options.pageSize,
    });

    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - this.margin * 2;
    this.yPosition = this.margin;
  }

  /** Abstract method — each generator implements its own layout */
  abstract generate(data: Record<string, unknown>): Promise<jsPDF>;

  /** Generate and return as Uint8Array (for download/storage) */
  async generateAndReturn(data: Record<string, unknown>): Promise<Uint8Array> {
    const doc = await this.generate(data);
    return doc.output('arraybuffer') as unknown as Uint8Array;
  }

  /** Generate and trigger browser download */
  async generateAndDownload(data: Record<string, unknown>, filename: string): Promise<void> {
    const doc = await this.generate(data);
    doc.save(filename);
  }

  // ── Shared Drawing Methods ─────────────────────────────────────

  /** Fill entire page with background color */
  protected drawBackground(): void {
    const bg = this.branding.backgroundColor ?? DEFAULT_COLORS.background;
    this.doc.setFillColor(bg.r, bg.g, bg.b);
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight, 'F');
  }

  /** Draw double border around page (certificate style) */
  protected drawBorder(outerOffset = 5, innerOffset = 8, lineWidth = 0.8): void {
    const color = this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    this.doc.setDrawColor(color.r, color.g, color.b);
    this.doc.setLineWidth(lineWidth);
    // Outer border
    this.doc.rect(outerOffset, outerOffset, this.pageWidth - outerOffset * 2, this.pageHeight - outerOffset * 2);
    // Inner border
    this.doc.rect(innerOffset, innerOffset, this.pageWidth - innerOffset * 2, this.pageHeight - innerOffset * 2);
  }

  /** Draw corner accents (decorative squares in secondary color) */
  protected drawCornerAccents(offset = 5, size = 6): void {
    const color = this.branding.secondaryColor ?? DEFAULT_COLORS.secondary;
    this.doc.setFillColor(color.r, color.g, color.b);
    // Top-left
    this.doc.rect(offset, offset, size, size, 'F');
    // Top-right
    this.doc.rect(this.pageWidth - offset - size, offset, size, size, 'F');
    // Bottom-left
    this.doc.rect(offset, this.pageHeight - offset - size, size, size, 'F');
    // Bottom-right
    this.doc.rect(this.pageWidth - offset - size, this.pageHeight - offset - size, size, size, 'F');
  }

  /** Draw institution header with logo, name, and optional tagline */
  protected drawInstitutionHeader(startY?: number): number {
    let y = startY ?? this.margin + 5;
    const centerX = this.pageWidth / 2;

    // Logo (if available)
    if (this.branding.logoDataUrl) {
      try {
        this.doc.addImage(this.branding.logoDataUrl, 'PNG', centerX - 10, y, 20, 20);
        y += 22;
      } catch {
        y += 2; // Skip if image fails
      }
    }

    // Institution name
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    this.doc.setTextColor(primary.r, primary.g, primary.b);
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.branding.institutionName || 'Institution', centerX, y, { align: 'center' });
    y += 6;

    // Header text (e.g., "Affiliated to Anna University")
    if (this.branding.headerText) {
      this.doc.setFontSize(9);
      this.doc.setFont('helvetica', 'normal');
      const muted = DEFAULT_COLORS.mutedText;
      this.doc.setTextColor(muted.r, muted.g, muted.b);
      this.doc.text(this.branding.headerText, centerX, y, { align: 'center' });
      y += 4;
    }

    // Address
    const address = [this.branding.institutionCity, this.branding.institutionState, this.branding.institutionPinCode]
      .filter(Boolean)
      .join(', ');
    if (address) {
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      const muted = DEFAULT_COLORS.mutedText;
      this.doc.setTextColor(muted.r, muted.g, muted.b);
      this.doc.text(address, centerX, y, { align: 'center' });
      y += 4;
    }

    // Separator line
    y += 2;
    this.drawSeparator(y);
    y += 4;

    this.yPosition = y;
    return y;
  }

  /** Draw a letterhead-style header (for letters — left-aligned with logo on left) */
  protected drawLetterhead(startY?: number): number {
    let y = startY ?? this.margin;
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    let textX = this.margin;

    // Logo on left
    if (this.branding.logoDataUrl) {
      try {
        this.doc.addImage(this.branding.logoDataUrl, 'PNG', this.margin, y, 18, 18);
        textX = this.margin + 22;
      } catch {
        // Skip logo
      }
    }

    // Institution name
    this.doc.setTextColor(primary.r, primary.g, primary.b);
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.branding.institutionName || 'Institution', textX, y + 6);

    // Header text
    if (this.branding.headerText) {
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      const muted = DEFAULT_COLORS.mutedText;
      this.doc.setTextColor(muted.r, muted.g, muted.b);
      this.doc.text(this.branding.headerText, textX, y + 11);
    }

    // Address line
    const addressParts = [
      this.branding.institutionAddress,
      this.branding.institutionCity,
      this.branding.institutionState,
      this.branding.institutionPinCode,
    ].filter(Boolean);
    if (addressParts.length > 0) {
      this.doc.setFontSize(7);
      const muted = DEFAULT_COLORS.mutedText;
      this.doc.setTextColor(muted.r, muted.g, muted.b);
      this.doc.text(addressParts.join(', '), textX, y + 15);
    }

    y += 20;
    this.drawSeparator(y, 0.5);
    y += 6;

    this.yPosition = y;
    return y;
  }

  /** Draw horizontal separator line */
  protected drawSeparator(y?: number, lineWidth = 0.3, color?: RGBColor): void {
    const c = color ?? this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    const drawY = y ?? this.yPosition;
    this.doc.setDrawColor(c.r, c.g, c.b);
    this.doc.setLineWidth(lineWidth);
    this.doc.line(this.margin, drawY, this.pageWidth - this.margin, drawY);
  }

  /** Draw a yellow accent separator (certificate style) */
  protected drawAccentSeparator(y?: number): void {
    const secondary = this.branding.secondaryColor ?? DEFAULT_COLORS.secondary;
    this.drawSeparator(y, 1.2, secondary);
  }

  /** Draw a key-value pair row (e.g., "Roll Number: 22CS001") */
  protected drawKeyValueRow(label: string, value: string, y?: number, labelWidth = 50): number {
    const drawY = y ?? this.yPosition;
    const dark = DEFAULT_COLORS.darkText;
    const muted = DEFAULT_COLORS.mutedText;

    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(muted.r, muted.g, muted.b);
    this.doc.text(label, this.margin, drawY);

    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(dark.r, dark.g, dark.b);
    this.doc.text(String(value || 'N/A'), this.margin + labelWidth, drawY);

    this.yPosition = drawY + 5;
    return this.yPosition;
  }

  /** Draw two key-value pairs side by side */
  protected drawKeyValuePair(
    label1: string, value1: string,
    label2: string, value2: string,
    y?: number
  ): number {
    const drawY = y ?? this.yPosition;
    const halfWidth = this.contentWidth / 2;
    const dark = DEFAULT_COLORS.darkText;
    const muted = DEFAULT_COLORS.mutedText;

    this.doc.setFontSize(9);

    // Left pair
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(muted.r, muted.g, muted.b);
    this.doc.text(label1, this.margin, drawY);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(dark.r, dark.g, dark.b);
    this.doc.text(String(value1 || 'N/A'), this.margin + 40, drawY);

    // Right pair
    const rightX = this.margin + halfWidth;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(muted.r, muted.g, muted.b);
    this.doc.text(label2, rightX, drawY);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(dark.r, dark.g, dark.b);
    this.doc.text(String(value2 || 'N/A'), rightX + 40, drawY);

    this.yPosition = drawY + 5;
    return this.yPosition;
  }

  /** Draw signature block at bottom of page */
  protected drawSignatureBlock(y?: number): number {
    const signatures = this.branding.signatures;
    if (!signatures || signatures.length === 0) return this.yPosition;

    const drawY = y ?? this.pageHeight - 35;
    const dark = DEFAULT_COLORS.darkText;
    const muted = DEFAULT_COLORS.mutedText;

    const positions: Record<string, number> = {
      left: this.margin + 20,
      center: this.pageWidth / 2,
      right: this.pageWidth - this.margin - 20,
    };

    for (const sig of signatures) {
      const x = positions[sig.position] ?? positions.center;

      // Signature image (if available)
      if (sig.signatureDataUrl) {
        try {
          this.doc.addImage(sig.signatureDataUrl, 'PNG', x - 15, drawY - 12, 30, 10);
        } catch {
          // Skip image
        }
      }

      // Signature line
      this.doc.setDrawColor(dark.r, dark.g, dark.b);
      this.doc.setLineWidth(0.3);
      this.doc.line(x - 20, drawY, x + 20, drawY);

      // Name
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setTextColor(dark.r, dark.g, dark.b);
      this.doc.text(sig.name, x, drawY + 4, { align: 'center' });

      // Role
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(muted.r, muted.g, muted.b);
      this.doc.text(sig.role, x, drawY + 8, { align: 'center' });
    }

    return drawY + 12;
  }

  /** Draw QR code at specified position */
  protected async drawQRCode(text: string, x: number, y: number, size = 25): Promise<void> {
    if (!text) return;
    const qrDataUrl = await generateQRDataUrl(text);
    if (qrDataUrl) {
      try {
        this.doc.addImage(qrDataUrl, 'PNG', x, y, size, size);
      } catch {
        // Skip QR if rendering fails
      }
    }
  }

  /** Draw watermark text diagonally across page */
  protected drawWatermark(): void {
    const text = this.branding.watermarkText;
    if (!text) return;
    const opacity = this.branding.watermarkOpacity ?? 0.05;

    this.doc.saveGraphicsState();
    // @ts-expect-error — jsPDF GState API
    this.doc.setGState(new this.doc.GState({ opacity }));
    this.doc.setFontSize(60);
    this.doc.setFont('helvetica', 'bold');
    const muted = DEFAULT_COLORS.mutedText;
    this.doc.setTextColor(muted.r, muted.g, muted.b);

    // Rotate and draw diagonally
    const centerX = this.pageWidth / 2;
    const centerY = this.pageHeight / 2;
    this.doc.text(text, centerX, centerY, {
      align: 'center',
      angle: 45,
    });
    this.doc.restoreGraphicsState();
  }

  /** Draw footer with page number and optional footer text */
  protected drawFooter(pageNumber?: number, totalPages?: number): void {
    const y = this.pageHeight - 8;
    const muted = DEFAULT_COLORS.mutedText;
    this.doc.setFontSize(7);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(muted.r, muted.g, muted.b);

    // Footer text (left)
    if (this.branding.footerText) {
      this.doc.text(this.branding.footerText, this.margin, y);
    }

    // Document number (center)
    if (this.metadata.documentNumber) {
      this.doc.text(`Ref: ${this.metadata.documentNumber}`, this.pageWidth / 2, y, { align: 'center' });
    }

    // Page number (right)
    if (pageNumber !== undefined && totalPages !== undefined) {
      this.doc.text(`Page ${pageNumber} of ${totalPages}`, this.pageWidth - this.margin, y, { align: 'right' });
    }

    // Date (below center)
    this.doc.text(`Generated: ${formatDateIndian(this.metadata.generatedAt)}`, this.pageWidth / 2, y + 3, { align: 'center' });
  }

  /** Check if content will overflow and add new page if needed */
  protected addNewPageIfNeeded(requiredSpace: number): boolean {
    if (this.yPosition + requiredSpace > this.pageHeight - 40) {
      this.doc.addPage();
      this.drawBackground();
      this.yPosition = this.margin;
      return true;
    }
    return false;
  }

  /** Set text styling shorthand */
  protected setTextStyle(size: number, weight: 'normal' | 'bold' | 'italic' = 'normal', color?: RGBColor): void {
    this.doc.setFontSize(size);
    this.doc.setFont('helvetica', weight);
    const c = color ?? DEFAULT_COLORS.darkText;
    this.doc.setTextColor(c.r, c.g, c.b);
  }

  /** Draw centered title text */
  protected drawTitle(text: string, y?: number, fontSize = 18): number {
    const drawY = y ?? this.yPosition;
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    this.doc.setFontSize(fontSize);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(primary.r, primary.g, primary.b);
    this.doc.text(text, this.pageWidth / 2, drawY, { align: 'center' });
    this.yPosition = drawY + fontSize * 0.5 + 2;
    return this.yPosition;
  }

  /** Draw a student info box (name, roll number, program etc.) */
  protected drawStudentInfoBox(data: Record<string, unknown>, y?: number): number {
    let drawY = y ?? this.yPosition;

    drawY = this.drawKeyValuePair(
      'Name:', String(data.full_name || 'N/A'),
      'Roll No:', String(data.roll_number || 'N/A'),
      drawY
    );
    drawY = this.drawKeyValuePair(
      'Program:', String(data.program_name || 'N/A'),
      'Semester:', String(data.semester_name || 'N/A'),
      drawY
    );
    drawY = this.drawKeyValuePair(
      'Department:', String(data.department_name || 'N/A'),
      'Section:', String(data.section_name || 'N/A'),
      drawY
    );
    drawY = this.drawKeyValuePair(
      'Reg. No:', String(data.register_number || 'N/A'),
      'Academic Year:', String(data.academic_year_name || 'N/A'),
      drawY
    );

    this.yPosition = drawY + 2;
    return this.yPosition;
  }
}
