// File: scripts/onemark/render-paper-samples.ts
//
// OneMark — render the fixture papers to PDF so a human can EYEBALL them
// (CLAUDE.md #25: a PDF that passes every automated check can still print
// Tamil as Latin-1 gibberish; only a screenshot shows it).
//
//   npx tsx scripts/onemark/render-paper-samples.ts <out-dir>
//
// Writes, for Physics and English, series A and B, the question paper and the
// answer key — eight PDFs — plus the raw HTML of each for inspection. No
// database, no credentials: the models come from lib/onemark/pdf/samples.ts.

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SAMPLE_ENGLISH_PAPER, SAMPLE_PHYSICS_PAPER, withoutAnswers } from '@/lib/onemark/pdf/samples';
import { closeBrowser, renderAnswerKeyPdf, renderQuestionPaperPdf } from '@/lib/onemark/pdf/render';
import { answerKeyHtml, questionPaperHtml } from '@/lib/onemark/pdf/document';
import { arrangeForSeries } from '@/lib/onemark/pdf/layout';
import type { PaperSeries } from '@/lib/onemark/pdf/types';

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('usage: tsx scripts/onemark/render-paper-samples.ts <out-dir>');
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const series: PaperSeries[] = ['A', 'B'];
  for (const model of [SAMPLE_PHYSICS_PAPER, SAMPLE_ENGLISH_PAPER]) {
    for (const s of series) {
      const paper = await renderQuestionPaperPdf(withoutAnswers(model), s);
      writeFileSync(join(outDir, paper.filename), paper.buffer);
      writeFileSync(join(outDir, paper.filename.replace(/\.pdf$/, '.html')), questionPaperHtml(arrangeForSeries(withoutAnswers(model), s)));
      const key = await renderAnswerKeyPdf(model, s);
      writeFileSync(join(outDir, key.filename), key.buffer);
      writeFileSync(join(outDir, key.filename.replace(/\.pdf$/, '.html')), answerKeyHtml(arrangeForSeries(model, s)));
      process.stdout.write(`${paper.filename} ${paper.buffer.length}B · ${key.filename} ${key.buffer.length}B\n`);
    }
  }
  await closeBrowser();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
