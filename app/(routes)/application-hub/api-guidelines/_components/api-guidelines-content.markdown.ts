type ModuleKey = 'institutions' | 'departments' | 'programs' | 'degrees' | 'courses';

interface BuildOptions {
  moduleFields: Record<ModuleKey, string>;
  basicExamples: Record<ModuleKey, string>;
  completeExamples: Record<ModuleKey, string>;
  aiPromptTemplate: (module: string, fields: string) => string;
}

const MODULES: ModuleKey[] = ['institutions', 'departments', 'programs', 'degrees', 'courses'];

const FIELD_DESCRIPTIONS: Record<string, string> = {
  id: 'Unique identifier',
  name: 'Display name',
  active: 'Status indicator',
  code: 'Short code',
  type: 'Classification',
  created: 'Creation timestamp',
  updated: 'Update timestamp',
  description: 'Detailed information',
  credit: 'Credit value',
  level: 'Education level',
  abbreviation: 'Short form',
};

function describeField(field: string): string {
  for (const [key, value] of Object.entries(FIELD_DESCRIPTIONS)) {
    if (field.includes(key)) return value;
  }
  return 'Field data';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildModuleSection(module: ModuleKey, opts: BuildOptions): string {
  const fields = opts.moduleFields[module];
  const fieldList = fields
    .split(', ')
    .map((f) => `- \`${f}\` — ${describeField(f)}`)
    .join('\n');

  const responseTemplate = `{
  "data": [
    {
${fields
  .split(', ')
  .map((f) => `      "${f}": "value"`)
  .join(',\n')}
    }
  ],
  "metadata": {
    "page": 1,
    "totalPages": 5,
    "total": 124
  }
}`;

  return `## ${capitalize(module)}

### 1. API Access Requirements

- Valid API key (format: \`jk_xxxxx_xxxxx\`)
- Institution details associated with your account
- Access permissions for specific endpoints

### 2. Available Endpoints

- \`/api-management/organizations/${module}\` — Get all ${module}
- \`/api-management/organizations/${module}/[id]\` — Get ${module.slice(0, -1)} by ID

### 3. Basic API Call

\`\`\`typescript
${opts.basicExamples[module]}
\`\`\`

### 4. Response Structure

\`\`\`json
${responseTemplate}
\`\`\`

### 5. Data Structure

${fieldList}

### 6. Complete Example

\`\`\`tsx
${opts.completeExamples[module]}
\`\`\`

### 7. AI Tool Prompt

Use this prompt with AI coding tools like Cursor, GitHub Copilot, or ChatGPT:

\`\`\`
${opts.aiPromptTemplate(module, fields)}
\`\`\`
`;
}

export function buildApiGuidelinesMarkdown(opts: BuildOptions): string {
  const intro = `# API Documentation — Basic Guide

A comprehensive guide to access organization data through the MyJKKN API system.

## Quick Start

1. Get your API key from an administrator
2. Import the \`ApiFetcher\` component in your application
3. Make API requests by specifying endpoint and your API key
4. Handle the returned data in your components

## Reusable \`ApiFetcher\` Component

\`\`\`tsx
import React, { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";

interface ApiFetcherProps {
  endpoint: string;
  onDataReceived: (data: unknown) => void;
  apiKey?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

const BASE_URL = 'https://jkkn.ai/api';

export const ApiFetcher: React.FC<ApiFetcherProps> = ({
  endpoint,
  onDataReceived,
  apiKey,
  method = 'GET',
  body
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(\`\${BASE_URL}\${endpoint}\`, {
          method,
          headers: {
            'Authorization': \`Bearer \${apiKey}\`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          ...(body && { body: JSON.stringify(body) }),
          mode: 'cors',
        });

        if (!response.ok) {
          throw new Error(\`HTTP error! status: \${response.status}\`);
        }

        const result = await response.json();
        onDataReceived(result);
      } catch (error) {
        console.error('Error:', error);
        toast({
          title: "Error",
          description: "Failed to fetch data. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [endpoint, apiKey, method, body, onDataReceived, toast]);

  return isLoading ? (
    <div className='flex justify-center items-center'>
      <div className='animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900'></div>
    </div>
  ) : null;
};
\`\`\`

---
`;

  const sections = MODULES.map((m) => buildModuleSection(m, opts)).join('\n\n---\n\n');

  const security = `

## Security Notice

For security reasons, keep your API key confidential and never expose it in client-side code. Use environment variables for production applications. Contact the administrator if you need a new API key or have any questions.
`;

  return intro + sections + security;
}
