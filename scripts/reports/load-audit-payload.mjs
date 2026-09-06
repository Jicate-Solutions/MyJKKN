/**
 * Extracts the JSON payload from a saved Supabase MCP tool-result file.
 *
 * The file is a JSON envelope whose `result` field is a human-readable string
 * wrapping the actual rows between <untrusted-data-UUID> boundaries. We take the
 * substring between the first and last boundary marker and parse the row array.
 */
import fs from 'node:fs';

export function loadPayload(file) {
  const raw = fs.readFileSync(file, 'utf8');

  // The envelope is itself JSON; parsing it un-escapes the inner newlines/quotes.
  let inner;
  try {
    inner = JSON.parse(raw).result;
  } catch {
    inner = raw;
  }

  const open = inner.indexOf('>\n');
  const close = inner.lastIndexOf('\n</untrusted-data-');
  const body = inner.slice(open + 2, close).trim();

  const rows = JSON.parse(body);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('payload: expected a non-empty row array');
  }
  return rows[0].payload ?? rows[0];
}

// Structure of each record, so callers read fields by name rather than index.
export const SUMMARY = [
  'institution', 'onboarded', 'billed', 'notBilled', 'evaluable',
  'dimsIncomplete', 'noStructure', 'matches', 'mismatched', 'expected', 'actual'
];
export const STRUCTURE = [
  'institution', 'sid', 'programme', 'quota', 'communities',
  'gender', 'accommodation', 'learners', 'lines'
];
export const LEARNER = [
  'institution', 'name', 'idn', 'sid', 'community',
  'nBills', 'billed', 'paid', 'expected', 'badLines'
];

export const asObjects = (rows, keys) =>
  (rows || []).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
