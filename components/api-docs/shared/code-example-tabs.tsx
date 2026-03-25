'use client';

import { useState, useEffect } from 'react';
import { ApiCodeExample } from '@/lib/types/api-documentation';
import { CodeBlock } from './code-block';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getLanguageLabel } from '@/lib/utils/prism-config';

interface CodeExampleTabsProps {
  examples: ApiCodeExample[];
  endpointPath: string;
}

const STORAGE_KEY = 'api-docs-preferred-language';

export function CodeExampleTabs({ examples, endpointPath }: CodeExampleTabsProps) {
  // Try to load preferred language from localStorage
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || examples[0]?.language || 'curl';
    }
    return examples[0]?.language || 'curl';
  });

  // Save preference to localStorage when changed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, selectedLanguage);
    }
  }, [selectedLanguage]);

  if (examples.length === 0) {
    return null;
  }

  // Ensure selected language exists in examples, fallback to first if not
  const validLanguage = examples.find((ex) => ex.language === selectedLanguage)
    ? selectedLanguage
    : examples[0].language;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">Code Examples</h4>

      <Tabs value={validLanguage} onValueChange={setSelectedLanguage}>
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
          {examples.map((example) => (
            <TabsTrigger
              key={example.language}
              value={example.language}
              className="text-xs"
            >
              {example.label || getLanguageLabel(example.language as any)}
            </TabsTrigger>
          ))}
        </TabsList>

        {examples.map((example) => (
          <TabsContent key={example.language} value={example.language} className="space-y-3">
            {example.description && (
              <p className="text-sm text-muted-foreground">{example.description}</p>
            )}
            <CodeBlock
              code={example.code}
              language={example.language as any}
              maxHeight="500px"
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
