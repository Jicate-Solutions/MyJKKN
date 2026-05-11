/**
 * Browser-side helper to trigger download of a markdown document.
 *
 * Uses the standard Blob + anchor pattern — works in every modern browser
 * without any extra dependencies. The anchor is created, clicked, and
 * removed synchronously; the URL is revoked on the next tick to give the
 * browser time to start the download.
 */
export function triggerMarkdownDownload(filename: string, content: string): void {
  if (typeof window === 'undefined') return;

  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
