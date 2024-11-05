import * as z from 'zod';

export const categorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  display_order: z.number().int().min(0, 'Display order must be 0 or greater'),
  is_active: z.boolean().default(true)
});

export const subcategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().nullable(), // Changed to match your schema
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean().default(true),
  category_id: z.string().uuid()
});

export type CategoryFormValues = z.infer<typeof categorySchema>;
export type SubcategoryFormValues = z.infer<typeof subcategorySchema>;
