#!/bin/bash
# Deploy to production and verify critical endpoints
# Usage: ./scripts/deploy-and-verify.sh

set -e
BASE_URL="https://www.jkkn.ai"
FAILED=0
PASSED=0

echo "📦 Step 1: Pull latest code"
git pull origin main

echo ""
echo "🚀 Step 2: Deploy to production"
vercel --prod --yes

echo ""
echo "⏳ Waiting 10 seconds for deployment to propagate..."
sleep 10

echo ""
echo "🔍 Step 3: Verify deployment"

check() {
  local name="$1"
  local url="$2"
  local expected="$3"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10)
  if [ "$STATUS" = "$expected" ]; then
    echo "  ✅ $name"
    PASSED=$((PASSED + 1))
  else
    echo "  ❌ $name — Expected $expected, got $STATUS"
    FAILED=$((FAILED + 1))
  fi
}

check "Homepage" "$BASE_URL" "200"
check "Webhook" "$BASE_URL/api/webhooks/whatsapp" "403"
check "Discover" "$BASE_URL/api/admission/settings/whatsapp-numbers/discover" "200"
check "Profile" "$BASE_URL/api/admission/settings/whatsapp-profile" "200"

# Check discover returns data
TOTAL=$(curl -s "$BASE_URL/api/admission/settings/whatsapp-numbers/discover" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")
if [ "$TOTAL" -gt "0" ]; then
  echo "  ✅ Discover found $TOTAL numbers"
  PASSED=$((PASSED + 1))
else
  echo "  ❌ Discover returned 0 numbers"
  FAILED=$((FAILED + 1))
fi

echo ""
echo "================================"
echo "Results: $PASSED passed, $FAILED failed"
echo "================================"

if [ "$FAILED" -gt "0" ]; then
  echo "⚠️  Some checks failed! Review the output above."
  exit 1
else
  echo "✅ All checks passed. Deployment verified!"
fi
