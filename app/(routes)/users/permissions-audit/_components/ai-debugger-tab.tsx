'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Check,
  Database,
  GitCompareArrows,
  Key,
  Loader2,
  Play,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface RoleInfo {
  roleKey: string;
  roleName: string;
}

interface SqlResult {
  success: boolean;
  message?: string;
  error?: string;
}

const QUICK_QUESTIONS = [
  {
    label: "Why can't {role} access {module}?",
    icon: ShieldAlert,
    description: 'Diagnose access issues',
  },
  {
    label: 'What permissions does {role} have?',
    icon: Shield,
    description: 'View complete access profile',
  },
  {
    label: 'Which roles can edit billing?',
    icon: Key,
    description: 'Find roles with specific access',
  },
  {
    label: 'Show all conflicts for {role}',
    icon: AlertTriangle,
    description: 'Cross-layer mismatches',
  },
  {
    label: 'Compare admin vs faculty access',
    icon: GitCompareArrows,
    description: 'Side-by-side comparison',
  },
  {
    label: 'Which tables have no RLS policies?',
    icon: Database,
    description: 'Security coverage gaps',
  },
];

export function AIDebuggerTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [roleHint, setRoleHint] = useState('');
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [executingSql, setExecutingSql] = useState<string | null>(null);
  const [sqlResult, setSqlResult] = useState<SqlResult | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch roles on mount
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const res = await fetch('/api/users/permissions-audit/matrix');
        if (!res.ok) throw new Error('Failed to fetch roles');
        const json = await res.json();

        const fetchedRoles: RoleInfo[] = [];
        if (json.roles && Array.isArray(json.roles)) {
          for (const r of json.roles) {
            const key = typeof r === 'string' ? r : r.roleKey || r.key || r.id;
            const name =
              json.roleMeta?.[key]?.name ||
              (typeof r === 'object' ? r.roleName || r.name : key);
            if (key) fetchedRoles.push({ roleKey: key, roleName: name });
          }
        }
        setRoles(fetchedRoles);
      } catch {
        // Roles will remain empty
      } finally {
        setRolesLoading(false);
      }
    };
    fetchRoles();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleQuickQuestion = (template: string) => {
    if (roleHint) {
      const roleName =
        roles.find((r) => r.roleKey === roleHint)?.roleName || roleHint;
      setInput(template.replace(/\{role\}/g, roleName));
    } else {
      setInput(template);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
    };
    const aiMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput('');
    setIsStreaming(true);

    try {
      const res = await fetch('/api/users/permissions-audit/ai-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: input.trim(),
          roleKey: roleHint || undefined,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `Failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsg.id
                      ? { ...m, content: m.content + parsed.text }
                      : m
                  )
                );
              }
              if (parsed.error) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsg.id
                      ? { ...m, content: `Error: ${parsed.error}` }
                      : m
                  )
                );
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsg.id
            ? {
                ...m,
                content: `Sorry, an error occurred: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleExecuteSql = async () => {
    if (!executingSql) return;
    try {
      const res = await fetch(
        '/api/users/permissions-audit/ai-debug/run-sql',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: executingSql }),
        }
      );
      const result = await res.json();
      setSqlResult(result);
      if (result.success) {
        toast.success('SQL executed successfully');
      } else {
        toast.error(`SQL failed: ${result.error}`);
      }
    } catch {
      setSqlResult({ success: false, error: 'Network error' });
      toast.error('Failed to execute SQL');
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <>
      <Card className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
        <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-lg">AI Permission Debugger</CardTitle>
            <Badge variant="secondary">Gemini 4</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={roleHint || '__auto__'} onValueChange={(v) => setRoleHint(v === '__auto__' ? '' : v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Auto-detect" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">Auto-detect</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.roleKey} value={r.roleKey}>
                    {r.roleName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearChat}
              disabled={messages.length === 0}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
          {/* Messages area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="flex flex-col items-center gap-2 mb-8">
                  <Bot className="h-12 w-12 text-muted-foreground/50" />
                  <h3 className="text-lg font-semibold">
                    Ask me about permission issues
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    I can analyze RLS policies, navigation access, and role
                    configurations
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-4xl">
                  {QUICK_QUESTIONS.map((q) => {
                    const Icon = q.icon;
                    return (
                      <Card
                        key={q.label}
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => handleQuickQuestion(q.label)}
                      >
                        <CardContent className="p-4 flex flex-col gap-2">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                          <p className="text-sm font-medium">{q.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {q.description}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, idx) => {
                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div className="bg-primary text-primary-foreground rounded-xl px-4 py-2 max-w-[80%]">
                          <p className="text-sm">{msg.content}</p>
                        </div>
                      </div>
                    );
                  }

                  // Assistant message
                  const isLast = idx === messages.length - 1;
                  const isEmpty = !msg.content;

                  return (
                    <div key={msg.id} className="flex gap-3">
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <Bot className="h-4 w-4" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        {isStreaming && isLast && isEmpty ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Analyzing...
                          </div>
                        ) : (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                h2({ children }) {
                                  return (
                                    <h2 className="text-base font-bold border-l-4 border-primary pl-3 my-4">
                                      {children}
                                    </h2>
                                  );
                                },
                                h3({ children }) {
                                  return (
                                    <h3 className="text-sm font-semibold flex items-center gap-2 my-3">
                                      <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                                      {children}
                                    </h3>
                                  );
                                },
                                p({ children }) {
                                  return (
                                    <p className="text-sm leading-relaxed my-2">
                                      {children}
                                    </p>
                                  );
                                },
                                ul({ children }) {
                                  return (
                                    <ul className="text-sm space-y-1 my-2 ml-4 list-disc">
                                      {children}
                                    </ul>
                                  );
                                },
                                ol({ children }) {
                                  return (
                                    <ol className="text-sm space-y-1 my-2 ml-4 list-decimal">
                                      {children}
                                    </ol>
                                  );
                                },
                                strong({ children }) {
                                  return (
                                    <strong className="font-semibold">
                                      {children}
                                    </strong>
                                  );
                                },
                                a({ href, children }) {
                                  return (
                                    <a
                                      href={href}
                                      className="text-primary underline"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {children}
                                    </a>
                                  );
                                },
                                table({ children }) {
                                  return (
                                    <div className="my-3 overflow-x-auto rounded-lg border">
                                      <table className="w-full text-xs">
                                        {children}
                                      </table>
                                    </div>
                                  );
                                },
                                thead({ children }) {
                                  return (
                                    <thead className="bg-muted/50 font-medium">
                                      {children}
                                    </thead>
                                  );
                                },
                                th({ children }) {
                                  return (
                                    <th className="px-3 py-2 text-left border-b">
                                      {children}
                                    </th>
                                  );
                                },
                                td({ children }) {
                                  return (
                                    <td className="px-3 py-2 border-b">
                                      {children}
                                    </td>
                                  );
                                },
                                code({
                                  className,
                                  children,
                                  ...props
                                }: any) {
                                  const match = /language-(\w+)/.exec(
                                    className || ''
                                  );
                                  const codeContent = String(children).replace(
                                    /\n$/,
                                    ''
                                  );

                                  if (match) {
                                    const isSQL = match[1] === 'sql';
                                    return (
                                      <div className="relative my-3 group">
                                        <div className="flex items-center justify-between px-4 py-1.5 bg-slate-800 rounded-t-lg">
                                          <span className="text-xs text-slate-400 font-mono">
                                            {match[1]}
                                          </span>
                                          {isSQL && (
                                            <Button
                                              size="sm"
                                              className="h-6 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                                              onClick={() =>
                                                setExecutingSql(codeContent)
                                              }
                                            >
                                              <Play className="h-3 w-3 mr-1" />
                                              Run this fix
                                            </Button>
                                          )}
                                        </div>
                                        <pre className="bg-slate-900 text-slate-100 rounded-b-lg p-4 overflow-x-auto text-xs">
                                          <code>{codeContent}</code>
                                        </pre>
                                      </div>
                                    );
                                  }

                                  return (
                                    <code
                                      className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  );
                                },
                                pre({ children }) {
                                  return <>{children}</>;
                                },
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 border-t p-4">
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="Ask about permissions..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isStreaming}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Analyzes code permissions, RLS policies, and navigation access
            </p>
          </div>
        </CardContent>
      </Card>

      {/* SQL Confirmation Dialog */}
      <AlertDialog
        open={!!executingSql}
        onOpenChange={(open) => {
          if (!open) {
            setExecutingSql(null);
            setSqlResult(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-amber-500" />
              Execute SQL Fix?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will execute the following SQL directly on your database.
              Review carefully before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto text-xs max-h-60 overflow-y-auto">
            {executingSql}
          </pre>

          {sqlResult && (
            <Alert variant={sqlResult.success ? 'default' : 'destructive'}>
              <AlertDescription className="flex items-center gap-2">
                {sqlResult.success ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {sqlResult.success ? sqlResult.message : sqlResult.error}
              </AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!sqlResult?.success && (
              <AlertDialogAction
                onClick={handleExecuteSql}
                className="bg-amber-500 hover:bg-amber-600"
              >
                Execute SQL
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
