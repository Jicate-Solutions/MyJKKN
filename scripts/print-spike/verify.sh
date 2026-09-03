#!/usr/bin/env bash
# Print counter conversion spike — see README.md.
#
# Exits non-zero if this machine cannot convert, count and price a print job
# faithfully. Intended to run in CI against the image that will actually do the
# conversion, because the failure this guards against is silent: a missing font
# still converts, still counts, still extracts correct text, and still prints
# wrong.
#
# Usage:
#   ./verify.sh                 # run against the built-in Tamil fixture
#   ./verify.sh path/to/doc.docx  # run against a real document

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILED=0
pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILED=1; }
info() { printf '       %s\n' "$1"; }

echo
echo "Print conversion spike"
echo "======================"

# ---------------------------------------------------------------- 0. tooling
echo
echo "Tooling"
for tool in soffice gs pdfinfo pdffonts pdftotext fc-match; do
  if command -v "$tool" >/dev/null 2>&1; then pass "$tool"; else fail "$tool not installed"; fi
done
[ "$FAILED" -eq 1 ] && { echo; echo "Missing tooling — cannot continue."; exit 1; }

# --------------------------------------------------------------- 1. fixture
SRC="${1:-}"
if [ -z "$SRC" ]; then
  SRC="$WORK/tamil-3page.docx"
  python3 "$HERE/make-tamil-fixture.py" "$SRC" >/dev/null || { echo "fixture build failed"; exit 1; }
  EXPECTED_PAGES=3
else
  [ -f "$SRC" ] || { echo "no such file: $SRC"; exit 1; }
  EXPECTED_PAGES=""
fi
echo
echo "Source: $SRC"

# ------------------------------------------------------- 2. font resolution
# The critical check. fc-match returns the family fontconfig would actually
# use; if it differs from what was asked for, the font is absent and LibreOffice
# will substitute without complaining.
echo
echo "Font resolution"
for family in "Noto Sans Tamil" "Noto Sans"; do
  actual="$(fc-match "$family" family 2>/dev/null | head -1)"
  if [ "$actual" = "$family" ]; then
    pass "$family resolves to itself"
  else
    fail "$family is NOT installed — substituted by '$actual'"
    info "Tamil will convert and count correctly but print wrong."
    info "Fix: install fonts-noto-core (or the vendor's Tamil font) in this image."
  fi
done

# ------------------------------------------------------------- 3. conversion
echo
echo "Conversion"
START=$(date +%s%N)
soffice --headless --norestore -env:UserInstallation="file://$WORK/lo" \
        --convert-to pdf --outdir "$WORK" "$SRC" >"$WORK/lo.log" 2>&1
PDF="$WORK/$(basename "${SRC%.*}").pdf"
ELAPSED_MS=$(( ($(date +%s%N) - START) / 1000000 ))

if [ -f "$PDF" ]; then
  pass "converted in ${ELAPSED_MS}ms"
else
  fail "conversion produced no PDF"
  sed 's/^/       /' "$WORK/lo.log"
  exit 1
fi

# ------------------------------------------------------------- 4. page count
echo
echo "Page count"
PAGES="$(pdfinfo "$PDF" | awk '/^Pages:/{print $2}')"
if [ -n "$EXPECTED_PAGES" ]; then
  if [ "$PAGES" = "$EXPECTED_PAGES" ]; then
    pass "$PAGES pages (expected $EXPECTED_PAGES)"
  else
    fail "$PAGES pages, expected $EXPECTED_PAGES"
  fi
else
  pass "$PAGES pages"
fi

# -------------------------------------------------- 5. embedded fonts report
echo
echo "Embedded fonts"
pdffonts "$PDF" | tail -n +3 | awk '{print $1}' | sed 's/^[A-Z]*+//' | sort -u \
  | while read -r f; do [ -n "$f" ] && info "$f"; done

# ------------------------------------------------------------ 6. colour split
# Mirrors lib/print/page-analysis.ts. A page is colour when the spread across
# C/M/Y is a meaningful fraction of the largest of them.
echo
echo "Colour split"
gs -o - -sDEVICE=inkcov "$PDF" 2>/dev/null | grep 'CMYK OK' > "$WORK/ink.txt"
INK_PAGES=$(wc -l < "$WORK/ink.txt" | tr -d ' ')

if [ "$INK_PAGES" = "$PAGES" ]; then
  pass "ink coverage read for all $PAGES pages"
else
  fail "ink coverage read for $INK_PAGES of $PAGES pages"
fi

awk '{
  c=$1; m=$2; y=$3; k=$4
  total=c+m+y+k
  mx=c; if(m>mx)mx=m; if(y>mx)mx=y
  mn=c; if(m<mn)mn=m; if(y<mn)mn=y
  spread=mx-mn
  if (total <= 0.00001)                          blank++
  else if (spread < 0.0001 || mx <= 0)           mono++
  else if (spread/mx > 0.15)                     colour++
  else                                           mono++
} END {
  printf "       colour %d   mono %d   blank %d\n", colour+0, mono+0, blank+0
}' "$WORK/ink.txt"

echo
if [ "$FAILED" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Checks failed — see FAIL lines above."
fi
exit "$FAILED"
