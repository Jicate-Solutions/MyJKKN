// lib/validations/events-marathon.ts
import { z } from 'zod';

export const createSponsorSchema = z.object({
  event_id: z.string().uuid(),
  company_name: z.string().min(2).max(200),
  contact_person: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  website: z.string().url().optional(),
  tier: z.enum(['prospect', 'contacted', 'negotiating', 'committed', 'platinum', 'gold', 'silver', 'bronze', 'in_kind']).optional(),
  amount_pledged: z.number().min(0).optional(),
  benefits: z.string().optional(),
  pipeline_stage: z.enum(['lead', 'contacted', 'proposal_sent', 'negotiating', 'committed', 'declined', 'churned']).optional(),
});

export const createCommitteeSchema = z.object({
  event_id: z.string().uuid(),
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  lead_id: z.string().uuid().optional(),
  lead_name: z.string().optional(),
  member_ids: z.array(z.string().uuid()).optional(),
  member_names: z.array(z.string()).optional(),
});

export const createTaskSchema = z.object({
  committee_id: z.string().uuid(),
  event_id: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assigned_to: z.string().uuid().optional(),
  assigned_to_name: z.string().optional(),
  due_date: z.string().optional(),
});

export const createBudgetItemSchema = z.object({
  event_id: z.string().uuid(),
  category: z.string().min(1),
  description: z.string().min(2),
  type: z.enum(['income', 'expense']),
  estimated_amount: z.number().min(0),
  vendor: z.string().optional(),
  notes: z.string().optional(),
});

export const createIncidentSchema = z.object({
  event_id: z.string().uuid(),
  type: z.enum(['medical', 'logistics', 'security', 'weather', 'technical', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(2),
  description: z.string().optional(),
  location: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  bib_number: z.string().optional(),
});

export const gpsSyncSchema = z.object({
  event_id: z.string().uuid(),
  bib: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  distance_km: z.number().min(0),
  pace_per_km: z.number().min(0),
  elapsed_seconds: z.number().int().min(0),
  altitude: z.number().optional(),
  heading: z.number().optional(),
  speed: z.number().optional(),
  points: z.array(z.object({
    lat: z.number(),
    lng: z.number(),
    speed: z.number().optional(),
    accuracy: z.number().optional(),
    altitude: z.number().optional(),
    timestamp: z.string(),
  })).optional(),
});

export const checkpointScanSchema = z.object({
  event_id: z.string().uuid(),
  bib_number: z.string().min(1),
  checkpoint_id: z.string().uuid(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type CreateSponsorInput = z.infer<typeof createSponsorSchema>;
export type CreateCommitteeInput = z.infer<typeof createCommitteeSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type CreateBudgetItemInput = z.infer<typeof createBudgetItemSchema>;
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type GPSSyncInput = z.infer<typeof gpsSyncSchema>;
export type CheckpointScanInput = z.infer<typeof checkpointScanSchema>;
