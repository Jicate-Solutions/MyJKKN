// File: types/admission-status.ts
import { z } from 'zod';

export type AdmissionStatusScope = 'lead' | 'learner';

export interface AdmissionStatus {
  id: string;
  scope: AdmissionStatusScope;
  code: string;
  label: string;
  description: string | null;
  color: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  is_terminal: boolean;
  is_seat_filled: boolean;
  fee_paid_threshold_percent: number | null;
  gates_login: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export const admissionStatusFormSchema = z.object({
  scope: z.enum(['lead', 'learner']),
  code: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, {
    message: 'Lowercase letters, digits, and underscores only; must start with a letter.',
  }),
  label: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Hex color like #22C55E' }),
  icon: z.string().max(64).nullable().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999),
  is_active: z.boolean().default(true),
  is_terminal: z.boolean().default(false),
  is_seat_filled: z.boolean().default(false),
  fee_paid_threshold_percent: z.coerce.number().min(0).max(100).nullable().optional(),
  gates_login: z.boolean().default(false),
}).refine(
  (v) => v.scope === 'learner' || v.fee_paid_threshold_percent == null,
  { path: ['fee_paid_threshold_percent'],
    message: 'Threshold only applies to learner scope.' }
).refine(
  (v) => v.scope === 'learner' || !v.gates_login,
  { path: ['gates_login'], message: 'Login gating only applies to learner scope.' }
).refine(
  (v) => v.scope === 'learner' || !v.is_seat_filled,
  { path: ['is_seat_filled'], message: 'Seat-filled flag only applies to learner scope.' }
);

export type AdmissionStatusFormInput = z.infer<typeof admissionStatusFormSchema>;
