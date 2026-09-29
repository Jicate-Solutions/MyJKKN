// @vitest-environment jsdom
//
// The "Download record (PDF)" button fetches first, so a 401 / 404 / 500 says
// something plain instead of the browser's own "Failed – Server problem".

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import {
  DownloadRecordButton,
  filenameFrom,
  messageForStatus,
} from '@/app/(routes)/meetings/[uid]/_components/download-record-button';

const fetchMock = vi.fn();
const createObjectURL = vi.fn((_blob: Blob) => 'blob:record');
const revokeObjectURL = vi.fn();
let clicked: Array<{ download: string; href: string | null }> = [];

beforeEach(() => {
  Object.values(toast).forEach((f) => f.mockReset());
  fetchMock.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  clicked = [];
  vi.stubGlobal('fetch', fetchMock);
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ download: this.download, href: this.getAttribute('href') });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('plain messages', () => {
  it('maps each failure to words a person can act on', () => {
    expect(messageForStatus(401)).toBe('Please sign in again.');
    expect(messageForStatus(404)).toBe('Nothing has been recorded for this meeting yet.');
    expect(messageForStatus(500)).toBe('Could not make the PDF — try again.');
    expect(messageForStatus(503)).toBe('Could not make the PDF — try again.');
  });

  it('reads the filename the route set, else a plain default', () => {
    expect(filenameFrom('attachment; filename="meeting-record-2026-09-01-kavya.pdf"')).toBe(
      'meeting-record-2026-09-01-kavya.pdf',
    );
    expect(filenameFrom(null)).toBe('meeting-record.pdf');
  });
});

// The first render pays for loading the component tree; under a full-suite run
// that alone can pass the 5 s default.
describe('DownloadRecordButton', { timeout: 30_000 }, () => {
  it.each([
    [401, 'Please sign in again.'],
    [404, 'Nothing has been recorded for this meeting yet.'],
    [500, 'Could not make the PDF — try again.'],
  ])('on %i shows "%s" and saves nothing', async (status, message) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'x' }), { status }));
    render(<DownloadRecordButton uid="abc 123" />);
    fireEvent.click(screen.getByRole('button', { name: /download record/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(fetchMock).toHaveBeenCalledWith('/api/meetings/record/abc%20123', expect.anything());
    expect(clicked).toEqual([]);
  });

  it('a network failure says try again', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    render(<DownloadRecordButton uid="abc" />);
    fireEvent.click(screen.getByRole('button', { name: /download record/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not make the PDF — try again.'));
  });

  it('on success saves the PDF under the route’s filename', async () => {
    // The body is a STRING, not `new Blob([...])`. Under this file's jsdom
    // environment `Blob` is jsdom's, which has no .stream(). Node 22's fetch
    // (undici 6, what CI runs) treats any object tagged "Blob" as a blob and
    // calls .stream() on it — "TypeError: object.stream is not a function" —
    // while Node 24+ silently turns it into the text "[object Blob]", so the
    // test passed locally while saving the wrong bytes. A string body reads the
    // same on every Node version, and the bytes are checked below.
    fetchMock.mockResolvedValue(
      new Response('%PDF-1.4', {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="meeting-record-2026-09-01-kavya.pdf"',
        },
      }),
    );
    render(<DownloadRecordButton uid="abc" />);
    fireEvent.click(screen.getByRole('button', { name: /download record/i }));
    await waitFor(() =>
      expect(clicked).toEqual([{ download: 'meeting-record-2026-09-01-kavya.pdf', href: 'blob:record' }]),
    );
    // What was saved is exactly what the route sent, as a PDF.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const saved = createObjectURL.mock.calls[0][0];
    expect(saved.type).toBe('application/pdf');
    expect(await saved.text()).toBe('%PDF-1.4');
    expect(toast.error).not.toHaveBeenCalled();
  });
});
