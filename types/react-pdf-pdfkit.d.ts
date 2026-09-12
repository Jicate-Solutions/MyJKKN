// Minimal typing for @react-pdf/pdfkit (ships no .d.ts). Only the surface
// lib/certificates uses for measuring text with the standard Times fonts.
declare module '@react-pdf/pdfkit' {
  class PDFDocument {
    constructor(options?: { autoFirstPage?: boolean });
    font(name: string): this;
    widthOfString(text: string, options?: { size?: number }): number;
  }
  export default PDFDocument;
}
