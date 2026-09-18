import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordFeatureUse, FEATURE_KEYS } from '@/lib/usage/record';

/**
 * BUG-006178 — labelled features whose core action recorded nothing, so the
 * adoption loop showed them "not measured".
 *
 * Two layers: the helper really sends the key to fn_feature_used, and each
 * route calls it at its core action, only when the action happened. The
 * source check strips comments first so a mention in prose cannot satisfy it.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

describe('adoption loop — resource-management features record their use', () => {
  it('registers the two keys exactly as feature_registry spells them', () => {
    expect(FEATURE_KEYS.RESOURCES_MESSAGE_BOOKED_USERS).toBe('resources.message_booked_users');
    expect(FEATURE_KEYS.RESOURCES_TAG_COLLEAGUE).toBe('resources.tag_colleague');
  });

  it('sends the key to fn_feature_used and never throws when the call fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(
      recordFeatureUse({ rpc }, FEATURE_KEYS.RESOURCES_MESSAGE_BOOKED_USERS),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('fn_feature_used', {
      p_feature_key: 'resources.message_booked_users',
    });

    const failing = vi.fn().mockRejectedValue(new Error('network'));
    await expect(
      recordFeatureUse({ rpc: failing }, FEATURE_KEYS.RESOURCES_TAG_COLLEAGUE),
    ).resolves.toBe(false);
  });

  it('the message route records a use on the session client, only when the message was delivered', () => {
    const src = read('app/api/resource-management/reservations/communicate/route.ts');
    // `sent` counts log rows; a logged-but-undelivered message is not a use.
    expect(src).not.toMatch(/if\s*\(\s*sent\s*>\s*0\s*\)\s*\{\s*await recordFeatureUse/);
    expect(src).toMatch(
      /if\s*\(\s*notified\s*>\s*0\s*\)\s*\{\s*await recordFeatureUse\(\s*session\s*,\s*FEATURE_KEYS\.RESOURCES_MESSAGE_BOOKED_USERS\s*\)/,
    );
  });

  it('the tag route records a use on the session client, only when this call created a tag', () => {
    // `created` itself is exercised in lib/services/shared/__tests__/comment-mention-alerts.test.ts
    const src = read('app/api/resource-management/reservations/[id]/comment-mentions/route.ts');
    expect(src).toMatch(
      /if\s*\(\s*outcome\.created\.length\s*>\s*0\s*\)\s*\{\s*await recordFeatureUse\(\s*db\s*,\s*FEATURE_KEYS\.RESOURCES_TAG_COLLEAGUE\s*\)/,
    );
  });
});
