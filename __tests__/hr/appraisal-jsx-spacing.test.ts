/**
 * Next's compiler drops the leading space of a multi-line JSX text that holds
 * an HTML entity (such as &rsquo;) when the text follows an expression. The
 * round page showed "6 appraisals haveboth a head's rating" and the rater
 * search showed "1 match isnot shown" (browser run, 2026-09-29).
 *
 * The test runner compiles JSX with a different tool that keeps the space, so
 * a render test would pass either way. This compiles the real files with
 * Next's own compiler and checks the space survives.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadBindings, transform } from 'next/dist/build/swc';

async function compile(rel: string): Promise<string> {
  const file = path.join(process.cwd(), rel);
  const out = await transform(readFileSync(file, 'utf8'), {
    filename: file,
    jsc: {
      parser: { syntax: 'typescript', tsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
  });
  return (out as { code: string }).code;
}

describe('appraisal screens keep the space after a count', () => {
  beforeAll(async () => {
    await loadBindings();
  }, 60_000);

  it('round page: "N appraisals have both a head\'s rating"', async () => {
    const code = await compile('features/hr/appraisal/instrument-check-panel.tsx');
    // Either one string with its leading space, or a separate " " before it.
    expect(code).toMatch(/(" both a head|['"] ['"],\s*"both a head)/);
  });

  it('rater search: "1 match is not shown"', async () => {
    const code = await compile('features/hr/appraisal/second-rater-cell.tsx');
    expect(code).toMatch(/(" not shown: they can read|['"] ['"],\s*"not shown: they can read)/);
  });
});
