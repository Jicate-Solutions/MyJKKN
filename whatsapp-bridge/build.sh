#!/usr/bin/env bash
# Cross-compile the JKKN WhatsApp bridge from macOS (or Linux) for the campus
# Windows box. No C toolchain is involved anywhere: the SQLite driver is
# modernc.org/sqlite, which is pure Go.
#
#   CGO_ENABLED=0 is not an optimisation here, it is the contract. If this
#   script ever needs CGO, the wrong SQLite driver has crept back in and the
#   single-.exe deployment is broken.
#
# Usage:
#   ./build.sh              # build the Windows .exe
#   ./build.sh all          # Windows .exe plus a host binary for local testing
set -euo pipefail

cd "$(dirname "$0")"

VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo dev)}"
LDFLAGS="-s -w -X main.Version=${VERSION}"

mkdir -p dist

echo "==> building windows/amd64 (CGO_ENABLED=0), version ${VERSION}"
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 \
  go build -trimpath -ldflags "${LDFLAGS}" -o dist/jkkn-whatsapp-bridge.exe .

echo "==> built:"
ls -la dist/jkkn-whatsapp-bridge.exe
file dist/jkkn-whatsapp-bridge.exe 2>/dev/null || true

if [ "${1:-}" = "all" ]; then
  echo "==> building a host binary for local testing (CGO_ENABLED=0)"
  CGO_ENABLED=0 go build -trimpath -ldflags "${LDFLAGS}" -o dist/jkkn-whatsapp-bridge .
  ls -la dist/jkkn-whatsapp-bridge
fi

echo
echo "Copy dist/jkkn-whatsapp-bridge.exe to the Windows box and follow README.md."
