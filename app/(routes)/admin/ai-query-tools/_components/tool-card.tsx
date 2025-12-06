'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Code,
  Shield,
  Lightbulb,
  Database,
  ExternalLink,
  Copy,
  Check,
  Info,
  Layers,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';
import {
  AIQueryToolConfig,
  getTierLabel,
  getTierColor,
  getCategoryInfo,
} from '@/lib/config/ai-query-tools-config';

interface ToolCardProps {
  tool: AIQueryToolConfig;
}

export function ToolCard({ tool }: ToolCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const categoryInfo = getCategoryInfo(tool.category);

  const copyToolName = () => {
    navigator.clipboard.writeText(tool.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Card Preview - Clickable */}
      <Card
        className="hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer group"
        onClick={() => setIsOpen(true)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <CardTitle className="text-sm font-mono truncate">
                  {tool.name}
                </CardTitle>
                <Badge variant="outline" className={`${getTierColor(tool.tier)} text-[10px] shrink-0`}>
                  Tier {tool.tier}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {tool.description}
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">
              {tool.parameters.length} params
            </Badge>
            {tool.examples && tool.examples.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {tool.examples.length} examples
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <DialogTitle className="text-lg font-mono">
                    {tool.name}
                  </DialogTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={copyToolName}
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <DialogDescription className="text-sm">
                  {tool.description}
                </DialogDescription>
              </div>
              <Badge className={`${getTierColor(tool.tier)} shrink-0`}>
                Tier {tool.tier} - {getTierLabel(tool.tier)}
              </Badge>
            </div>
          </DialogHeader>

          {/* Scrollable Content */}
          <ScrollArea className="max-h-[calc(90vh-180px)]">
            <div className="px-6 py-4 space-y-6">
              {/* Quick Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Permission</p>
                    <code className="text-xs font-mono truncate block">
                      {tool.permission}
                    </code>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Database className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">RPC Function</p>
                    <code className="text-xs font-mono truncate block">
                      {tool.rpcFunction}
                    </code>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Layers className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="text-sm font-medium">{categoryInfo?.label || tool.category}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Info className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Action Level</p>
                    <p className="text-sm font-medium">{getTierLabel(tool.tier)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Parameters Section */}
              {tool.parameters.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">Parameters</h3>
                    <Badge variant="secondary" className="text-xs">
                      {tool.parameters.filter(p => p.required).length} required
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {tool.parameters.map((param) => (
                      <div
                        key={param.name}
                        className="rounded-lg border bg-card p-4"
                      >
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <code className="text-sm font-mono font-semibold text-primary">
                            {param.name}
                          </code>
                          {param.required && (
                            <Badge variant="destructive" className="text-[10px]">
                              Required
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {param.type}
                          </Badge>
                          {param.enum && (
                            <Badge variant="outline" className="text-[10px]">
                              Enum
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {param.description}
                        </p>
                        {param.enum && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {param.enum.map((value) => (
                              <code
                                key={value}
                                className="px-2 py-0.5 text-[10px] bg-muted rounded font-mono"
                              >
                                {value}
                              </code>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tool.parameters.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  <Code className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No parameters required for this tool.
                </div>
              )}

              {/* Examples Section */}
              {tool.examples && tool.examples.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      <h3 className="font-semibold">Example Usage</h3>
                    </div>
                    <div className="space-y-2">
                      {tool.examples.map((example, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 rounded-lg bg-gradient-to-r from-yellow-500/5 to-transparent border border-yellow-500/20"
                        >
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500/10 text-yellow-600 text-xs font-semibold shrink-0">
                            {index + 1}
                          </div>
                          <p className="text-sm italic text-muted-foreground">
                            "{example}"
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Usage Note */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-700 dark:text-blue-400 mb-1">
                      How to use this tool
                    </p>
                    <p className="text-muted-foreground">
                      This tool is automatically invoked by the AI when you ask questions related to its functionality.
                      Simply ask natural language questions and the AI will use this tool to fetch the relevant data.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              RPC: <code className="font-mono">{tool.rpcFunction}</code>
            </div>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
