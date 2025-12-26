'use client';

import { useState } from 'react';
import { ApiResponse } from '@/lib/types/api-documentation';
import { StatusBadge } from './status-badge';
import { CodeBlock } from './code-block';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ResponseExamplesProps {
  responses: ApiResponse[];
  defaultTab?: number;
}

export function ResponseExamples({
  responses,
  defaultTab = 0,
}: ResponseExamplesProps) {
  const [activeTab, setActiveTab] = useState(
    responses[defaultTab]?.statusCode.toString() || responses[0]?.statusCode.toString()
  );

  if (responses.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">Success Responses</h4>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {responses.map((response) => (
            <TabsTrigger
              key={response.statusCode}
              value={response.statusCode.toString()}
              className="gap-2"
            >
              <StatusBadge statusCode={response.statusCode} size="sm" />
              <span className="text-xs">{response.description}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {responses.map((response) => (
          <TabsContent
            key={response.statusCode}
            value={response.statusCode.toString()}
            className="space-y-4"
          >
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusBadge statusCode={response.statusCode} size="md" />
                  <h5 className="text-sm font-medium">{response.description}</h5>
                </div>
                {response.contentType && (
                  <span className="text-xs text-muted-foreground">
                    Content-Type: {response.contentType}
                  </span>
                )}
              </div>

              {response.headers && Object.keys(response.headers).length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Headers</div>
                  <div className="space-y-1">
                    {Object.entries(response.headers).map(([key, value]) => (
                      <div
                        key={key}
                        className="text-xs font-mono bg-muted px-2 py-1 rounded"
                      >
                        {key}: {value}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Example Response
              </div>
              <CodeBlock
                code={JSON.stringify(response.example, null, 2)}
                language="json"
                maxHeight="500px"
              />
            </div>

            {response.schema && response.schema.length > 0 && (
              <div className="rounded-lg bg-muted/30 p-4">
                <div className="text-xs font-medium text-muted-foreground mb-3">
                  Response Schema
                </div>
                <div className="space-y-2">
                  {response.schema.map((field, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 text-xs border-l-2 border-primary/50 pl-3"
                    >
                      <code className="font-mono font-semibold min-w-[120px]">
                        {field.name}
                      </code>
                      <span className="text-muted-foreground font-mono">
                        {field.type}
                      </span>
                      <span className="text-muted-foreground flex-1">
                        {field.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
