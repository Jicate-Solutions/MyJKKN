// File: lib/onemark/pdf/render.ts
//
// OneMark — HTML → PDF through headless Chromium. Same launcher contract as
// lib/utils/bos/meeting-minutes-html-pdf.ts (serverless: puppeteer-core +
// @sparticuz/chromium; local: the full `puppeteer` package, imported lazily so
// the dev render worker never bundles it). Chromium is used, not a JS PDF
// library, because Tamil needs a real shaping engine (HarfBuzz) — vowel signs
// reorder around consonants and a naive glyph-per-codepoint renderer prints
// them in storage order, which reads as gibberish to a Tamil reader.

import puppeteerCore, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { pdfFontFaceCss } from '@/lib/utils/bos/pdf-fonts';
import { answerKeyHtml, footerTemplate, questionPaperHtml } from './document';
import { arrangeForSeries } from './layout';
import { paperGlyphGaps } from './notation';
import type { ArrangedPaper, PaperModel, PaperSeries } from './types';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser) {
    try {
      await browser.version();
      return browser;
    } catch (err) {
      console.warn('[onemark-pdf] browser connection lost, relaunching:', err);
      browser = null;
    }
  }
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    browser = await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 1024 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    const puppeteer = (await import('puppeteer')).default;
    browser = (await puppeteer.launch({
      headless: true,
      args:
        process.platform !== 'win32'
          ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
          : [],
    })) as unknown as Browser;
  }
  return browser;
}

async function htmlToPdf(html: string, footer: string): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    // Everything is inline (fonts as data: URIs), so 'load' is the whole wait.
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    // Print only after every embedded face has decoded — otherwise the sheet
    // is laid out against fallback metrics and Tamil may print as boxes.
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '12mm', right: '12mm', bottom: '16mm', left: '12mm' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footer,
    });
    return Buffer.from(pdf);
  } finally {
    try {
      await page.close();
    } catch (closeErr) {
      console.warn('[onemark-pdf] warning closing page:', closeErr);
    }
  }
}

/** The print footer runs in its own document, so the faces are embedded again
 *  there — a template cannot see the page's @font-face registry. */
function footerWithFonts(paper: ArrangedPaper): string {
  return `<style>${pdfFontFaceCss()}</style>${footerTemplate(paper)}`;
}

export interface RenderedPaper {
  buffer: Buffer;
  filename: string;
}

function filenameFor(model: PaperModel, series: PaperSeries, key: boolean): string {
  const short = model.assessmentId.replace(/-/g, '').slice(0, 8);
  const subject = model.subject === 'generic' ? 'paper' : model.subject;
  return `onemark-${subject}-${short}-series-${series}${key ? '-answer-key' : ''}.pdf`;
}

/** A character no embedded face can set would print as a box on Vercel while
 *  looking right on a developer Mac. notation.ts prints the visible marker
 *  "[?]" in its place instead (MISSING_GLYPH_HTML), so the paper still prints;
 *  this names the item and the glyph in the server log — ids and code points
 *  only, never item text — so the wording can be fixed. Until 2026-09-12 this
 *  refused the whole paper (route 422), which took down the answer key of a
 *  live Physics paper over one ᵣ in an explanation. */
function logUncoverable(model: PaperModel, doc: 'paper' | 'answer-key'): void {
  const gaps = paperGlyphGaps(model);
  if (!gaps.length) return;
  console.warn(
    `[onemark-pdf] ${doc} ${model.assessmentId}: printed "[?]" for characters no embedded font carries — ${gaps
      .map((g) => `${g.itemId}: ${g.glyphs.join(' ')}`)
      .join('; ')}`,
  );
}

export async function renderQuestionPaperPdf(model: PaperModel, series: PaperSeries): Promise<RenderedPaper> {
  logUncoverable(model, 'paper');
  const paper = arrangeForSeries(model, series);
  const buffer = await htmlToPdf(questionPaperHtml(paper), footerWithFonts(paper));
  return { buffer, filename: filenameFor(model, series, false) };
}

export async function renderAnswerKeyPdf(model: PaperModel, series: PaperSeries): Promise<RenderedPaper> {
  logUncoverable(model, 'answer-key');
  const paper = arrangeForSeries(model, series);
  const buffer = await htmlToPdf(answerKeyHtml(paper), footerWithFonts(paper));
  return { buffer, filename: filenameFor(model, series, true) };
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close();
    } finally {
      browser = null;
    }
  }
}
