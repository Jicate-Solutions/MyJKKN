#!/bin/bash

echo ""
echo "========================================"
echo " MyJKKN Cache Clearing Script"
echo "========================================"
echo ""
echo "Clearing Next.js cache..."
rm -rf .next/cache
rm -rf .next
rm -rf node_modules/.cache
rm -f .tsbuildinfo

echo ""
echo "========================================"
echo " Cache cleared successfully!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. In Chrome DevTools:"
echo "   - Go to Application > Service Workers"
echo "   - Click 'Unregister' for MyJKKN worker"
echo "   - Go to Application > Storage"
echo "   - Click 'Clear site data'"
echo ""
echo "2. Restart dev server:"
echo "   npm run dev"
echo ""
echo "3. Hard reload browser:"
echo "   Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo ""
