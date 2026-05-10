interface AcademicQueryParam {
  name: string;
  type: string;
  description: string;
}

interface AcademicEndpoint {
  method: string;
  path: string;
  description: string;
  queryParams: AcademicQueryParam[];
  example: string;
}

function renderEndpoint(endpoint: AcademicEndpoint): string {
  const lines: string[] = [];
  lines.push(`### \`${endpoint.method}\` \`${endpoint.path}\``);
  lines.push('');
  lines.push(endpoint.description);
  lines.push('');

  if (endpoint.queryParams.length > 0) {
    lines.push('**Query Parameters**');
    lines.push('');
    lines.push('| Name | Type | Description |');
    lines.push('|------|------|-------------|');
    for (const p of endpoint.queryParams) {
      lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.description.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }

  lines.push('**Example**');
  lines.push('');
  lines.push('```javascript');
  lines.push(endpoint.example);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

export function buildAcademicApiDocsMarkdown(endpoints: AcademicEndpoint[]): string {
  const intro = `# Academic API Documentation

Access academic years, regulations, and batch data using these endpoints.

## Authentication

All endpoints require authentication using a Bearer token:

\`\`\`
Authorization: Bearer YOUR_API_KEY
\`\`\`

## Data Privacy

This API exposes academic year, regulation, and batch data for authorized integrations. Ensure your API key is kept secure and only used by authorized systems. All data access is logged and restricted to your institution's records.

## Endpoints

`;

  const body = endpoints.map(renderEndpoint).join('\n');

  const responses = `## Response Format — List Endpoints

\`\`\`json
{
  "count": 25,
  "data": [
    {
      "id": "uuid",
      "institution_id": "uuid",
      "regulation_year": 2024,
      "regulation_code": "R2024",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 25,
    "totalPages": 1
  }
}
\`\`\`

## Response Format — Single Record

\`\`\`json
{
  "data": {
    "id": "uuid",
    "institution_id": "uuid",
    "batch_year": 2024,
    "batch_code": "BATCH2024",
    "batch_name": "Batch of 2024",
    "start_date": "2024-06-01",
    "end_date": "2028-05-31",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
\`\`\`
`;

  return intro + body + '\n' + responses;
}
