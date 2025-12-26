'use client';

import { useRef, useEffect } from 'react';
import { ApiEndpoint } from '@/lib/types/api-documentation';
import { MethodBadge } from './method-badge';
import { ParameterTable } from './parameter-table';
import { AuthenticationInfo } from './authentication-info';
import { ResponseExamples } from './response-examples';
import { ErrorResponsesTable } from './error-responses-table';
import { CodeExampleTabs } from './code-example-tabs';
import { AiPromptSection } from './ai-prompt-section';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Share2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface EndpointCardProps {
  endpoint: ApiEndpoint;
  expanded?: boolean;
  showAiPrompts?: boolean;
}

export function EndpointCard({
  endpoint,
  expanded = false,
  showAiPrompts = true,
}: EndpointCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Scroll to endpoint if hash matches (deep linking)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === `#${endpoint.id}`) {
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [endpoint.id]);

  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${endpoint.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  return (
    <Card
      id={endpoint.id}
      ref={ref}
      className="scroll-mt-20 transition-all hover:shadow-md"
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <MethodBadge method={endpoint.method} size="md" />
              <code className="text-sm font-mono bg-muted px-3 py-1 rounded">
                {endpoint.path}
              </code>
              {endpoint.deprecated && (
                <Badge variant="destructive" className="text-xs">
                  Deprecated
                </Badge>
              )}
              {endpoint.tags && endpoint.tags.map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            <CardTitle className="text-xl">{endpoint.title}</CardTitle>
            <CardDescription className="text-sm">
              {endpoint.description}
            </CardDescription>
            {endpoint.deprecationMessage && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{endpoint.deprecationMessage}</p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="flex-shrink-0"
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Authentication */}
        {endpoint.authentication !== undefined && (
          <>
            <AuthenticationInfo auth={endpoint.authentication} />
            <Separator />
          </>
        )}

        {/* Path Parameters */}
        {endpoint.pathParameters && endpoint.pathParameters.length > 0 && (
          <>
            <ParameterTable
              parameters={endpoint.pathParameters}
              title="Path Parameters"
              type="path"
            />
            <Separator />
          </>
        )}

        {/* Query Parameters */}
        {endpoint.queryParameters && endpoint.queryParameters.length > 0 && (
          <>
            <ParameterTable
              parameters={endpoint.queryParameters}
              title="Query Parameters"
              type="query"
            />
            <Separator />
          </>
        )}

        {/* Request Body */}
        {endpoint.requestBody && (
          <>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Request Body</h4>
              {endpoint.requestBody.description && (
                <p className="text-sm text-muted-foreground">
                  {endpoint.requestBody.description}
                </p>
              )}
              <div className="text-xs text-muted-foreground">
                Content-Type: {endpoint.requestBody.contentType}
              </div>
              <ParameterTable
                parameters={endpoint.requestBody.schema}
                type="body"
                showExamples
              />
            </div>
            <Separator />
          </>
        )}

        {/* Success Responses */}
        {endpoint.successResponses.length > 0 && (
          <>
            <ResponseExamples responses={endpoint.successResponses} />
            <Separator />
          </>
        )}

        {/* Error Responses */}
        {endpoint.errorResponses.length > 0 && (
          <>
            <ErrorResponsesTable errors={endpoint.errorResponses} />
            <Separator />
          </>
        )}

        {/* Code Examples */}
        {endpoint.codeExamples.length > 0 && (
          <>
            <CodeExampleTabs
              examples={endpoint.codeExamples}
              endpointPath={endpoint.path}
            />
            <Separator />
          </>
        )}

        {/* AI Prompts */}
        {showAiPrompts && endpoint.aiPrompts && endpoint.aiPrompts.length > 0 && (
          <>
            <AiPromptSection
              prompts={endpoint.aiPrompts}
              endpointPath={endpoint.path}
              moduleName={endpoint.module}
            />
            <Separator />
          </>
        )}

        {/* Rate Limiting */}
        {endpoint.rateLimit && (
          <>
            <div className="rounded-lg bg-muted/50 p-4">
              <h4 className="text-sm font-semibold mb-2">Rate Limiting</h4>
              <p className="text-sm text-muted-foreground">
                {endpoint.rateLimit.description}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                {endpoint.rateLimit.requestsPerMinute && (
                  <div>
                    <div className="text-xs text-muted-foreground">Per Minute</div>
                    <div className="font-semibold">
                      {endpoint.rateLimit.requestsPerMinute}
                    </div>
                  </div>
                )}
                {endpoint.rateLimit.requestsPerHour && (
                  <div>
                    <div className="text-xs text-muted-foreground">Per Hour</div>
                    <div className="font-semibold">
                      {endpoint.rateLimit.requestsPerHour}
                    </div>
                  </div>
                )}
                {endpoint.rateLimit.requestsPerDay && (
                  <div>
                    <div className="text-xs text-muted-foreground">Per Day</div>
                    <div className="font-semibold">
                      {endpoint.rateLimit.requestsPerDay}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Notes */}
        {endpoint.notes && endpoint.notes.length > 0 && (
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
            <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">
              Important Notes
            </h4>
            <ul className="space-y-2">
              {endpoint.notes.map((note, index) => (
                <li key={index} className="text-sm text-blue-600/90 dark:text-blue-400/90 flex gap-2">
                  <span>•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Related Endpoints */}
        {endpoint.relatedEndpoints && endpoint.relatedEndpoints.length > 0 && (
          <div className="rounded-lg bg-muted/30 p-4">
            <h4 className="text-sm font-semibold mb-2">Related Endpoints</h4>
            <div className="flex flex-wrap gap-2">
              {endpoint.relatedEndpoints.map((relatedId, index) => (
                <a
                  key={index}
                  href={`#${relatedId}`}
                  className="text-xs text-primary hover:underline"
                >
                  {relatedId}
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
