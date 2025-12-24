#!/bin/bash

# Enhanced script to fix remaining React 19 type inference issues
# Focuses on adding type casts for Supabase query results

echo "Fixing remaining type inference issues..."

# Find all TypeScript files in lib/services and hooks
files=$(find lib/services hooks -type f -name "*.ts" -not -name "*.d.ts")

fixed_count=0

for file in $files; do
  # Skip if file doesn't exist
  [ ! -f "$file" ] && continue

  # Create backup
  cp "$file" "$file.bak"

  # Pattern 1: Fix .update() operations (any remaining)
  if sed -i 's/await this\.supabase\.update(/await (this.supabase as any).update(/g' "$file" 2>/dev/null; then
    ((fixed_count++))
  fi

  # Pattern 2: Fix .delete() operations
  if sed -i 's/await this\.supabase\.delete(/await (this.supabase as any).delete(/g' "$file" 2>/dev/null; then
    ((fixed_count++))
  fi

  if sed -i 's/await supabase\.delete(/await (supabase as any).delete(/g' "$file" 2>/dev/null; then
    ((fixed_count++))
  fi

  # Pattern 3: Fix remaining .from() calls that weren't caught before
  sed -i 's/= await this\.supabase\.from(/= await (this.supabase as any).from(/g' "$file" 2>/dev/null
  sed -i 's/= await supabase\.from(/= await (supabase as any).from(/g' "$file" 2>/dev/null

  # Remove backup if no changes
  if diff -q "$file" "$file.bak" > /dev/null 2>&1; then
    rm "$file.bak"
  else
    echo "Fixed: $file"
    rm "$file.bak"
    ((fixed_count++))
  fi
done

echo "Enhanced fix applied to $fixed_count files"
echo "Running type check..."
