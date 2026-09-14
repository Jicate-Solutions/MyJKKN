/**
 * OneMark — drawing practice from the sources a learner ticked.
 *
 * Director ruling (c) of 2026-09-06. The one failure this file exists to stop:
 * a learner who ticks nothing gets EVERY source, never an empty sitting. The
 * naive version of this feature (`.in('source_key', keys)` with an empty array)
 * returns zero rows and looks exactly like a bank with nothing in it.
 *
 * These functions are the contract POST /api/foundation/onemark/attempts will
 * call — that route belongs to Lane L, so the rules are tested here against
 * fixtures rather than against the route.
 */
import { describe, it, expect } from 'vitest';
import {
  practiceSourceFilter,
  requestedSourceKeys,
  shortDrawMessage,
  sourceKeysFromConfig,
  usesSourceOverload,
  vaultDrawArgs,
  withSourceConfig,
} from '@/lib/services/onemark/sources-draw';

const KNOWN = ['textbook_back', 'past_board_exam', 'district_revision', 'model_paper', 'internal'];

describe('requestedSourceKeys', () => {
  it('reads a genuine subset off the body', () => {
    expect(requestedSourceKeys({ source_keys: ['internal', 'model_paper'] }, KNOWN)).toEqual([
      'internal',
      'model_paper',
    ]);
  });

  it('reads a missing, null or non-array field as "every source"', () => {
    expect(requestedSourceKeys({}, KNOWN)).toEqual([]);
    expect(requestedSourceKeys({ source_keys: null }, KNOWN)).toEqual([]);
    expect(requestedSourceKeys({ source_keys: 'internal' }, KNOWN)).toEqual([]);
    expect(requestedSourceKeys(null, KNOWN)).toEqual([]);
  });

  it('drops a stale key from an old tab rather than failing the sitting', () => {
    expect(requestedSourceKeys({ source_keys: ['internal', 'retired_last_year'] }, KNOWN)).toEqual(['internal']);
  });

  it('normalises "all ticked" back to "every source"', () => {
    expect(requestedSourceKeys({ source_keys: [...KNOWN] }, KNOWN)).toEqual([]);
  });
});

describe('practiceSourceFilter — the empty-array trap', () => {
  it('returns null for no filter, so the caller SKIPS the .in() instead of passing []', () => {
    expect(practiceSourceFilter([])).toBeNull();
  });

  it('returns a copy of the keys for a real filter', () => {
    const keys = ['internal'];
    const filter = practiceSourceFilter(keys);
    expect(filter).toEqual(['internal']);
    expect(filter).not.toBe(keys);
  });
});

describe('vaultDrawArgs — three arguments, or four', () => {
  const base = { studentId: 's1', examDefinitionId: 'e1', count: 15 };

  it('sends the live three-argument call when nothing was ticked', () => {
    const args = vaultDrawArgs({ ...base, sourceKeys: [] });
    expect(Object.keys(args).sort()).toEqual(['p_count', 'p_exam_definition_id', 'p_student_id']);
    expect(usesSourceOverload([])).toBe(false);
  });

  it('reaches for the four-argument overload only when a filter exists', () => {
    const args = vaultDrawArgs({ ...base, sourceKeys: ['internal'] });
    expect(args.p_source_keys).toEqual(['internal']);
    expect(usesSourceOverload(['internal'])).toBe(true);
  });

  it('passes the identifiers through untouched', () => {
    expect(vaultDrawArgs({ ...base, sourceKeys: [] })).toMatchObject({
      p_student_id: 's1',
      p_exam_definition_id: 'e1',
      p_count: 15,
    });
  });
});

describe('withSourceConfig — what the sitting records', () => {
  it('writes the keys so the evidence screen can read back what was asked for', () => {
    expect(withSourceConfig({ onemark: true }, ['internal'])).toEqual({
      onemark: true,
      source_keys: ['internal'],
    });
  });

  it('REMOVES the key for "every source", so an unfiltered sitting looks the same as one recorded before this existed', () => {
    expect(withSourceConfig({ onemark: true, source_keys: ['old'] }, [])).toEqual({ onemark: true });
  });

  it('handles a null or absent config without inventing one', () => {
    expect(withSourceConfig(null, [])).toEqual({});
    expect(withSourceConfig(undefined, ['internal'])).toEqual({ source_keys: ['internal'] });
  });

  it('never mutates the config it was handed', () => {
    const config = { onemark: true };
    withSourceConfig(config, ['internal']);
    expect(config).toEqual({ onemark: true });
  });
});

describe('sourceKeysFromConfig', () => {
  it('reads the keys back off a stored sitting', () => {
    expect(sourceKeysFromConfig({ source_keys: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('reads anything malformed as "every source" rather than throwing', () => {
    for (const bad of [null, undefined, 7, 'x', {}, { source_keys: 'a' }]) {
      expect(sourceKeysFromConfig(bad)).toEqual([]);
    }
    expect(sourceKeysFromConfig({ source_keys: ['a', 7, '', null] })).toEqual(['a']);
  });
});

describe('shortDrawMessage — a narrow tick is explained, never silently short', () => {
  it('says nothing when the draw was full', () => {
    expect(shortDrawMessage({ requested: 15, served: 15, sourceLabels: ['Model paper'] })).toBeNull();
  });

  it('says nothing when no filter was applied — a short draw then is the vault working normally', () => {
    expect(shortDrawMessage({ requested: 15, served: 3, sourceLabels: [] })).toBeNull();
  });

  it('names the filter when it produced nothing at all', () => {
    const msg = shortDrawMessage({ requested: 15, served: 0, sourceLabels: ['Model paper'] });
    expect(msg).toMatch(/No questions are available from Model paper/);
    expect(msg).toMatch(/Untick/);
  });

  it('reports the real number when it produced some, and promises no substitutes', () => {
    const msg = shortDrawMessage({
      requested: 15,
      served: 4,
      sourceLabels: ['Model paper', 'Internal'],
    });
    expect(msg).toMatch(/Only 4 of the 15/);
    expect(msg).toMatch(/Model paper and Internal/);
    expect(msg).toMatch(/never questions from somewhere else/);
  });
});
