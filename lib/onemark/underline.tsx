// lib/onemark/underline.tsx
//
// OneMark stems mark the target word of an English synonym / antonym item as
// inline `<u>word</u>` (PRD English §5.2; the PDF reads the same contract in
// lib/onemark/pdf/notation.ts). Every screen that shows a stem goes through
// this helper so the learner sees an underline, never the literal tags.
//
// `<u>` is the ONLY markup trusted here. Nothing is ever parsed as HTML (no
// innerHTML): any other tag in the text stays visible as plain characters.

import type { ReactNode } from 'react';

/** Same split the PDF uses (notation.ts), so screen and print agree. */
const UNDERLINE_SPLIT = /(<u>[\s\S]*?<\/u>)/i;
const UNDERLINE_ONE = /^<u>([\s\S]*?)<\/u>$/i;

/** True when the text carries at least one `<u>…</u>` span. */
export function hasUnderline(text: string | null | undefined): boolean {
  return !!text && UNDERLINE_SPLIT.test(text);
}

/** The text with each `<u>word</u>` rendered as an underlined word and
 *  everything else as plain text. */
export function renderUnderline(text: string | null | undefined): ReactNode {
  if (!text) return text ?? null;
  if (!hasUnderline(text)) return text;
  return text.split(UNDERLINE_SPLIT).map((part, i) => {
    const m = UNDERLINE_ONE.exec(part);
    if (m) {
      return (
        <u key={i} className="underline underline-offset-2 font-semibold">
          {m[1]}
        </u>
      );
    }
    return part.length > 0 ? <span key={i}>{part}</span> : null;
  });
}
