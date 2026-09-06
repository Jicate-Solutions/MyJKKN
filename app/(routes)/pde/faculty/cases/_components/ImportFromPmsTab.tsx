'use client';

// ImportFromPmsTab — pull a de-identified casesheet from the PMS app and let the
// ₹0 AI Max lane draft OSCE questions/weights/ground-truth. The assembled draft
// is handed to the form builder (onApply) for REVIEW — nothing is saved until the
// faculty clicks "Save as draft". Search finds a case by diagnosis; a casesheet
// id can also be pasted directly.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Stethoscope, Sparkles, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { CreateClinicalCaseInput, ImportedPmsImage } from '@/types/pde';

interface Hit {
  casesheet_id: string;
  pseudonym: string;
  condition: string;
  case_date: string | null;
  image_count?: number;
}

interface Props {
  onApply: (parsed: Partial<CreateClinicalCaseInput>, images?: ImportedPmsImage[]) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ImportFromPmsTab({ onApply }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [manualId, setManualId] = useState('');
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/pde/cases/import-from-pms?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Search failed.');
        setHits([]);
      } else {
        setHits(Array.isArray(data?.hits) ? data.hits : []);
      }
    } catch {
      setError('Search failed. Please try again.');
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  const draft = async (casesheetId: string) => {
    if (!UUID_RE.test(casesheetId)) {
      setError('That does not look like a valid casesheet id.');
      return;
    }
    setDraftingId(casesheetId);
    setError(null);
    try {
      const res = await fetch('/api/pde/cases/import-from-pms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ casesheet_id: casesheetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Import failed.');
        return;
      }
      onApply(
        data.data as Partial<CreateClinicalCaseInput>,
        Array.isArray(data.images) ? (data.images as ImportedPmsImage[]) : []
      );
    } catch {
      setError('Import failed. Please try again.');
    } finally {
      setDraftingId(null);
    }
  };

  const busy = draftingId !== null;

  return (
    <div className="space-y-4">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Cases pulled from PMS are <strong>de-identified</strong> (no patient name, contact, or ID). The AI drafts
          questions and answer-keys for you to <strong>review</strong> — always verify clinical accuracy before publishing.
        </AlertDescription>
      </Alert>

      {/* Search by condition */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Find a case by diagnosis</label>
        <div className="flex gap-2 mt-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="e.g. lichen planus, periapical abscess, OSMF…"
            disabled={busy}
            className="min-w-0 flex-1"
          />
          <Button onClick={runSearch} disabled={searching || busy || query.trim().length < 2} variant="secondary" className="shrink-0">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1">Search</span>
          </Button>
        </div>
      </div>

      {searched && !searching && hits.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No matching de-identified cases found.</p>
      )}

      {hits.length > 0 && (
        <div className="border rounded-md divide-y">
          {hits.map((h) => (
            <div key={h.casesheet_id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{h.condition}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <Badge variant="outline" className="mr-2">{h.pseudonym}</Badge>
                  {h.case_date ?? 'undated'}
                  {typeof h.image_count === 'number' && h.image_count > 0 ? (
                    <Badge variant="secondary" className="ml-2">
                      {h.image_count} image{h.image_count > 1 ? 's' : ''}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <Button size="sm" onClick={() => draft(h.casesheet_id)} disabled={busy} className="shrink-0">
                {draftingId === h.casesheet_id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" /> Drafting…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" /> Draft with AI
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Manual id fallback */}
      <div className="pt-2 border-t">
        <label className="text-xs font-medium text-muted-foreground">…or paste a casesheet id</label>
        <div className="flex gap-2 mt-1">
          <Input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="font-mono text-xs min-w-0 flex-1"
            disabled={busy}
          />
          <Button
            onClick={() => draft(manualId.trim())}
            disabled={busy || !UUID_RE.test(manualId.trim())}
            variant="secondary"
            className="shrink-0"
          >
            {draftingId === manualId.trim() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-1">Draft with AI</span>
          </Button>
        </div>
      </div>

      {busy && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Pulling the case and drafting questions on the AI Max lane — this can take ~30–60 seconds.
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
