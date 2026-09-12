// lib/pdf/syllabus-pdf.ts
//
// HTML → PDF for a course document. Same launcher contract as
// lib/pdf/bos-meeting-notice.ts and lib/utils/bos/meeting-minutes-html-pdf.ts:
// puppeteer-core + @sparticuz/chromium on Vercel/Lambda, a LAZY import of the
// full `puppeteer` package locally. Never static-import `puppeteer` here — it
// crashes the Next dev render worker and has no Chrome binary on Vercel.

import puppeteerCore, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export class SyllabusRendererUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Learning pathway PDF renderer unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'SyllabusRendererUnavailableError';
  }
}

export interface RenderSyllabusPdfOptions {
  /** Left-hand running footer, e.g. "CEC352 · Satellite Communication · JKKN CET". Page numbers are added on the right. */
  footerText?: string;
}

async function launchBrowser(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 1024 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const puppeteer = (await import('puppeteer')).default;
  return puppeteer.launch({
    headless: true,
    args:
      process.platform !== 'win32'
        ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        : [],
  }) as unknown as Promise<Browser>;
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Render one document to an A4 PDF with a running footer (text left, "Page x
 * of y" right). Page margins come from the document's own @page rule when it
 * declares one (preferCSSPageSize), else the defaults below.
 * Throws SyllabusRendererUnavailableError when Chromium cannot be launched so
 * API callers can map it to 503 instead of a generic 500.
 */
export async function renderSyllabusPdf(html: string, opts: RenderSyllabusPdfOptions = {}): Promise<Buffer> {
  let browser: Browser;
  try {
    browser = await launchBrowser();
  } catch (err) {
    console.error('[syllabus-pdf] Browser launch failed:', err);
    throw new SyllabusRendererUnavailableError(err);
  }
  try {
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      const footer = `<div style="width:100%;font-family:'Times New Roman',Times,serif;font-size:8pt;color:#444;padding:0 14mm;display:flex;justify-content:space-between;">
  <span>${escHtml(opts.footerText ?? '')}</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: footer,
        margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
