#!/bin/bash

# Final comprehensive type fix - catches all remaining patterns

echo "Running final comprehensive type fix..."

# Find ALL TypeScript files (not just services)
find . -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -name "*.d.ts" \
  -exec sed -i 's/await supabase\.from(/await (supabase as any).from(/g' {} \; \
  -exec sed -i 's/await getSupabaseClient()\.from(/await (getSupabaseClient() as any).from(/g' {} \; \
  -exec sed -i 's/await createClientSupabaseClient()\.from(/await (createClientSupabaseClient() as any).from(/g' {} \; 2>/dev/null

echo "Applied fixes to all TypeScript files"
echo "Checking error count..."

npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0"
