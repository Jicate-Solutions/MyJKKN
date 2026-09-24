// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeMemoContentType } from '../voice-memo-recorder';

describe('normalizeMemoContentType', () => {
  it('strips the codecs parameter from webm', () => {
    expect(normalizeMemoContentType('audio/webm;codecs=opus')).toBe('audio/webm');
  });

  it('strips the codecs parameter from mp4', () => {
    expect(normalizeMemoContentType('audio/mp4;codecs=mp4a.40.2')).toBe('audio/mp4');
  });

  it('leaves a bare MIME type unchanged', () => {
    expect(normalizeMemoContentType('audio/webm')).toBe('audio/webm');
  });

  it('falls back to the provided fallback when blobType is empty', () => {
    expect(normalizeMemoContentType('', 'audio/mp4')).toBe('audio/mp4');
  });

  it('falls back to audio/webm when neither blobType nor fallback is given', () => {
    expect(normalizeMemoContentType('')).toBe('audio/webm');
  });
});
