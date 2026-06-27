/**
 * Instagram comments client — read the comments edge of a media object.
 *
 * Mirrors lib/instagram/stories-client.ts / api-client.ts getMedia: a thin
 * typed wrapper over graphRequestData for `GET /{media-id}/comments`. Used by
 * the feedback-spine IG-comments adapter to pull comment TEXT (not just the
 * count) into feedback_events.
 */

import { graphRequestData } from '@/lib/meta/graph-api-client';
import type { IgCallConfig } from '@/lib/instagram/api-client';

export interface IgComment {
  id: string;
  text?: string | null;
  username?: string | null;
  timestamp?: string | null;
  like_count?: number | null;
}

export interface IgCommentsEnvelope {
  data: IgComment[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

/** GET /{media-id}/comments — one page (default 50). Paginate via options.after. */
export async function getMediaComments(
  mediaId: string,
  config: IgCallConfig,
  options?: { limit?: number; after?: string }
): Promise<IgCommentsEnvelope> {
  return graphRequestData<IgCommentsEnvelope>({
    endpoint: `/${mediaId}/comments`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      fields: 'id,text,username,timestamp,like_count',
      limit: options?.limit ?? 50,
      after: options?.after,
    },
    sentryOp: 'http.client',
    sentrySpanName: 'getMediaComments',
  });
}
