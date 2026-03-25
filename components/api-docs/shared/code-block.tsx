'use client';

import { useState, useEffect } from 'react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { highlightCode, getLanguageLabel, type SupportedLanguage } from '@/lib/utils/prism-config';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CodeBlockProps {
  code: string;
  language: SupportedLanguage;
  fileName?: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  enableCopy?: boolean;
}

export function CodeBlock({
  code,
  language,
  fileName,
  showLineNumbers = false,
  maxHeight = '400px',
  enableCopy = true,
}: CodeBlockProps) {
  const { copied, copy } = useCopyToClipboard();
  const [highlightedCode, setHighlightedCode] = useState(code.trim());
  const languageLabel = getLanguageLabel(language);

  // Highlight code on client-side after mount
  useEffect(() => {
    const highlighted = highlightCode(code.trim(), language);
    setHighlightedCode(highlighted);
  }, [code, language]);

  const handleCopy = () => {
    copy(code.trim(), languageLabel);
  };

  return (
    <div className="relative rounded-lg border bg-slate-950 dark:bg-slate-900">
      {/* Header with file name and language label */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-2">
          {fileName && (
            <span className="text-xs font-medium text-slate-400">{fileName}</span>
          )}
          <span className="text-xs text-slate-500">{languageLabel}</span>
        </div>

        {enableCopy && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            aria-label="Copy code"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                <span className="text-xs">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                <span className="text-xs">Copy</span>
              </>
            )}
          </Button>
        )}
      </div>

      {/* Code content */}
      <div
        className="overflow-x-auto overflow-y-auto scroll-smooth"
        style={{ maxHeight }}
      >
        <pre className={showLineNumbers ? 'line-numbers' : ''}>
          <code
            className={`language-${language} text-sm`}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>
      </div>

      {/* Mobile copy button (shown below code on small screens) */}
      {enableCopy && (
        <div className="border-t border-slate-800 p-2 md:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="w-full text-slate-400 hover:text-slate-100"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy Code
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
