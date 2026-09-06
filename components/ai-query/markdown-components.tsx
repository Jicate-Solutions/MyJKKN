'use client';

/**
 * Shared ReactMarkdown component map for the AI Assistant.
 *
 * Extracted from MessageBubble so the chat answer and a "report" artifact
 * render through the SAME styled markdown map (headings with icons, analytics
 * tables, status-aware strong/blockquote, terminal-style code blocks). Import
 * this in both places — do not duplicate the map.
 */

import type { Components } from 'react-markdown';
import { BarChart3, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export const markdownComponents: Components = {
  // Enhanced headings with icons
  h1: ({ children }) => (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/50">
      <div className="p-1.5 rounded-lg bg-primary/10">
        <BarChart3 className="h-5 w-5 text-primary" />
      </div>
      <h1 className="text-lg font-bold text-foreground m-0">{children}</h1>
    </div>
  ),
  h2: ({ children }) => (
    <div className="flex items-center gap-2 mt-4 mb-3">
      <div className="w-1 h-5 rounded-full bg-primary" />
      <h2 className="text-base font-semibold text-foreground m-0">{children}</h2>
    </div>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-foreground/90 mt-3 mb-2 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
      {children}
    </h3>
  ),
  // Enhanced table styling - Analytics Dashboard Style (Mobile Scrollable)
  table: ({ children }) => (
    <div className="my-3 sm:my-4 rounded-lg border border-border/60 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm min-w-[400px]">
          {children}
        </table>
      </div>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-gradient-to-r from-muted/80 to-muted/50">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50 whitespace-nowrap">
      {children}
    </th>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border/30">
      {children}
    </tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-muted/30 transition-colors">
      {children}
    </tr>
  ),
  td: ({ children }) => {
    const text = String(children);
    // Style numeric values
    const isNumeric = /^\d+[\d,]*\.?\d*%?$/.test(text.trim());
    const isPercentage = text.includes('%');
    const isHighValue = parseInt(text.replace(/[^\d]/g, '')) > 50;

    return (
      <td className={cn(
        "px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm",
        isNumeric && "font-mono font-semibold",
        isNumeric && isHighValue && "text-primary",
        isPercentage && "text-emerald-600 dark:text-emerald-400"
      )}>
        {isNumeric && !isPercentage ? (
          <span className="inline-flex items-center gap-1">
            {children}
          </span>
        ) : children}
      </td>
    );
  },
  // Enhanced list styling
  ul: ({ children }) => (
    <ul className="space-y-1.5 my-3 ml-1">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="space-y-1.5 my-3 ml-1 list-decimal list-inside">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-sm text-foreground/90">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
      <span className="flex-1">{children}</span>
    </li>
  ),
  // Enhanced code styling - Preview Style
  code: ({ className, children }) => {
    const isInline = !className;
    const text = String(children);

    // Check if it looks like a stat/KPI value
    if (isInline && /^\d+[\d,]*\.?\d*%?$/.test(text.trim())) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono font-bold text-sm">
          {children}
        </span>
      );
    }

    return isInline ? (
      <code className="px-1.5 py-0.5 rounded-md bg-muted border border-border/50 text-xs font-mono text-foreground/90">
        {children}
      </code>
    ) : (
      <div className="my-3 rounded-lg overflow-hidden border border-border/60 shadow-sm">
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/80 border-b border-border/50">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Output</span>
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            <span className="w-2 h-2 rounded-full bg-green-400" />
          </div>
        </div>
        <pre className="p-3 bg-slate-950 overflow-x-auto">
          <code className={cn("text-xs font-mono text-slate-300", className)}>
            {children}
          </code>
        </pre>
      </div>
    );
  },
  // Enhanced pre styling
  pre: ({ children }) => <>{children}</>,
  // Enhanced blockquote - Info/Alert style
  blockquote: ({ children }) => (
    <div className="my-3 flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
      <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-foreground/90">{children}</div>
    </div>
  ),
  // Enhanced strong - highlight important text
  strong: ({ children }) => {
    const text = String(children);
    // Check for status-like text
    if (/no\s+(fee\s+)?defaulters?|success|complete|active/i.test(text)) {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {children}
        </span>
      );
    }
    if (/error|fail|overdue|pending|inactive/i.test(text)) {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {children}
        </span>
      );
    }
    return <strong className="font-semibold text-foreground">{children}</strong>;
  },
  // Enhanced paragraph
  p: ({ children }) => (
    <p className="text-sm text-foreground/90 leading-relaxed my-2">
      {children}
    </p>
  ),
  // Enhanced links
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  // Enhanced horizontal rule
  hr: () => (
    <div className="my-4 flex items-center gap-2">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  ),
};

export default markdownComponents;
