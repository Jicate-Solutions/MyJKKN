// lib/pdf/syllabus-pdf.ts
//
// HTML → PDF for a course syllabus. Same launcher contract as
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

/**
 * Render one syllabus HTML document to an A4 PDF.
 * Throws SyllabusRendererUnavailableError when Chromium cannot be launched so
 * API callers can map it to 503 instead of a generic 500.
 */
export async function renderSyllabusPdf(html: string): Promise<Buffer> {
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
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
