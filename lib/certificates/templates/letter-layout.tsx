// lib/certificates/templates/letter-layout.tsx
// ============================================================================
// Shared A4 "letterhead letter" layout for service-request certificates.
//
// Every number here is lifted from docs/Course Complete Cert (1).docx
// (word/document.xml) so the PDF matches the Word original the office prints
// on pre-printed letterhead:
//
//   <w:pgSz w:w="11906" w:h="16838"/>                → A4
//   <w:pgMar w:top="2835" w:right="1440"
//            w:bottom="1440" w:left="1440"/>          → 5 cm top (letterhead
//                                                       space), 1" sides/bottom
//   Times New Roman, <w:sz w:val="24"/>               → 12 pt
//   Date ¶: <w:ind w:left="6480" w:firstLine="720"/>  → starts 5" into the
//           <w:spacing w:line="600" .../>               text block, 2.5× leading
//   Title ¶: centered, bold, underline, 2.5× leading
//   Body ¶: justified, 2 leading tabs (2 × 720 twips) → 1" first-line indent,
//           <w:spacing w:line="480"/>                  → 2× leading
//
// 1 twip = 1/20 pt. "auto" line spacing multiplies Word's single line for
// Times New Roman 12 pt (≈13.8 pt), which is what the lineHeight multipliers
// below reproduce. NO letterhead is drawn — the paper already carries it.
// ============================================================================

import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import PDFDocument from '@react-pdf/pdfkit';
import type { ReactNode } from 'react';
import type { RenderedParagraph } from '../wording';
import { wrapParagraph, type MeasureFn } from '../word-wrap';

// Names and register numbers must never be hyphen-broken across lines.
Font.registerHyphenationCallback((word) => [word]);

const TWIP = 1 / 20;
/** Word single-line height for Times New Roman 12 pt (font line gap 1.15). */
const SINGLE_LINE_PT = 13.8;
const FONT_SIZE = 12;

export const LETTER_GEOMETRY = {
  paddingTop: 2835 * TWIP, // 141.75 pt = 5 cm
  paddingRight: 1440 * TWIP, // 72 pt
  paddingBottom: 1440 * TWIP,
  paddingLeft: 1440 * TWIP,
  dateIndent: (6480 + 720) * TWIP, // 360 pt
  bodyFirstLineIndent: 2 * 720 * TWIP, // 72 pt
  headingLineHeight: (SINGLE_LINE_PT * 2.5) / FONT_SIZE, // 2.875
  bodyLineHeight: (SINGLE_LINE_PT * 2) / FONT_SIZE, // 2.3
  /** A4 width (11906 twips) minus both side margins = 451.3 pt text block. */
  textWidth: (11906 - 1440 - 1440) * TWIP,
} as const;

// ── Measurement with the SAME standard Times fonts react-pdf embeds ─────────
// pdfkit ships the AFM metrics for Times-Roman/Times-Bold, so widths measured
// here are exactly what the renderer draws. One shared document, no pages.
let measureDoc: InstanceType<typeof PDFDocument> | null = null;
const measure: MeasureFn = (text, bold) => {
  if (!measureDoc) measureDoc = new PDFDocument({ autoFirstPage: false });
  measureDoc.font(bold ? 'Times-Bold' : 'Times-Roman');
  return measureDoc.widthOfString(text, { size: FONT_SIZE });
};
const spaceWidth = () => measure(' ', false);

const styles = StyleSheet.create({
  page: {
    paddingTop: LETTER_GEOMETRY.paddingTop,
    paddingRight: LETTER_GEOMETRY.paddingRight,
    paddingBottom: LETTER_GEOMETRY.paddingBottom,
    paddingLeft: LETTER_GEOMETRY.paddingLeft,
    fontFamily: 'Times-Roman',
    fontSize: FONT_SIZE,
    color: '#000000',
  },
  date: {
    marginLeft: LETTER_GEOMETRY.dateIndent,
    lineHeight: LETTER_GEOMETRY.headingLineHeight,
  },
  title: {
    textAlign: 'center',
    fontFamily: 'Times-Bold',
    textDecoration: 'underline',
    lineHeight: LETTER_GEOMETRY.headingLineHeight,
  },
  // Each body line is a flex row of words. Justified lines use
  // `space-between` so ONLY the gaps widen (Word behaviour); the last line of
  // a paragraph keeps natural spacing. Row height = 2× Word single line.
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    height: SINGLE_LINE_PT * 2,
  },
  lineJustified: {
    justifyContent: 'space-between',
  },
  lineLast: {
    justifyContent: 'flex-start',
    columnGap: 0,
  },
  firstLine: {
    paddingLeft: LETTER_GEOMETRY.bodyFirstLineIndent,
  },
  word: {
    flexDirection: 'row',
  },
  bold: {
    fontFamily: 'Times-Bold',
  },
});

export interface LetterDocumentProps {
  /** PDF metadata title (shows in the viewer tab). */
  docTitle: string;
  /** "Date: 27/08/2026" — already formatted. */
  dateLine: string;
  /** Underlined centred heading, e.g. "COURSE COMPLETION CERTIFICATE". */
  heading: string;
  /** Body paragraphs, each a list of runs (bold runs use Times-Bold). */
  paragraphs: RenderedParagraph[];
  /** Optional extra content below the body (not used by current templates). */
  children?: ReactNode;
}

export function LetterParagraph({ runs }: RenderedParagraph) {
  const lines = wrapParagraph(runs, {
    availableWidth: LETTER_GEOMETRY.textWidth,
    firstLineIndent: LETTER_GEOMETRY.bodyFirstLineIndent,
    measure,
    spaceWidth: spaceWidth(),
  });
  const gap = spaceWidth();
  return (
    <View>
      {lines.map((line, li) => (
        <View
          key={li}
          style={[
            styles.line,
            li === 0 ? styles.firstLine : {},
            line.last ? styles.lineLast : styles.lineJustified,
          ]}
        >
          {line.words.map((word, wi) => (
            <View
              key={wi}
              style={[styles.word, line.last && wi < line.words.length - 1 ? { marginRight: gap } : {}]}
            >
              {word.map((seg, si) => (
                <Text key={si} style={seg.bold ? styles.bold : undefined}>
                  {seg.text}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * One A4 page: date (right-indented) → heading → justified paragraphs.
 * Paragraphs use Word's NoSpacing style, so there is no extra space between
 * them — the 2×/2.5× leading alone produces the printed rhythm.
 */
export function LetterDocument({ docTitle, dateLine, heading, paragraphs, children }: LetterDocumentProps) {
  return (
    <Document title={docTitle} author="MyJKKN" creator="MyJKKN Service Requests">
      <Page size="A4" style={styles.page}>
        <Text style={styles.date}>{dateLine}</Text>
        <Text style={styles.title}>{heading}</Text>
        <View>
          {paragraphs.map((p, i) => (
            <LetterParagraph key={i} runs={p.runs} />
          ))}
        </View>
        {children}
      </Page>
    </Document>
  );
}
