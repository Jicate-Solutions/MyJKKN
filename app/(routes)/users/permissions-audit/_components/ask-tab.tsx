'use client';

import { useState } from 'react';
import BeatLoader from 'react-spinners/BeatLoader';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

import {
  AlertCircle,
  Download,
  Search,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AskUser {
  id: string;
  full_name: string;
  email: string;
}

interface AskGroup {
  role: string;
  roleDisplayName: string;
  users: AskUser[];
}

interface AskResult {
  interpretedPermissions: string[];
  summary: string;
  groupedUsers: AskGroup[];
  technicalNote: string;
}

interface AskError {
  error: 'ambiguous';
  suggestions: string[];
}

type AskResponse = AskResult | AskError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXAMPLE_QUESTIONS = [
  'Who can delete student records?',
  'Can students see other students\u2019 grades?',
  'Who has access to billing data?',
  'Which roles can create new users?',
  'Who can mark attendance?',
  'Who can approve leave requests?',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AskTab() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [ambiguous, setAmbiguous] = useState<AskError | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setResult(null);
    setAmbiguous(null);
    setError(null);
    setQuestion('');
  };

  const ask = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setResult(null);
    setAmbiguous(null);
    setError(null);

    try {
      const res = await fetch('/api/users/permissions-audit/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });

      const json: AskResponse = await res.json();

      if (!res.ok) {
        setError((json as any).error ?? `Request failed (${res.status})`);
        return;
      }

      if ('error' in json && json.error === 'ambiguous') {
        setAmbiguous(json as AskError);
      } else {
        setResult(json as AskResult);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ask(question);
  };

  const handleChipClick = (q: string) => {
    setQuestion(q);
    ask(q);
  };

  const handleSuggestionClick = (s: string) => {
    setQuestion(s);
    ask(s);
  };

  const hasResult = !!(result || ambiguous || error);

  return (
    <div className="space-y-4">
      {/* Search card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-lg">Ask anything about permissions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 text-sm"
                placeholder="e.g. Who can delete student records?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>
            <Button
              type="submit"
              disabled={!question.trim() || loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[72px]"
            >
              {loading ? (
                <BeatLoader color="#ffffff" size={6} />
              ) : (
                'Ask'
              )}
            </Button>
          </form>

          {/* Example chips — shown only before first query */}
          {!hasResult && !loading && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">Try an example:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleChipClick(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/40 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-12">
          <BeatLoader color="#6366f1" size={10} />
          <p className="text-sm text-muted-foreground">Interpreting your question&hellip;</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Ambiguous state */}
      {ambiguous && !loading && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-2">
              I couldn&rsquo;t interpret that question precisely. Try one of these:
            </p>
            <ul className="space-y-1">
              {ambiguous.suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => handleSuggestionClick(s)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline text-left"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Result card */}
      {result && !loading && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground mb-1">Your question</p>
                <p className="text-sm font-medium text-foreground">&ldquo;{question}&rdquo;</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  className="text-xs"
                >
                  New Question
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="text-xs text-muted-foreground"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Export (coming soon)
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Interpreted permissions */}
            {result.interpretedPermissions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.interpretedPermissions.map((p) => (
                  <Badge
                    key={p}
                    variant="secondary"
                    className="font-mono text-xs bg-indigo-50 text-indigo-700 border-indigo-200"
                  >
                    {p}
                  </Badge>
                ))}
              </div>
            )}

            {/* Answer block */}
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">
                Answer
              </p>
              <p className="text-sm text-foreground leading-relaxed">{result.summary}</p>
            </div>

            {/* Grouped users by role */}
            {result.groupedUsers.length > 0 ? (
              <div className="space-y-3">
                {result.groupedUsers.map((group) => {
                  const isSuperAdmin = group.role === 'super_admin';
                  const Icon = isSuperAdmin ? Shield : Users;
                  const visibleUsers = group.users.slice(0, 10);
                  const overflow = group.users.length - visibleUsers.length;

                  return (
                    <div key={group.role} className="rounded-lg border bg-card">
                      {/* Role header */}
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 rounded-t-lg">
                        <Icon
                          className={`h-4 w-4 ${isSuperAdmin ? 'text-amber-500' : 'text-indigo-500'}`}
                        />
                        <span className="text-sm font-medium">
                          {group.roleDisplayName}
                        </span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {group.users.length} {group.users.length === 1 ? 'user' : 'users'}
                        </Badge>
                      </div>

                      {/* User list */}
                      <div className="divide-y">
                        {visibleUsers.map((user) => (
                          <div
                            key={user.id}
                            className="flex items-center gap-3 px-4 py-2"
                          >
                            <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                              {user.full_name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {user.full_name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        ))}
                        {overflow > 0 && (
                          <div className="px-4 py-2">
                            <p className="text-xs text-muted-foreground">
                              +{overflow} more
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <Shield className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No users found with this permission.
                </p>
              </div>
            )}

            {/* Technical note */}
            {result.technicalNote && (
              <p className="text-xs text-muted-foreground border-t pt-3">
                <span className="font-medium">Technical: </span>
                {result.technicalNote}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
