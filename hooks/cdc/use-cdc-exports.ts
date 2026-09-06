// CDC Export hooks — agent ζ Sprint 7b
'use client';

import { useState } from 'react';
import type { ExportFormat, FlexExportRequest } from '@/types/cdc/exports';

interface UseExportState {
  loading: boolean;
  error: string | null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useNaacExport() {
  const [state, setState] = useState<UseExportState>({
    loading: false,
    error: null,
  });

  async function exportNaac(cycle: string, format: ExportFormat) {
    setState({ loading: true, error: null });
    try {
      const res = await fetch('/api/cdc/exports/naac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle, format }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error ?? 'Export failed');
      }

      const filename =
        res.headers.get('x-filename') ?? `naac_${cycle}.${format}`;
      const blob = await res.blob();
      downloadBlob(blob, filename);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: (e as Error).message });
    }
  }

  return { exportNaac, ...state };
}

export function useAicteExport() {
  const [state, setState] = useState<UseExportState>({
    loading: false,
    error: null,
  });

  async function exportAicte(year: number, format: ExportFormat) {
    setState({ loading: true, error: null });
    try {
      const res = await fetch('/api/cdc/exports/aicte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, format }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error ?? 'Export failed');
      }

      const filename =
        res.headers.get('x-filename') ?? `aicte_${year}.${format}`;
      const blob = await res.blob();
      downloadBlob(blob, filename);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: (e as Error).message });
    }
  }

  return { exportAicte, ...state };
}

// BUG-004082 — bundle offer-letter proof documents into a ZIP.
// Fetches the manifest from the CDC-staff-gated route, then fetches each
// public cdc-docs URL in the browser and zips them with jszip. Returns a
// status message so the page can toast "no proofs found" / errors.
interface UseProofsZipState extends UseExportState {
  message: string | null;
}

export function useProofsZip() {
  const [state, setState] = useState<UseProofsZipState>({
    loading: false,
    error: null,
    message: null,
  });

  async function downloadProofsZip() {
    setState({ loading: true, error: null, message: null });
    try {
      const res = await fetch('/api/cdc/exports/proofs-zip', { method: 'GET' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to list proofs' }));
        throw new Error(err.error ?? 'Failed to list proofs');
      }

      const { proofs } = (await res.json()) as {
        proofs: { url: string; filename: string }[];
      };

      if (!proofs || proofs.length === 0) {
        setState({
          loading: false,
          error: null,
          message: 'No offer-letter documents found to bundle.',
        });
        return;
      }

      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();

      let added = 0;
      const failed: string[] = [];
      // Fetch each public cdc-docs URL and add to the zip. A single broken URL
      // shouldn't sink the whole bundle — collect failures and report them.
      await Promise.all(
        proofs.map(async (p) => {
          try {
            const fileRes = await fetch(p.url);
            if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
            const blob = await fileRes.blob();
            zip.file(p.filename, blob);
            added += 1;
          } catch {
            failed.push(p.filename);
          }
        })
      );

      if (added === 0) {
        throw new Error('Could not fetch any offer-letter documents.');
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const ts = new Date().toISOString().slice(0, 10);
      downloadBlob(zipBlob, `naac_8_2_proofs_${ts}.zip`);

      const message =
        failed.length > 0
          ? `Bundled ${added} proof${added === 1 ? '' : 's'} (${failed.length} could not be fetched).`
          : `Bundled ${added} proof${added === 1 ? '' : 's'}.`;
      setState({ loading: false, error: null, message });
    } catch (e) {
      setState({ loading: false, error: (e as Error).message, message: null });
    }
  }

  return { downloadProofsZip, ...state };
}

export function useFlexExport() {
  const [state, setState] = useState<UseExportState>({
    loading: false,
    error: null,
  });

  async function exportFlex(req: FlexExportRequest) {
    setState({ loading: true, error: null });
    try {
      const res = await fetch('/api/cdc/exports/flex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error ?? 'Export failed');
      }

      const filename =
        res.headers.get('x-filename') ??
        `flex_${req.table}.${req.format}`;
      const blob = await res.blob();
      downloadBlob(blob, filename);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: (e as Error).message });
    }
  }

  return { exportFlex, ...state };
}
