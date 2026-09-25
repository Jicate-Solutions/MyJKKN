// app/(routes)/meetings/[uid]/_components/meeting-note-text.tsx
//
// A meeting's AI summary arrives as Markdown ("- **Decision:** …"). Printed as
// plain text the reader saw the asterisks and dashes (Director, 24 Sep 2026,
// screenshot: "How can I read this"). This renders it as headings, bold and
// bullets. react-markdown does not render raw HTML by default, so a summary
// cannot inject markup into the page.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MeetingNoteText({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <div className={`space-y-2 leading-relaxed ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (p) => <p>{p.children}</p>,
          ul: (p) => <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground">{p.children}</ul>,
          ol: (p) => <ol className="ml-4 list-decimal space-y-1.5">{p.children}</ol>,
          li: (p) => <li className="pl-1">{p.children}</li>,
          strong: (p) => <strong className="font-semibold text-foreground">{p.children}</strong>,
          h1: (p) => <p className="font-semibold text-foreground">{p.children}</p>,
          h2: (p) => <p className="font-semibold text-foreground">{p.children}</p>,
          h3: (p) => <p className="font-semibold text-foreground">{p.children}</p>,
          a: (p) => (
            <a href={p.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
              {p.children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
