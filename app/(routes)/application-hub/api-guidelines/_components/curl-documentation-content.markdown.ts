interface CurlExamples {
  learners: Record<string, string>;
  staff: Record<string, string>;
  organizations: Record<string, string>;
  testing: Record<string, string>;
}

const SECTION_TITLES: Record<keyof CurlExamples, string> = {
  learners: 'Learners API',
  staff: 'Staff API',
  organizations: 'Organizations API',
  testing: 'Testing & Debugging'
};

const HUMAN_LABEL: Record<string, string> = {
  profiles: 'List Learner Profiles',
  profilesWithExpand: 'Profiles with Related Data',
  profileById: 'Get Profile by ID',
  enquiries: 'List Enquiries',
  alumni: 'List Alumni',
  basic: 'Basic List',
  all: 'Fetch All Records (no pagination)',
  search: 'Search by Term',
  filters: 'Filter by Institution / Department / Active',
  allWithFilters: 'Fetch All with Filters',
  institutions: 'List Institutions',
  degrees: 'List Degrees',
  departments: 'List Departments',
  programs: 'List Programs',
  courses: 'List Courses',
  validity: 'Test API Key Validity',
  invalidKey: 'Test Invalid Key Response',
  verbose: 'Verbose Debug Mode'
};

function humanise(key: string): string {
  return (
    HUMAN_LABEL[key] ??
    key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim()
  );
}

function buildSection(name: keyof CurlExamples, examples: Record<string, string>): string {
  const lines: string[] = [];
  lines.push(`## ${SECTION_TITLES[name]} CURL Commands`);
  lines.push('');
  for (const [key, command] of Object.entries(examples)) {
    lines.push(`### ${humanise(key)}`);
    lines.push('');
    lines.push('```bash');
    lines.push(command);
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

export function buildCurlDocumentationMarkdown(
  examples: CurlExamples,
  testScript: string
): string {
  const intro = `# CURL Documentation

Comprehensive CURL commands to test all MyJKKN API endpoints. Perfect for validating your API key and probing endpoint behaviour.

## Prerequisites

- Valid API key in format \`jk_xxxxx_xxxxx\`
- CURL installed on your system
- Internet connection to reach \`https://jkkn.ai\`

`;

  const body = (Object.keys(examples) as Array<keyof CurlExamples>)
    .map((k) => buildSection(k, examples[k]))
    .join('\n');

  const script = `## Comprehensive Bash Test Script

Save the following as \`api_test.sh\` and run \`chmod +x api_test.sh && ./api_test.sh\` to exercise all endpoints with a single API key.

\`\`\`bash
${testScript}
\`\`\`

## Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (invalid parameters) |
| 401 | Unauthorized (missing or invalid API key) |
| 403 | Forbidden (API key lacks permission for this resource) |
| 404 | Not Found |
| 429 | Rate Limit Exceeded |
| 500 | Internal Server Error |
`;

  return intro + body + '\n' + script;
}
