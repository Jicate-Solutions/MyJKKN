'use client';

// learner-search.tsx — search box + QR scanner for picking one learner.
//
// Two ways in, one result: whichever path the operator uses, the parent gets a
// SchoolLearnerForPayment and nothing else changes downstream.
//
// The camera half is the shared BarcodeScanDialog rather than a second scanner
// — it already handles camera flip, the native BarcodeDetector fast path and
// the ID-card barcode formats, and a USB scan gun needs no camera at all
// (it types into the search box above and presses Enter).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, ScanLine, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BarcodeScanDialog } from '@/components/scanner/barcode-scan-dialog';

import {
  SchoolBillPaymentService,
  SCHOOL_SEARCH_MIN_CHARS,
} from '@/lib/services/school-fees/school-bill-payment-service';
import type { SchoolLearnerForPayment } from '@/types/school-fees';

/** Long enough that a fast typist issues one query, not eight. */
const DEBOUNCE_MS = 300;

interface Props {
  institutionId: string;
  academicYearId: string;
  onSelect: (learner: SchoolLearnerForPayment) => void;
}

export function LearnerSearch({ institutionId, academicYearId, onSelect }: Props) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SchoolLearnerForPayment[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanLookup, setScanLookup] = useState(false);

  // Guards against a slow early query overwriting a later, more specific one.
  const requestRef = useRef(0);

  useEffect(() => {
    const query = term.trim();
    if (query.length < SCHOOL_SEARCH_MIN_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        const rows = await SchoolBillPaymentService.searchLearners(
          institutionId,
          academicYearId,
          query,
        );
        if (requestRef.current !== requestId) return;
        setResults(rows);
        setError(null);
      } catch (err) {
        if (requestRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        if (requestRef.current === requestId) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term, institutionId, academicYearId]);

  const choose = useCallback(
    (learner: SchoolLearnerForPayment) => {
      setTerm('');
      setResults([]);
      setError(null);
      onSelect(learner);
    },
    [onSelect],
  );

  /**
   * Resolve a scanned card to a learner.
   *
   * The dialog stays OPEN on a miss so the clerk can simply re-present the
   * card; closing it would make a mis-read cost four taps to retry.
   */
  const handleScan = useCallback(
    async (value: string) => {
      setScanLookup(true);
      try {
        const learner = await SchoolBillPaymentService.findByScannedCode(
          institutionId,
          academicYearId,
          value,
        );
        if (learner) {
          setScanOpen(false);
          choose(learner);
        } else {
          setError(`No learner in this school matches the scanned code "${value}".`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not resolve the scanned code');
      } finally {
        setScanLookup(false);
      }
    },
    [institutionId, academicYearId, choose],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by Roll Number, Registration Number or Student Name..."
            className="pl-9 pr-9"
            autoComplete="off"
          />
          {term ? (
            <button
              type="button"
              onClick={() => setTerm('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <Button type="button" variant="outline" onClick={() => setScanOpen(true)}>
          <ScanLine className="h-4 w-4 mr-2" />
          Scan QR
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Search failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {searching || scanLookup ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Loader2 className="h-4 w-4 animate-spin" />
          {scanLookup ? 'Looking up the scanned card…' : 'Searching…'}
        </div>
      ) : null}

      {!searching && term.trim().length >= SCHOOL_SEARCH_MIN_CHARS && results.length === 0 && !error ? (
        <Alert>
          <AlertTitle>Student not found</AlertTitle>
          <AlertDescription>
            No active learner in this school and academic year matches “{term.trim()}”.
          </AlertDescription>
        </Alert>
      ) : null}

      {results.length > 0 ? (
        <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
          {results.map((learner) => (
            <button
              key={learner.id}
              type="button"
              onClick={() => choose(learner)}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {learner.first_name} {learner.last_name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    Roll {learner.roll_number || '—'} • Reg {learner.register_number || '—'}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {[learner.class_name, learner.section_name].filter(Boolean).join(' • ') || 'No class'}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <BarcodeScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        title="Scan student ID"
        description="Point the camera at the barcode or QR code on the learner's ID card."
        onScan={handleScan}
      />
    </div>
  );
}
