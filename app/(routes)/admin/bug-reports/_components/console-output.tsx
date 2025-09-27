'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import {
  Terminal,
  AlertTriangle,
  Info,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock
} from 'lucide-react';

interface ConsoleLog {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp?: string;
  args?: any[];
  stack?: string;
}

interface ConsoleOutputProps {
  consoleLogs: any[];
}

const LogLevelIcon = ({ level }: { level: string }) => {
  switch (level) {
    case 'error':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'warn':
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case 'info':
      return <Info className="w-4 h-4 text-blue-500" />;
    case 'debug':
      return <Terminal className="w-4 h-4 text-gray-500" />;
    default:
      return <Terminal className="w-4 h-4 text-green-500" />;
  }
};

const LogLevelBadge = ({ level, count }: { level: string; count: number }) => {
  const configs = {
    error: {
      variant: 'destructive' as const,
      className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200'
    },
    warn: {
      variant: 'outline' as const,
      className: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200'
    },
    info: {
      variant: 'secondary' as const,
      className: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200'
    },
    log: {
      variant: 'outline' as const,
      className: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200'
    },
    debug: {
      variant: 'outline' as const,
      className: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200'
    }
  };

  const config = configs[level as keyof typeof configs] || configs.log;

  return (
    <Badge variant={config.variant} className={config.className}>
      <LogLevelIcon level={level} />
      <span className="ml-1 capitalize">{level}</span>
      <span className="ml-1">({count})</span>
    </Badge>
  );
};

const LogEntry = ({ log, index }: { log: ConsoleLog; index: number }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatMessage = (message: any) => {
    if (typeof message === 'string') {
      return message;
    }
    return JSON.stringify(message, null, 2);
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="border-l-4 border-l-transparent hover:border-l-gray-300 dark:hover:border-l-gray-600 pl-3 py-2 group">
      <div className="flex items-start gap-2">
        <LogLevelIcon level={log.level} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground font-mono">
              #{index + 1}
            </span>
            {log.timestamp && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTimestamp(log.timestamp)}
              </span>
            )}
            <Badge variant="outline" className="text-xs capitalize">
              {log.level}
            </Badge>
          </div>

          <div className="font-mono text-sm">
            <pre className="whitespace-pre-wrap break-words">
              {formatMessage(log.message)}
            </pre>
          </div>

          {((log.args && log.args.length > 0) || log.stack) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 h-6 px-2 text-xs"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 mr-1" />
              ) : (
                <ChevronRight className="w-3 h-3 mr-1" />
              )}
              {isExpanded ? 'Hide' : 'Show'} details
            </Button>
          )}

          {isExpanded && (
            <div className="mt-2 space-y-2">
              {log.args && log.args.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Arguments:</span>
                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(log.args, null, 2)}
                  </pre>
                </div>
              )}
              {log.stack && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Stack trace:</span>
                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap">
                    {log.stack}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const parseConsoleLogs = (rawLogs: any[]): ConsoleLog[] => {
  if (!Array.isArray(rawLogs)) return [];

  return rawLogs.map((log, index) => {
    // Handle different possible log formats
    if (typeof log === 'string') {
      return {
        level: 'log',
        message: log,
        timestamp: new Date().toISOString()
      };
    }

    if (log && typeof log === 'object') {
      return {
        level: log.level || log.type || 'log',
        message: log.message || log.text || JSON.stringify(log),
        timestamp: log.timestamp || log.time,
        args: log.args || log.arguments,
        stack: log.stack || log.stackTrace
      };
    }

    return {
      level: 'log',
      message: JSON.stringify(log),
      timestamp: new Date().toISOString()
    };
  });
};

export function ConsoleOutput({ consoleLogs }: ConsoleOutputProps) {
  const parsedLogs = parseConsoleLogs(consoleLogs);

  // Group logs by level
  const logsByLevel = parsedLogs.reduce((acc, log) => {
    if (!acc[log.level]) {
      acc[log.level] = [];
    }
    acc[log.level].push(log);
    return acc;
  }, {} as Record<string, ConsoleLog[]>);

  const logLevels = ['error', 'warn', 'info', 'log', 'debug'].filter(
    level => logsByLevel[level]?.length > 0
  );

  const totalLogs = parsedLogs.length;

  if (totalLogs === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Console Logs
            <Badge variant="outline">0</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center">
              <Terminal className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No console logs captured</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="w-5 h-5" />
          Console Logs
          <Badge variant="outline">{totalLogs}</Badge>
        </CardTitle>
        <div className="flex flex-wrap gap-2 mt-3">
          {logLevels.map(level => (
            <LogLevelBadge
              key={level}
              level={level}
              count={logsByLevel[level].length}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible>
          <AccordionItem value="console-logs">
            <AccordionTrigger className="text-sm">
              View Console Output
            </AccordionTrigger>
            <AccordionContent>
              {logLevels.length === 1 ? (
                // If only one log level, show directly without tabs
                <div className="rounded-md bg-slate-950 dark:bg-slate-900 p-4">
                  <div className="space-y-2 text-slate-100">
                    {parsedLogs.map((log, index) => (
                      <LogEntry key={index} log={log} index={index} />
                    ))}
                  </div>
                </div>
              ) : (
                // Multiple log levels, show with tabs
                <Tabs defaultValue={logLevels[0]} className="w-full">
                  <TabsList className="grid w-full grid-cols-auto gap-1" style={{
                    gridTemplateColumns: `repeat(${logLevels.length}, 1fr)`
                  }}>
                    {logLevels.map(level => (
                      <TabsTrigger key={level} value={level} className="flex items-center gap-1">
                        <LogLevelIcon level={level} />
                        <span className="capitalize">{level}</span>
                        <Badge variant="outline" className="ml-1 text-xs">
                          {logsByLevel[level].length}
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {logLevels.map(level => (
                    <TabsContent key={level} value={level}>
                      <div className="rounded-md bg-slate-950 dark:bg-slate-900 p-4 mt-4">
                        <div className="space-y-2 text-slate-100">
                          {logsByLevel[level].map((log, index) => (
                            <LogEntry
                              key={`${level}-${index}`}
                              log={log}
                              index={parsedLogs.indexOf(log)}
                            />
                          ))}
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}