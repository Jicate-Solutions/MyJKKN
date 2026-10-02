import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plain state, not a vi.fn implementation: what the mocked re-encoder does next.
const encoder: { calls: File[]; fail: boolean } = { calls: [], fail: false };

vi.mock('@/lib/services/pde/strip-image-metadata', () => ({
  stripImageMetadata: async (file: File) => {
    encoder.calls.push(file);
    if (encoder.fail) throw new TypeError('source image could not be decoded');
    return {
      blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
      width: 10,
      height: 10,
    };
  },
}));

import { PHOTO_UNREADABLE, toJpeg } from '@/lib/instasolver/to-jpeg';

describe('toJpeg — any picked photo becomes a JPEG', () => {
  beforeEach(() => {
    encoder.calls = [];
    encoder.fail = false;
  });

  it('wraps the re-encoded bytes as an image/jpeg file', async () => {
    const picked = new File([new Uint8Array([1, 2, 3])], 'IMG_0001.PNG', { type: 'image/png' });

    const out = await toJpeg(picked);

    expect(encoder.calls).toEqual([picked]);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('photo.jpg');
    expect(out.size).toBe(3);
  });

  it('replaces any decode failure with one plain sentence', async () => {
    encoder.fail = true;
    const picked = new File([new Uint8Array([0])], 'broken.heic', { type: 'image/heic' });

    await expect(toJpeg(picked)).rejects.toThrow(PHOTO_UNREADABLE);
  });
});
