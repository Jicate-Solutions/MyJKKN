'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Play,
  Key,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  FlaskConical,
} from 'lucide-react';
import { getDefaultTestKey } from '../../_actions/get-default-test-key';
import { B2A_ENDPOINT_MAP, B2AEndpointDef, ParamDef } from '../_data/b2a-endpoints';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResponseState {
  status: number;
  statusText: string;
  timeMs: number;
  rateLimitRemaining: string | null;
  rateLimitReset: string | null;
  body: unknown;
}

export interface B2AEndpointTesterDialogProps {
  endpointId: string | null;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildUrl(
  endpoint: B2AEndpointDef,
  pathId: string,
  params: Record<string, string>
): string {
  let path = endpoint.path;
  if (endpoint.hasPathId && pathId) {
    path = path.replace(':id', pathId.trim());
  }
  const qs = new URLSearchParams();
  endpoint.params?.forEach(({ name }) => {
    const val = params[name];
    if (val !== undefined && val !== '') qs.set(name, val);
  });
  const queryString = qs.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function statusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) return 'text-green-600 border-green-600';
  if (status >= 400 && status < 500) return 'text-yellow-600 border-yellow-600';
  return 'text-red-600 border-red-600';
}

// ─── Param Input ──────────────────────────────────────────────────────────────

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: ParamDef;
  value: string;
  onChange: (val: string) => void;
}) {
  // Radix Select.Item cannot have value="". Use a sentinel so the "clear" option
  // is valid, then translate it back to "" (meaning "no filter") in onChange.
  const NONE = '__none__';

  if (param.type === 'select' && param.options) {
    return (
      <Select
        value={value === '' ? NONE : value}
        onValueChange={val => onChange(val === NONE ? '' : val)}
      >
        <SelectTrigger className='h-8 text-xs'>
          <SelectValue placeholder={`Any ${param.label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className='text-xs text-muted-foreground'>
            — any —
          </SelectItem>
          {param.options.map(opt => (
            <SelectItem key={opt} value={opt} className='text-xs'>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      className='h-8 text-xs'
      type={param.type === 'date' ? 'date' : param.type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={param.placeholder ?? param.defaultValue ?? ''}
    />
  );
}

// ─── Main Dialog Component ────────────────────────────────────────────────────

export function B2AEndpointTesterDialog({
  endpointId,
  onClose,
}: B2AEndpointTesterDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [pathId, setPathId] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const endpoint = endpointId ? (B2A_ENDPOINT_MAP[endpointId] ?? null) : null;

  // Auto-load the default test key from env when the dialog first opens
  useEffect(() => {
    if (endpointId && !apiKey) {
      getDefaultTestKey().then(key => {
        if (key) setApiKey(key);
      });
    }
  }, [endpointId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset params & response whenever the endpoint changes (but keep the API key)
  useEffect(() => {
    setParams({});
    setPathId('');
    setResponse(null);
    setFetchError(null);
  }, [endpointId]);

  const setParam = (name: string, value: string) =>
    setParams(prev => ({ ...prev, [name]: value }));

  const previewUrl = endpoint ? buildUrl(endpoint, pathId, params) : '';

  const canSend =
    !!endpoint &&
    !!apiKey.trim() &&
    !isSending &&
    !(endpoint.hasPathId && !pathId.trim());

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!endpoint || !apiKey.trim()) return;
    setIsSending(true);
    setResponse(null);
    setFetchError(null);

    const url = buildUrl(endpoint, pathId, params);
    const start = Date.now();

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: 'application/json',
        },
      });

      const timeMs = Date.now() - start;
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        timeMs,
        rateLimitRemaining: res.headers.get('x-ratelimit-remaining'),
        rateLimitReset: res.headers.get('x-ratelimit-reset'),
        body,
      });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Network request failed');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(JSON.stringify(response.body, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={!!endpointId} onOpenChange={open => !open && onClose()}>
      <DialogContent className='max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden'>
        {/* Header */}
        <DialogHeader className='px-6 pt-6 pb-4 border-b shrink-0'>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <FlaskConical className='h-4 w-4 text-blue-500 shrink-0' />
            Try It
            {endpoint && (
              <>
                <span className='text-muted-foreground font-normal'>—</span>
                <code className='text-xs bg-muted px-2 py-0.5 rounded font-mono truncate max-w-xs'>
                  {endpoint.path}
                </code>
                <Badge className='text-xs ml-auto shrink-0'>GET</Badge>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {endpoint && (
          <div className='flex-1 min-h-0 overflow-y-auto px-6 py-4'>
            <div className='space-y-5'>
              {/* ── API Key ───────────────────────────────────────── */}
              <div className='space-y-1.5'>
                <Label className='text-xs font-medium flex items-center gap-1.5'>
                  <Key className='h-3 w-3' />
                  API Key
                  {apiKey && (
                    <Badge variant='outline' className='text-[10px] px-1.5 py-0 text-green-600 border-green-600 ml-1'>
                      Set
                    </Badge>
                  )}
                </Label>
                <Input
                  className='h-8 text-xs font-mono'
                  type='password'
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder='jkkn_b2a_your_key_here'
                  autoComplete='off'
                />
                <p className='text-[10px] text-muted-foreground'>
                  {apiKey
                    ? 'Default test key loaded. Paste a different key to override.'
                    : 'Set B2A_TEST_API_KEY in .env.local to auto-load, or paste a key manually.'}
                </p>
              </div>

              {/* ── Path Parameter (:id) ─────────────────────────── */}
              {endpoint.hasPathId && (
                <div className='space-y-1.5'>
                  <Label className='text-xs font-medium'>
                    Path Parameter —{' '}
                    <code className='bg-muted px-1 rounded text-orange-600'>:id</code>
                    <span className='text-red-500 ml-1'>*required</span>
                  </Label>
                  <Input
                    className='h-8 text-xs font-mono'
                    value={pathId}
                    onChange={e => setPathId(e.target.value)}
                    placeholder='3fa85f64-5717-4562-b3fc-2c963f66afa6'
                  />
                  <p className='text-[10px] text-muted-foreground'>UUID of the record to fetch.</p>
                </div>
              )}

              {/* ── Query Parameters ─────────────────────────────── */}
              {endpoint.params && endpoint.params.length > 0 && (
                <div className='space-y-2'>
                  <Label className='text-xs font-medium'>Query Parameters</Label>
                  <div className='grid grid-cols-2 gap-x-4 gap-y-3'>
                    {endpoint.params.map(param => (
                      <div key={param.name} className='space-y-1'>
                        <div className='flex items-center gap-1'>
                          <code className='text-[10px] text-muted-foreground font-mono'>
                            {param.name}
                          </code>
                          {param.required && (
                            <Badge
                              variant='destructive'
                              className='text-[9px] px-1 py-0 h-3.5'
                            >
                              req
                            </Badge>
                          )}
                        </div>
                        <ParamInput
                          param={param}
                          value={params[param.name] ?? ''}
                          onChange={val => setParam(param.name, val)}
                        />
                        {param.description && (
                          <p className='text-[10px] text-muted-foreground leading-tight'>
                            {param.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── URL Preview ──────────────────────────────────── */}
              <div className='space-y-1'>
                <Label className='text-xs font-medium text-muted-foreground'>
                  Request URL Preview
                </Label>
                <div className='bg-muted rounded px-3 py-2 text-xs font-mono break-all'>
                  <span className='text-blue-500 font-semibold'>GET</span>{' '}
                  <span className='text-muted-foreground'>
                    {typeof window !== 'undefined' ? window.location.origin : ''}
                  </span>
                  <span>{previewUrl}</span>
                </div>
              </div>

              {/* ── Send Button ──────────────────────────────────── */}
              <Button
                onClick={handleSend}
                disabled={!canSend}
                className='w-full h-9 gap-2'
              >
                {isSending ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    Sending…
                  </>
                ) : (
                  <>
                    <Play className='h-4 w-4' />
                    Send Request
                  </>
                )}
              </Button>

              {/* ── Fetch Error ──────────────────────────────────── */}
              {fetchError && (
                <div className='flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-3'>
                  <AlertCircle className='h-4 w-4 shrink-0 mt-0.5' />
                  <span>{fetchError}</span>
                </div>
              )}

              {/* ── Response Panel ───────────────────────────────── */}
              {response && (
                <>
                  <Separator />
                  <div className='space-y-3'>
                    {/* Meta row */}
                    <div className='flex items-center justify-between flex-wrap gap-2'>
                      <div className='flex items-center gap-3'>
                        {response.status >= 200 && response.status < 300 ? (
                          <CheckCircle2 className='h-4 w-4 text-green-600 shrink-0' />
                        ) : (
                          <AlertCircle className='h-4 w-4 text-yellow-600 shrink-0' />
                        )}
                        <Badge
                          variant='outline'
                          className={`text-xs font-mono ${statusBadgeClass(response.status)}`}
                        >
                          {response.status} {response.statusText}
                        </Badge>
                        <span className='text-xs text-muted-foreground'>
                          {response.timeMs}ms
                        </span>
                        {response.rateLimitRemaining && (
                          <span className='text-xs text-muted-foreground'>
                            {response.rateLimitRemaining}/60 req remaining
                          </span>
                        )}
                      </div>
                      <Button
                        size='sm'
                        variant='ghost'
                        className='h-7 text-xs gap-1'
                        onClick={handleCopyResponse}
                      >
                        {copied ? (
                          <Check className='h-3 w-3' />
                        ) : (
                          <Copy className='h-3 w-3' />
                        )}
                        {copied ? 'Copied!' : 'Copy JSON'}
                      </Button>
                    </div>

                    {/* Body */}
                    <div className='rounded border bg-muted/30 overflow-hidden'>
                      <div className='bg-muted/60 px-3 py-1.5 border-b flex items-center gap-2'>
                        <span className='text-[10px] font-medium text-muted-foreground uppercase tracking-wide'>
                          Response Body
                        </span>
                      </div>
                      <ScrollArea className='h-56'>
                        <pre className='text-xs p-3 whitespace-pre-wrap break-words leading-relaxed'>
                          {typeof response.body === 'string'
                            ? response.body
                            : JSON.stringify(response.body, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
