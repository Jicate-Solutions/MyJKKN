'use client';

/**
 * Searchable list of approved syllabi. CLOs are fetched the first time a
 * course is opened and then cached for the session — the list is capped at
 * 1000 syllabi, so prefetching every outcome up front would be wasteful.
 */

import { useCallback, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { BosSyllabusOption, SyllabusCLO } from '@/lib/types/pde-curriculum';

type CloState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; clos: SyllabusCLO[] };

export function SyllabusBrowser({ syllabi }: { syllabi: BosSyllabusOption[] }) {
  const [query, setQuery] = useState('');
  const [clos, setClos] = useState<Record<string, CloState>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return syllabi;
    return syllabi.filter(
      (s) =>
        s.course_name.toLowerCase().includes(q) ||
        s.course_code.toLowerCase().includes(q),
    );
  }, [syllabi, query]);

  const loadClos = useCallback(
    async (id: string) => {
      if (clos[id]) return;
      setClos((prev) => ({ ...prev, [id]: { status: 'loading' } }));
      try {
        const res = await fetch(`/api/learners/my-syllabus/${id}/clos`);
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? 'Could not load outcomes.');
        setClos((prev) => ({
          ...prev,
          [id]: { status: 'ready', clos: body.data.clos ?? [] },
        }));
      } catch (err) {
        setClos((prev) => ({
          ...prev,
          [id]: {
            status: 'error',
            message: err instanceof Error ? err.message : 'Could not load outcomes.',
          },
        }));
      }
    },
    [clos],
  );

  if (syllabi.length === 0) {
    return (
      <p className="max-w-prose text-sm text-muted-foreground">
        No approved syllabi have been published for your institution yet. They
        appear here once the Board of Studies approves them.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by course name or code"
        aria-label="Search syllabi"
        className="max-w-md"
      />

      <p className="text-xs text-muted-foreground">
        {filtered.length} of {syllabi.length} courses
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No course matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <Accordion
          type="single"
          collapsible
          onValueChange={(v) => v && loadClos(v)}
          className="rounded-lg border"
        >
          {filtered.map((s) => {
            const state = clos[s.id];
            return (
              <AccordionItem key={s.id} value={s.id} className="px-4">
                <AccordionTrigger className="text-left">
                  <span className="flex flex-col items-start gap-0.5">
                    <span className="font-medium">{s.course_name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {s.course_code} &middot; v{s.version_number}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {!state || state.status === 'loading' ? (
                    <div className="space-y-2 pb-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : state.status === 'error' ? (
                    <p className="pb-2 text-sm text-destructive">{state.message}</p>
                  ) : state.clos.length === 0 ? (
                    <p className="pb-2 text-sm text-muted-foreground">
                      This syllabus has no learning outcomes recorded yet.
                    </p>
                  ) : (
                    <ol className="space-y-3 pb-2">
                      {state.clos.map((c) => (
                        <li key={c.clo_number} className="flex gap-3">
                          <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                            CO{c.clo_number}
                          </span>
                          <span className="flex-1 text-sm">
                            {c.description}
                            {c.k_values.length > 0 && (
                              <span className="ml-2 inline-flex gap-1 align-middle">
                                {c.k_values.map((k) => (
                                  <Badge key={k} variant="outline" className="text-[10px]">
                                    {k}
                                  </Badge>
                                ))}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
