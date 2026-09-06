/**
 * Reference Data API Module Configuration
 * Endpoint documentation for the read-only master-data (Reference / Masters)
 * catalogs exposed to registered child apps.
 *
 * Only catalogs switched ON in the Reference hub registry
 * (reference_catalogs.api_enabled) are readable. Entries are ACTIVE-only.
 * There are no write endpoints by design — all editing happens inside
 * MyJKKN at /reference.
 */

import {
  ApiModuleConfig,
  ApiEndpoint,
  ApiParameter,
  ApiErrorResponse,
} from '@/lib/types/api-documentation';

const commonAuthentication = {
  type: 'bearer' as const,
  description:
    'API key required in Authorization header. Generate your API key from the API Management dashboard.',
  headerName: 'Authorization',
  example: 'Bearer your_api_key_here',
  scopes: ['read'],
};

const paginationParams: ApiParameter[] = [
  {
    name: 'limit',
    type: 'number',
    required: false,
    description: 'Number of entries per page (max 200)',
    example: 100,
    default: '100',
  },
  {
    name: 'offset',
    type: 'number',
    required: false,
    description: 'Number of entries to skip (for pagination)',
    example: 0,
    default: '0',
  },
];

const commonErrors: ApiErrorResponse[] = [
  {
    statusCode: 401,
    errorCode: 'UNAUTHORIZED',
    message: 'API key is required in Authorization header',
    description: 'The Authorization header is missing, malformed, or the key is invalid/expired.',
  },
  {
    statusCode: 403,
    errorCode: 'FORBIDDEN',
    message: 'API key does not have read permission',
    description: 'The key exists but read access has been turned off for it.',
  },
  {
    statusCode: 500,
    errorCode: 'INTERNAL_ERROR',
    message: 'Failed to load catalogs',
    description: 'Unexpected server error. Retry with backoff; contact support if it persists.',
  },
];

const listCatalogsEndpoint: ApiEndpoint = {
  id: 'reference-catalogs-list',
  module: 'reference',
  category: 'catalogs',
  title: 'List available catalogs',
  description:
    'Returns the directory of master-data catalogs your app can read — each with its key, name, group, and live entry count. Only catalogs switched ON for API access appear here; new catalogs are OFF by default until enabled by an administrator.',
  method: 'GET',
  path: '/api/reference/catalogs',
  authentication: commonAuthentication,
  queryParameters: [],
  successResponses: [
    {
      statusCode: 200,
      description: 'Directory of readable catalogs',
      example: JSON.stringify(
        {
          catalogs: [
            {
              catalog_key: 'community_categories',
              name: 'Community categories',
              description: 'Community category lookup (OC/BC/MBC/SC/ST…)',
              group: 'Admission',
              entry_count: 10,
            },
            {
              catalog_key: 'cdc_drive_types',
              name: 'Drive types',
              description: 'Placement drive types',
              group: 'CDC & Training',
              entry_count: 5,
            },
          ],
        },
        null,
        2
      ),
    },
  ],
  errorResponses: commonErrors,
  codeExamples: [
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -H "Authorization: Bearer your_api_key_here" \\
  https://www.jkkn.ai/api/reference/catalogs`,
    },
    {
      language: 'javascript',
      label: 'JavaScript',
      code: `const res = await fetch('https://www.jkkn.ai/api/reference/catalogs', {
  headers: { Authorization: 'Bearer ' + process.env.MYJKKN_API_KEY },
});
const { catalogs } = await res.json();`,
    },
  ],
  tags: ['reference', 'master-data', 'read-only'],
  notes: [
    'Read-only: there are no write endpoints for reference data. Entries are managed inside MyJKKN at /reference.',
    'Entry counts include active entries only.',
  ],
};

const catalogEntriesEndpoint: ApiEndpoint = {
  id: 'reference-catalog-entries',
  module: 'reference',
  category: 'catalogs',
  title: 'Get catalog entries',
  description:
    'Returns the ACTIVE entries of one catalog (deactivated entries are hidden — your app sees exactly what MyJKKN forms see). Field set varies per catalog and mirrors what the Reference hub displays. Catalogs not switched ON for API access return 404.',
  method: 'GET',
  path: '/api/reference/catalogs/{catalog_key}',
  authentication: commonAuthentication,
  pathParameters: [
    {
      name: 'catalog_key',
      type: 'string',
      required: true,
      description: 'Catalog key from the directory endpoint',
      example: 'community_categories',
    },
  ],
  queryParameters: [
    {
      name: 'search',
      type: 'string',
      required: false,
      description: "Case-insensitive search on the catalog's name/label column",
      example: 'BC',
    },
    ...paginationParams,
  ],
  successResponses: [
    {
      statusCode: 200,
      description: 'Catalog entries (active only), paginated',
      example: JSON.stringify(
        {
          catalog_key: 'community_categories',
          name: 'Community categories',
          rows: [
            { id: 'uuid', code: 'OC', name: 'OC', sort_order: 10, is_active: true },
            { id: 'uuid', code: 'BC', name: 'BC', sort_order: 20, is_active: true },
          ],
          total: 10,
          limit: 100,
          offset: 0,
        },
        null,
        2
      ),
    },
  ],
  errorResponses: [
    {
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: 'Catalog not found or not available through the API',
      description:
        'The catalog key is unknown OR the catalog exists but has not been switched ON for API access.',
    },
    ...commonErrors,
  ],
  codeExamples: [
    {
      language: 'curl',
      label: 'cURL',
      code: `curl -H "Authorization: Bearer your_api_key_here" \\
  "https://www.jkkn.ai/api/reference/catalogs/community_categories?limit=50"`,
    },
    {
      language: 'javascript',
      label: 'JavaScript',
      code: `const res = await fetch(
  'https://www.jkkn.ai/api/reference/catalogs/community_categories?limit=50',
  { headers: { Authorization: 'Bearer ' + process.env.MYJKKN_API_KEY } }
);
const { rows, total } = await res.json();`,
    },
  ],
  tags: ['reference', 'master-data', 'read-only', 'pagination'],
  notes: [
    'Deactivated entries never appear — retire an entry in the Reference hub and it disappears from this API at the same moment.',
    'Maximum page size is 200 entries; use offset to paginate larger catalogs.',
  ],
};

export const referenceModuleConfig: ApiModuleConfig = {
  moduleName: 'Reference Data',
  moduleDescription:
    'Read-only access to MyJKKN master-data catalogs (community categories, castes, quotas, CDC types, and more). Data comes live from the same tables the Reference / Masters hub manages — an entry added there is available here immediately.',
  baseUrl: 'https://www.jkkn.ai',
  endpoints: [listCatalogsEndpoint, catalogEntriesEndpoint],
  authenticationOverview:
    'All endpoints require an Application Hub API key as a Bearer token. Keys are issued per app from the API Management dashboard and can be revoked at any time.',
  generalNotes: [
    'Read-only by design: reference data is edited only inside MyJKKN (/reference), where permissions and audit trails apply.',
    'Per-catalog opt-in: administrators choose which catalogs are exposed. New catalogs are OFF by default.',
    'Active entries only: what your app sees always matches what MyJKKN forms show.',
  ],
};
