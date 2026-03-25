import { z } from 'zod';

/**
 * Schema for validating the search parameters for the applications table.
 */
export const applicationsSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for applications
  category: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  integration_type: z.enum(['direct_link', 'embedded', 'api']).optional(),
  auth_method: z.enum(['sso', 'separate_login', 'none']).optional(),
  platform: z.enum(['web', 'mobile', 'both']).optional(),
  uses_parent_auth: z.enum(['true', 'false']).optional()
});

export type ApplicationsSearchParams = z.infer<typeof applicationsSearchParamsSchema>;
