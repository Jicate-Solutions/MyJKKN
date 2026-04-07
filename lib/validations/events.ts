// lib/validations/events.ts
import { z } from 'zod';

export const createEventSchema = z.object({
  institution_id: z.string().uuid(),
  event_type: z.enum(['marathon', 'cultural_fest', 'seminar', 'workshop', 'sports_day', 'conference']),
  name: z.string().min(3).max(200),
  slug: z.string().min(3).max(200).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only'),
  description: z.string().optional(),
  theme: z.string().optional(),
  tagline: z.string().optional(),
  event_date: z.string().optional(),
  start_time: z.string().optional(),
  venue: z.string().optional(),
  venue_address: z.string().optional(),
  year: z.number().int().optional(),
  target_registrations: z.number().int().positive().optional(),
  max_registrations: z.number().int().positive().optional(),
  is_public: z.boolean().optional(),
  allow_external_registration: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  registration_config: z.record(z.unknown()).optional(),
  branding_config: z.record(z.unknown()).optional(),
});

export const updateEventSchema = createEventSchema.partial().extend({
  status: z.enum(['draft', 'planning', 'preparation', 'execution', 'live', 'post_event', 'archived', 'cancelled']).optional(),
  registration_open_date: z.string().optional(),
  registration_close_date: z.string().optional(),
  hero_image_url: z.string().url().optional().nullable(),
  hero_video_url: z.string().url().optional().nullable(),
  route_config: z.record(z.unknown()).optional(),
});

export const createCategorySchema = z.object({
  event_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  code: z.string().max(10).optional(),
  description: z.string().optional(),
  distance_km: z.number().positive().optional(),
  max_participants: z.number().int().positive().optional(),
  min_age: z.number().int().min(0).optional(),
  max_age: z.number().int().max(150).optional(),
  fee_amount: z.number().min(0).optional(),
  early_bird_fee: z.number().min(0).optional(),
  early_bird_deadline: z.string().optional(),
  sort_order: z.number().int().optional(),
});

export const publicRegistrationSchema = z.object({
  event_id: z.string().uuid(),
  category_id: z.string().uuid(),
  participant_name: z.string().min(2).max(200),
  participant_phone: z.string().min(10).max(15),
  participant_email: z.string().email().optional(),
  participant_age: z.number().int().min(1).max(150).optional(),
  participant_gender: z.enum(['male', 'female', 'other']).optional(),
  participant_type: z.enum(['internal', 'external']),
  institution_name: z.string().optional(),
  department: z.string().optional(),
  custom_data: z.record(z.unknown()).optional(),
  discount_code: z.string().optional(),
  source: z.string().optional(),
  referral_source: z.string().optional(),
  // For internal users
  profile_id: z.string().uuid().optional(),
  learner_id: z.string().uuid().optional(),
  institution_id: z.string().uuid().optional(),
  // For external users
  organization: z.string().optional(),
  city: z.string().optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;
