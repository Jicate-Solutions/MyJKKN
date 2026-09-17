/**
 * OneMark AI drafting — the prompt's DOCUMENTED input shape must match the
 * payload the code ACTUALLY sends.
 *
 * Migration 20261120150000 rewrites the template's "INPUT (JSON):" line so it
 * names the labels PR #3378 started sending (exam_label, topic_label,
 * tag_labels) beside the six machine fields. This file is the guard that stops
 * the two drifting apart again: it reads the SQL, pulls the key list out of the
 * documented line, and compares it with `Object.keys(...)` of what
 * buildDraftPayload puts in `payload.prompt`. Add a field to one side without
 * the other and this fails.
 *
 * It also holds the migration's own preconditions against the repo's copy of
 * the template (20260918101500): every sentence the migration replace()s must
 * still exist verbatim there, otherwise the asserting DO block RAISEs on apply.
 *
 * CONTRACT tests only — they read SQL text; there is no Postgres in CI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDraftPayload, type DraftJobPayload, type DraftJobLabels } from '@/lib/services/onemark/draft-contract';

const BASE_SQL = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260918101500_onemark_wave2_rpcs_pools_jobtype_owners.sql'),
  'utf8',
);
const LABELS_SQL = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20261120150000_onemark_item_draft_contract_labels.sql'),
  'utf8',
);

/** A PL/pgSQL `name text := '...';` literal, with '' unescaped to '. */
function plpgsqlLiteral(sql: string, name: string): string {
  const m = sql.match(new RegExp(`${name}\\s+text\\s*:=\\s*'((?:[^']|'')*)';`, 's'));
  if (!m) throw new Error(`no text literal named ${name} in the migration`);
  return m[1].replace(/''/g, "'");
}

/** The key names a documented `INPUT (JSON): {...}` line enumerates, in order. */
function documentedKeys(inputLine: string): string[] {
  expect(inputLine.startsWith('INPUT (JSON): {')).toBe(true);
  const json = inputLine.slice('INPUT (JSON): '.length, inputLine.indexOf('}') + 1);
  return Array.from(json.matchAll(/"([a-z_]+)":/g), (m) => m[1]);
}

const ctx: DraftJobPayload = {
  exam_definition_id: '11111111-1111-4111-8111-111111111111',
  exam_key: 'tn_hsc_physics',
  topic_id: '22222222-2222-4222-8222-222222222222',
  tag_keys: ['numerical'],
  count: 5,
  bloom_level: 'K2',
};
const labels: DraftJobLabels = {
  exam_label: 'TN State Board — HSC Physics (Class 12)',
  topic_label: 'Unit 1: Electrostatics',
  tag_labels: ['Numerical'],
};

const sentKeys = Object.keys(JSON.parse(buildDraftPayload(ctx, labels).prompt));
const oldInput = plpgsqlLiteral(LABELS_SQL, 'v_old_input');
const newInput = plpgsqlLiteral(LABELS_SQL, 'v_new_input');

describe('onemark.item_draft — documented input vs the payload the code sends', () => {
  it('the rewritten INPUT (JSON) line names exactly the keys buildDraftPayload sends, in order', () => {
    expect(documentedKeys(newInput)).toEqual(sentKeys);
  });

  it('the ORIGINAL INPUT (JSON) line was the machine shape alone — the drift this migration closes', () => {
    expect(documentedKeys(oldInput)).toEqual(Object.keys(ctx));
    // and it is what an older caller (no labels) still sends
    expect(Object.keys(JSON.parse(buildDraftPayload(ctx).prompt))).toEqual(Object.keys(ctx));
  });

  it('the Run card label (input_schema) names every key that is sent', () => {
    const m = LABELS_SQL.match(/'label',\s*'((?:[^']|'')*)'/);
    expect(m).not.toBeNull();
    const label = m![1].replace(/''/g, "'");
    for (const k of sentKeys) expect(label).toContain(k);
  });

  it('tells the model the labels are what to draft from and the ids carry no meaning', () => {
    expect(newInput).toMatch(/topic_label/);
    expect(newInput).toMatch(/uuids are identifiers only/);
  });
});

describe('20261120150000 preconditions hold against the repo template (20260918101500)', () => {
  // The migration replace()s three sentences inside an asserting DO block and
  // RAISEs if any has moved. The repo's own INSERT of the template is the
  // reference copy; if a later migration edits one of these sentences, this
  // test — not a failed production apply — is where it shows.
  it('the INPUT (JSON) line the migration replaces is the one the template was inserted with', () => {
    const line = BASE_SQL.match(/^INPUT \(JSON\): \{.*\}$/m);
    expect(line).not.toBeNull();
    expect(line![0]).toBe(oldInput);
  });

  it('the on-unit rule and the source= sentence are still verbatim in the template', () => {
    expect(BASE_SQL).toContain(plpgsqlLiteral(LABELS_SQL, 'v_old_unit'));
    expect(BASE_SQL).toContain(plpgsqlLiteral(LABELS_SQL, 'v_old_src'));
  });

  it('no other migration rewrites the INPUT (JSON) line between the two', () => {
    // Only the base INSERT and this migration may carry the line; 20260918150000
    // (slot rename) and 20260918160000 (answer-position append) must not.
    for (const f of [
      'supabase/migrations/20260918150000_onemark_item_draft_prompt_slot.sql',
      'supabase/migrations/20260918160000_onemark_answer_position_bias.sql',
    ]) {
      const sql = readFileSync(path.resolve(process.cwd(), f), 'utf8');
      expect(sql).not.toContain('INPUT (JSON):');
    }
  });

  it("the migration's replacement writes source='ai_generated', which is what toDraftRow writes", () => {
    expect(plpgsqlLiteral(LABELS_SQL, 'v_new_src')).toBe("source='ai_generated'");
    const contract = readFileSync(path.resolve(process.cwd(), 'lib/services/onemark/draft-contract.ts'), 'utf8');
    expect(contract).toMatch(/source:\s*'ai_generated'/);
  });
});
