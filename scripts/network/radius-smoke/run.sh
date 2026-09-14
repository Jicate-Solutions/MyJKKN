#!/usr/bin/env bash
# MyJKKN RADIUS smoke harness — re-creates the May 2026 substrate proof locally:
#
#   radclient (simulated MikroTik) -> FreeRADIUS 3.2 (rlm_rest) -> mock-server.mjs
#   (decideNetworkAccess + toRlmRestReply) -> HTTP 200/401 -> Access-Accept/Reject
#
# Requires: Homebrew freeradius-server 3.2.x (/opt/homebrew/bin/radiusd, radclient),
# node + npx tsx (repo node_modules). Touches no database, starts no dev server.
# Exit 0 only when all six fixtures match. Always cleans up its own processes.
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
RADIUSD="${RADIUSD:-/opt/homebrew/bin/radiusd}"
RADCLIENT="${RADCLIENT:-/opt/homebrew/bin/radclient}"
MOCK_PORT="${MOCK_PORT:-3099}"
AUTH_PORT="${AUTH_PORT:-18120}"
SECRET="testing123"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/radius-smoke.XXXXXX")"
RADDB="$WORK/raddb"
LOGS="$WORK/logs"
RUNDIR="$WORK/run"
mkdir -p "$RADDB" "$LOGS" "$RUNDIR"

MOCK_PID=""
RADIUSD_PID=""
# kill_tree PID — kill a process and every descendant (the mock is started as a
# subshell -> npx -> tsx -> node chain, so killing $! alone leaked the node
# listener every run; reviewer finding 2026-09-06).
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null
}
cleanup() {
  [ -n "$RADIUSD_PID" ] && kill_tree "$RADIUSD_PID"
  [ -n "$MOCK_PID" ] && kill_tree "$MOCK_PID"
  # belt and braces: whatever still listens on the mock port from THIS run dies
  # too — ONLY once this run actually started a mock. A preflight abort (no
  # radiusd, busy AUTH_PORT, ...) must never kill an unrelated listener on
  # $MOCK_PORT (reviewer round 2).
  if [ -n "$MOCK_PID" ]; then
    for lp in $(lsof -nP -ti "tcp:$MOCK_PORT" -sTCP:LISTEN 2>/dev/null); do kill "$lp" 2>/dev/null; done
  fi
  wait 2>/dev/null
  sleep 0.3
  if [ -z "$MOCK_PID" ]; then
    echo "[smoke] cleanup ok: no mock was started (preflight abort), port $MOCK_PORT untouched"
  elif lsof -nP -iTCP:"$MOCK_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[smoke] WARNING: something still listens on $MOCK_PORT after cleanup"
  else
    echo "[smoke] cleanup ok: nothing listens on $MOCK_PORT"
  fi
  echo "[smoke] logs kept in $WORK (radiusd.log, mock.log, radclient-*.txt)"
}
trap cleanup EXIT INT TERM

fail() { echo "[smoke] FAIL: $*"; exit 1; }

for bin in "$RADIUSD" "$RADCLIENT"; do
  [ -x "$bin" ] || fail "$bin not found — brew install freeradius-server"
done
command -v npx >/dev/null || fail "npx not found"

PREFIX="$(dirname "$(dirname "$(readlink -f "$RADIUSD")")")"
[ -d "$PREFIX/lib" ] || fail "cannot locate FreeRADIUS prefix from $RADIUSD (got $PREFIX)"

port_free() { ! lsof -nP -iUDP:"$1" >/dev/null 2>&1 && ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
port_free "$AUTH_PORT" || fail "UDP port $AUTH_PORT busy — set AUTH_PORT"
port_free "$MOCK_PORT" || fail "TCP port $MOCK_PORT busy — set MOCK_PORT"

# (a) render the minimal raddb into the temp dir
(cd "$HERE/raddb" && find . -type f) | while read -r rel; do
  mkdir -p "$RADDB/$(dirname "$rel")"
  sed -e "s|@@PREFIX@@|$PREFIX|g" \
      -e "s|@@CONFDIR@@|$RADDB|g" \
      -e "s|@@RUNDIR@@|$RUNDIR|g" \
      -e "s|@@LOGDIR@@|$LOGS|g" \
      -e "s|@@MOCK_URL@@|http://127.0.0.1:$MOCK_PORT|g" \
      -e "s|@@AUTH_PORT@@|$AUTH_PORT|g" \
      "$HERE/raddb/$rel" > "$RADDB/$rel"
done
echo "[smoke] raddb rendered at $RADDB (prefix $PREFIX)"

# (b) mock MyJKKN endpoint, running the real TS modules through tsx
(cd "$ROOT" && MOCK_PORT="$MOCK_PORT" npx tsx scripts/network/radius-smoke/mock-server.mjs > "$LOGS/mock.log" 2>&1) &
MOCK_PID=$!
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$MOCK_PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "http://127.0.0.1:$MOCK_PORT/health" >/dev/null 2>&1 || { cat "$LOGS/mock.log"; fail "mock server did not come up on $MOCK_PORT"; }
echo "[smoke] mock up on http://127.0.0.1:$MOCK_PORT"

# (c) FreeRADIUS in debug mode on the private port
"$RADIUSD" -X -d "$RADDB" > "$LOGS/radiusd.log" 2>&1 &
RADIUSD_PID=$!
for _ in $(seq 1 60); do
  grep -q "Ready to process requests" "$LOGS/radiusd.log" 2>/dev/null && break
  kill -0 "$RADIUSD_PID" 2>/dev/null || break
  sleep 0.5
done
if ! grep -q "Ready to process requests" "$LOGS/radiusd.log" 2>/dev/null; then
  echo "----- radiusd.log (tail) -----"; tail -40 "$LOGS/radiusd.log"
  fail "radiusd did not start"
fi
echo "[smoke] radiusd ready on 127.0.0.1:$AUTH_PORT (auth)"

# (d) fire the fixtures and assert. Rate-Limit is rx/tx = client UPLOAD first
# (https://help.mikrotik.com/docs/display/ROS/RADIUS), so tier_a 50 down/25 up
# is "25M/50M". The two reject fixtures assert the Reply-Message the hotspot
# page reads; fixture 6 carries a double-quote and a backslash in User-Name to
# prove %{jsonquote:} keeps the rlm_rest JSON body parseable (a broken body
# makes the mock answer 500 = RADIUS "fail", which has NO Reply-Message).
PASS=0; TOTAL=0
check() {
  local user="$1" expect="$2"; shift 2
  TOTAL=$((TOTAL + 1))
  local safe out
  safe="$(printf '%s' "$user" | tr -c 'A-Za-z0-9@._-' '_')"
  out="$LOGS/radclient-$safe.txt"
  printf 'User-Name = "%s"\nUser-Password = "one-time-token"\nNAS-Identifier = "mikrotik-smoke"\nCalling-Station-Id = "AA-BB-CC-DD-EE-01"\n' "$user" \
    | "$RADCLIENT" -x -r 1 -t 5 "127.0.0.1:$AUTH_PORT" auth "$SECRET" > "$out" 2>&1
  local ok=1
  grep -q "Received $expect" "$out" || ok=0
  for attr in "$@"; do
    grep -qF -- "$attr" "$out" || ok=0
  done
  if [ "$ok" = 1 ]; then
    PASS=$((PASS + 1)); echo "[smoke] PASS $user -> $expect ${*:+($*)}"
  else
    echo "[smoke] FAIL $user — expected $expect ${*:+with $*}"; echo "----- radclient output -----"; cat "$out"
  fi
}

check "learner-a@jkkn.ai"      "Access-Accept" 'Mikrotik-Rate-Limit = "25M/50M"' 'Mikrotik-Group = "tier_a_learner"'        'Session-Timeout = 28800'
check "learner-b@jkkn.ai"      "Access-Accept" 'Mikrotik-Rate-Limit = "5M/10M"'  'Mikrotik-Group = "tier_c_learner"'        'Session-Timeout = 28800'
check "learner-c@jkkn.ai"      "Access-Reject" 'Reply-Message = "fee_overdue"'
check "senior-learner@jkkn.ai" "Access-Accept" 'Mikrotik-Rate-Limit = "25M/50M"' 'Mikrotik-Group = "tier_a_senior_learner"' 'Session-Timeout = 86400'
check "locked@jkkn.ai"         "Access-Reject" 'Reply-Message = "locked_out"'
# radclient string syntax: \" and \\ inside the quotes -> the wire value is  quote"back\slash@jkkn.ai
check 'quote\"back\\slash@jkkn.ai' "Access-Reject" 'Reply-Message = "unknown_user"'
if grep -qF 'HIT quote"back\slash@jkkn.ai' "$LOGS/mock.log"; then
  echo '[smoke] PASS jsonquote: mock decoded the quoted User-Name intact'
else
  echo '[smoke] FAIL jsonquote: mock did not see the quoted User-Name'; PASS=$((PASS - 1))
fi

echo "----- mock.log -----"; cat "$LOGS/mock.log"
echo "[smoke] $PASS/$TOTAL scenarios matched"

# (e) exit 0 only when every fixture matches; (f) cleanup runs from the trap
[ "$PASS" = "$TOTAL" ] || exit 1
exit 0
