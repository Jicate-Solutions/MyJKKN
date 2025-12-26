'use client';

import { ApiAiPrompt } from '@/lib/types/api-documentation';
import { CodeBlock } from './code-block';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Sparkles, TrendingUp, Zap, Link2 } from 'lucide-react';

interface AiPromptSectionProps {
  prompts: ApiAiPrompt[];
  endpointPath: string;
  moduleName: string;
}

const CATEGORY_ICONS = {
  'data-retrieval': Link2,
  analysis: TrendingUp,
  automation: Zap,
  integration: Link2,
};

const CATEGORY_COLORS = {
  'data-retrieval': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  analysis: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  automation: 'bg-green-500/10 text-green-500 border-green-500/20',
  integration: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

const COMPLEXITY_COLORS = {
  beginner: 'bg-green-500/10 text-green-600 border-green-500/30',
  intermediate: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  advanced: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export function AiPromptSection({
  prompts,
  endpointPath,
  moduleName,
}: AiPromptSectionProps) {
  if (!prompts || prompts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">AI Usage Examples</h4>
        <Badge variant="secondary" className="text-xs">
          {prompts.length} {prompts.length === 1 ? 'Prompt' : 'Prompts'}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Use these prompts with AI assistants like Claude, ChatGPT, or Copilot to interact
        with the {moduleName} API.
      </p>

      <Accordion type="single" collapsible className="w-full">
        {prompts.map((prompt, index) => {
          const CategoryIcon = CATEGORY_ICONS[prompt.category];
          const categoryColor = CATEGORY_COLORS[prompt.category];
          const complexityColor = COMPLEXITY_COLORS[prompt.complexity];

          return (
            <AccordionItem key={index} value={`prompt-${index}`}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <CategoryIcon className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium">{prompt.title}</span>
                  <div className="flex items-center gap-2 ml-auto mr-4">
                    <Badge
                      variant="outline"
                      className={`text-xs ${categoryColor}`}
                    >
                      {prompt.category}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${complexityColor}`}
                    >
                      {prompt.complexity}
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    AI Prompt
                  </div>
                  <CodeBlock
                    code={prompt.prompt}
                    language="bash"
                    maxHeight="300px"
                  />
                </div>

                {prompt.expectedOutput && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Expected Output
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                      {prompt.expectedOutput}
                    </div>
                  </div>
                )}

                {prompt.tags && prompt.tags.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Tags
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {prompt.tags.map((tag, tagIndex) => (
                        <Badge
                          key={tagIndex}
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    <strong>Tip:</strong> Copy this prompt and paste it into your AI
                    assistant. The AI will use the {endpointPath} endpoint to complete
                    the task.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
