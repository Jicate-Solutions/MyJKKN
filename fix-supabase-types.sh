#!/bin/bash

# Script to fix Supabase type inference issues after React 19 upgrade
# This adds type casts to Supabase operations to bypass strict type checking

echo "🔧 Fixing Supabase type inference issues..."

# Counter for files modified
modified=0

# Find all TypeScript files in lib, hooks, and app directories
find lib hooks app -type f \( -name "*.ts" -o -name "*.tsx" \) | while read file; do
  # Skip if file doesn't contain supabase
  if ! grep -q "supabase" "$file"; then
    continue
  fi

  # Create backup
  cp "$file" "$file.bak"

  # Track if file was modified
  file_modified=false

  # Fix pattern 1: await supabase.from( → await (supabase as any).from(
  # Only if not already cast
  if grep -q "await supabase\.from(" "$file" && ! grep -q "await (supabase as any)\.from(" "$file"; then
    sed -i 's/await supabase\.from(/await (supabase as any).from(/g' "$file"
    file_modified=true
  fi

  # Fix pattern 2: await this.supabase.from( → await (this.supabase as any).from(
  # Only if not already cast
  if grep -q "await this\.supabase\.from(" "$file" && ! grep -q "await (this\.supabase as any)\.from(" "$file"; then
    sed -i 's/await this\.supabase\.from(/await (this.supabase as any).from(/g' "$file"
    file_modified=true
  fi

  # Fix pattern 3: await supabase.rpc( → await (supabase as any).rpc(
  # Only if not already cast
  if grep -q "await supabase\.rpc(" "$file" && ! grep -q "await (supabase as any)\.rpc(" "$file"; then
    sed -i 's/await supabase\.rpc(/await (supabase as any).rpc(/g' "$file"
    file_modified=true
  fi

  # Fix pattern 4: await this.supabase.rpc( → await (this.supabase as any).rpc(
  # Only if not already cast
  if grep -q "await this\.supabase\.rpc(" "$file" && ! grep -q "await (this\.supabase as any)\.rpc(" "$file"; then
    sed -i 's/await this\.supabase\.rpc(/await (this.supabase as any).rpc(/g' "$file"
    file_modified=true
  fi

  # Fix pattern 5: const { ... } = supabase (without await, for destructured calls)
  # This is trickier - we need to handle lines like: const supabase = getSupabaseClient()
  # followed by usage. Let's handle direct supabase.from without await
  if grep -q "^\s*supabase\.from(" "$file" && ! grep -q "(supabase as any)\.from(" "$file"; then
    sed -i 's/^\(\s*\)supabase\.from(/\1(supabase as any).from(/g' "$file"
    file_modified=true
  fi

  if [ "$file_modified" = true ]; then
    echo "✓ Fixed: $file"
    ((modified++))
    # Remove backup
    rm "$file.bak"
  else
    # Restore from backup if no changes
    mv "$file.bak" "$file"
  fi
done

echo ""
echo "✅ Completed! Modified $modified files"
echo ""
echo "Next step: Run 'npm run build' to verify fixes"
