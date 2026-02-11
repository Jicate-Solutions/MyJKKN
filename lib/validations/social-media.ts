/**
 * Social Media Module — Zod Validation Schemas
 */

import { z } from 'zod';

// ─── Enum Schemas ────────────────────────────────────────────────────────────

export const SmPlatformSchema = z.enum([
  'instagram', 'youtube', 'facebook', 'linkedin',
  'google_business', 'twitter',
  'pinterest', 'snapchat',
  'threads', 'reddit', 'tumblr', 'quora',
]);

export const SmHealthStatusSchema = z.enum(['green', 'yellow', 'red', 'dormant']);

export const SmContentTypeSchema = z.enum([
  'image_post', 'video_post', 'carousel', 'reel', 'story',
  'youtube_video', 'youtube_short',
  'tweet', 'thread', 'article',
  'gmb_update', 'gmb_offer', 'gmb_event',
]);

// ─── Account Schemas ─────────────────────────────────────────────────────────

export const createSmAccountSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  department_id: z.string().uuid('Invalid department ID').optional(),
  platform: SmPlatformSchema,
  username: z.string().min(1, 'Username is required').max(100),
  display_name: z.string().max(200).optional(),
  profile_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  account_type: z.string().max(50).optional(),
});

export const updateSmAccountSchema = z.object({
  display_name: z.string().max(200).optional(),
  profile_url: z.string().url().optional().or(z.literal('')),
  profile_pic_url: z.string().url().optional().or(z.literal('')),
  bio: z.string().max(2000).optional(),
  website_url: z.string().url().optional().or(z.literal('')),
  account_type: z.string().max(50).optional(),
  is_verified: z.boolean().optional(),
  is_connected: z.boolean().optional(),
  health_status: SmHealthStatusSchema.optional(),
  health_score: z.number().int().min(0).max(100).optional(),
});

// ─── Manual Entry Schema ─────────────────────────────────────────────────────

export const createManualEntrySchema = z.object({
  account_id: z.string().uuid('Invalid account ID'),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  followers_count: z.number().int().min(0).optional(),
  likes_count: z.number().int().min(0).optional(),
  posts_count: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

// ─── Filter Schemas ──────────────────────────────────────────────────────────

export const smAccountFiltersSchema = z.object({
  institution_id: z.string().uuid(),
  platform: SmPlatformSchema.optional(),
  health_status: SmHealthStatusSchema.optional(),
  department_id: z.string().uuid().optional(),
  is_connected: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const smSnapshotFiltersSchema = z.object({
  institution_id: z.string().uuid(),
  account_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  source: z.enum(['auto_api', 'manual_entry']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const smPostMetricFiltersSchema = z.object({
  institution_id: z.string().uuid(),
  account_id: z.string().uuid().optional(),
  post_type: SmContentTypeSchema.optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  sort_by: z.enum(['engagement_rate', 'likes_count', 'comments_count', 'posted_at']).default('posted_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Type Inference ──────────────────────────────────────────────────────────

export type CreateSmAccountInput = z.infer<typeof createSmAccountSchema>;
export type UpdateSmAccountInput = z.infer<typeof updateSmAccountSchema>;
export type CreateManualEntryInput = z.infer<typeof createManualEntrySchema>;
export type SmAccountFiltersInput = z.infer<typeof smAccountFiltersSchema>;
