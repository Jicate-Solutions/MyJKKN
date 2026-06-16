'use client';

// app/(public)/r/[slug]/_components/routing-form-widget.tsx
//
// Public Routing Form flow — Universal Booking M1.
//   Step "form": headline + description + config-driven fields.
//   On submit:  POST to the submit API → it evaluates rules and returns either
//     - a redirect target (event_link / url) → we send the visitor there, or
//     - a markdown message → we render it in place, or
//     - no_destination → explicit "we'll be in touch" message (never silent).
//
// Aesthetic mirrors the public booking widget: institutional evergreen + warm
// cream + saffron accent; DM Serif Display headlines over IBM Plex Sans body.
// Mobile-first. No Tamil strings in v1 (CLAUDE.md #24 — needs native review).

import { useState } from 'react';
import { ArrowRight, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';

export type PublicRoutingFieldType = 'text' | 'select' | 'multiselect';

export interface PublicRoutingField {
  key: string;
  label: string;
  type: PublicRoutingFieldType;
  options?: string[];
  required?: boolean;
}

interface RoutingFormWidgetProps {
  slug: string;
  title: string;
  headline: string | null;
  description: string | null;
  fields: PublicRoutingField[];
}

type Answer = string | string[];

interface SubmitDestination {
  type?: 'event_link' | 'url' | 'message';
  redirect?: string;
  markdown?: string;
}

interface SubmitResponse {
  success?: boolean;
  destination?: SubmitDestination | null;
  message?: string;
  error?: string;
}

/** Minimal, safe markdown → plain blocks (no raw HTML). Bold + line breaks only. */
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split(/\r?\n/);
  return lines.map((line, i) => {
    // Split on **bold** segments.
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <p key={i} className={line.trim() === '' ? 'h-3' : 'text-sm leading-relaxed text-[#1C2B24]/80'}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? (
            <strong key={j} className="font-semibold text-[#0E4D34]">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <span key={j}>{p}</span>
          ),
        )}
      </p>
    );
  });
}

export function RoutingFormWidget({
  slug,
  title,
  headline,
  description,
  fields,
}: RoutingFormWidgetProps) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const setAnswer = (key: string, value: Answer) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  const toggleMulti = (key: string, option: string) =>
    setAnswers((a) => {
      const current = Array.isArray(a[key]) ? (a[key] as string[]) : [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...a, [key]: next };
    });

  const requiredOk = fields.every((f) => {
    if (!f.required) return true;
    const v = answers[f.key];
    if (Array.isArray(v)) return v.length > 0;
    return (v ?? '').toString().trim().length > 0;
  });

  async function submit() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/public/routing-form/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, email: email.trim(), honeypot }),
      });
      const data: SubmitResponse = await res.json();

      if (res.status === 404) {
        setError(data.message ?? 'This form is no longer available.');
        return;
      }
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Could not submit the form. Please try again.');
        return;
      }

      const dest = data.destination;
      if (dest?.redirect) {
        setRedirecting(true);
        // External URLs and internal scheduling links both open via full nav.
        window.location.assign(dest.redirect);
        return;
      }
      if (dest?.type === 'message' && dest.markdown) {
        setMessage(dest.markdown);
        return;
      }
      // no_destination (or empty) — explicit, friendly close (rule #27).
      setMessage(
        'Thank you. Your responses have been recorded and the right team will be in touch shortly.',
      );
    } catch {
      setError('Network problem — please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-[#FAF7F0] text-[#1C2B24]"
      style={{ fontFamily: 'var(--font-ibm-plex-sans), sans-serif' }}
    >
      <div className="h-2 w-full bg-[#0E4D34]" />
      <div className="mx-auto flex min-h-[calc(100vh-0.5rem)] w-full max-w-md flex-col px-5 pb-10 pt-8">
        <header className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0E4D34]/70">
            JKKN Institutions
          </p>
          <h1
            className="mt-1 text-[1.9rem] leading-tight text-[#0E4D34]"
            style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
          >
            {headline?.trim() || title}
          </h1>
          {description?.trim() && (
            <p className="mt-2 text-sm text-[#1C2B24]/65">{description}</p>
          )}
        </header>

        {error && (
          <div
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Result message destination */}
        {message ? (
          <div className="flex flex-1 flex-col items-center pt-2 text-center">
            <CheckCircle2 className="mb-4 h-12 w-12 text-[#0E4D34]" strokeWidth={1.5} />
            <div className="w-full rounded-2xl bg-white px-5 py-6 text-left shadow-[0_8px_30px_rgba(14,77,52,0.12)]">
              {renderMarkdown(message)}
            </div>
          </div>
        ) : redirecting ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-[#0E4D34]" />
            <p className="text-sm text-[#1C2B24]/65">Taking you to the next step…</p>
          </div>
        ) : (
          <form
            className="flex flex-1 flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (requiredOk && !loading) void submit();
            }}
          >
            {fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required}>
                {f.type === 'select' && f.options?.length ? (
                  <select
                    value={(answers[f.key] as string) ?? ''}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                    required={f.required}
                    className="input-jkkn-r"
                  >
                    <option value="" disabled>
                      Select…
                    </option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'multiselect' && f.options?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {f.options.map((o) => {
                      const selected =
                        Array.isArray(answers[f.key]) &&
                        (answers[f.key] as string[]).includes(o);
                      return (
                        <button
                          key={o}
                          type="button"
                          onClick={() => toggleMulti(f.key, o)}
                          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                            selected
                              ? 'border-[#0E4D34] bg-[#0E4D34] text-white'
                              : 'border-[#0E4D34]/20 bg-white text-[#1C2B24]/80 hover:border-[#0E4D34]/50'
                          }`}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={(answers[f.key] as string) ?? ''}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                    required={f.required}
                    className="input-jkkn-r"
                  />
                )}
              </Field>
            ))}

            <Field label="Email (optional)">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="input-jkkn-r"
                placeholder="you@example.com"
              />
            </Field>

            {/* honeypot — invisible to humans, bots fill it */}
            <input
              type="text"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              name="website"
            />

            <button type="submit" disabled={!requiredOk || loading} className="btn-jkkn-r mt-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Continue
            </button>
            <p className="mt-1 flex items-center justify-center gap-1 text-center text-xs text-[#1C2B24]/45">
              <ExternalLink className="h-3 w-3" /> You may be taken to a scheduling page next.
            </p>
          </form>
        )}

        <footer className="mt-auto pt-10 text-center text-[11px] text-[#1C2B24]/40">
          JKKN Institutions
        </footer>
      </div>

      <style jsx global>{`
        .input-jkkn-r {
          width: 100%;
          border-radius: 0.6rem;
          border: 1px solid rgba(14, 77, 52, 0.2);
          background: #fff;
          padding: 0.65rem 0.85rem;
          font-size: 0.925rem;
          color: #1c2b24;
          outline: none;
          transition: border-color 150ms, box-shadow 150ms;
        }
        .input-jkkn-r:focus {
          border-color: #0e4d34;
          box-shadow: 0 0 0 3px rgba(14, 77, 52, 0.12);
        }
        .btn-jkkn-r {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          border-radius: 0.7rem;
          background: #0e4d34;
          padding: 0.8rem 1rem;
          font-size: 0.95rem;
          font-weight: 600;
          color: #fff;
          transition: background 150ms, transform 100ms;
        }
        .btn-jkkn-r:hover:not(:disabled) {
          background: #0b3f2b;
        }
        .btn-jkkn-r:active:not(:disabled) {
          transform: scale(0.99);
        }
        .btn-jkkn-r:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#1C2B24]/75">
        {label}
        {required && <span className="ml-0.5 text-[#C99A2E]">*</span>}
      </span>
      {children}
    </label>
  );
}
