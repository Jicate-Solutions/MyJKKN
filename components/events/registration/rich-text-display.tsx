// components/events/registration/rich-text-display.tsx
//
// Read-only renderer for a 'rich_text' registration field: the text an
// organizer wrote in the form builder, shown to every registrant.
//
// The stored value is the editor's JSON document, and this walks it into React
// elements. Deliberately NOT dangerouslySetInnerHTML: the page is public and
// unauthenticated, and building elements by hand means only the handful of node
// and mark types below can ever reach the DOM — an unknown node renders as its
// plain text, an unknown mark is ignored, and a colour that is not a plain
// hex/rgb value is dropped. There is no HTML string to sanitise.
//
// No 'use client' and no hooks, so it renders on the server too.

import type { ReactNode } from 'react';
import type { RichTextDoc, RichTextNode } from '@/types/tournament';

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;

function renderText(node: RichTextNode, key: number): ReactNode {
  let out: ReactNode = node.text ?? '';
  let color: string | undefined;
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'textStyle') {
      const value = mark.attrs?.color;
      if (typeof value === 'string' && SAFE_COLOR.test(value.trim())) color = value.trim();
    }
  }
  return (
    <span key={key} style={color ? { color } : undefined}>
      {out}
    </span>
  );
}

function renderInline(nodes: RichTextNode[] | undefined): ReactNode[] {
  return (nodes ?? []).map((node, i) => {
    if (node.type === 'text') return renderText(node, i);
    if (node.type === 'hardBreak') return <br key={i} />;
    // Anything else the editor is not configured to produce: keep its text.
    return <span key={i}>{renderInline(node.content)}</span>;
  });
}

/** True when the document has at least one character of text. */
export function richTextHasContent(doc: RichTextDoc | null | undefined): boolean {
  const walk = (nodes: RichTextNode[] | undefined): boolean =>
    (nodes ?? []).some((n) => (n.type === 'text' && !!n.text?.trim()) || walk(n.content));
  return walk(doc?.content);
}

export function RichTextDisplay({
  doc,
  className,
}: {
  doc: RichTextDoc | null | undefined;
  className?: string;
}) {
  if (!richTextHasContent(doc)) return null;
  return (
    <div className={className ?? 'space-y-2 text-sm leading-relaxed'}>
      {(doc?.content ?? []).map((block, i) => (
        // An empty paragraph is a blank line the organizer typed on purpose.
        <p key={i} className="min-h-[1.25rem] whitespace-pre-wrap break-words">
          {renderInline(block.content)}
        </p>
      ))}
    </div>
  );
}
