/**
 * Splits pasted text (typically an Excel column/row) into distinct, lowercased
 * email-looking tokens. Separators: newlines, tabs, commas, semicolons, spaces.
 */
export function parsePastedEmails(text: string): string[] {
  const out = new Set<string>();
  text
    .split(/[\s,;]+/)
    .map((t) => t.trim().replace(/^<|>$/g, '').toLowerCase())
    .filter((t) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t))
    .forEach((t) => out.add(t));
  return Array.from(out);
}
