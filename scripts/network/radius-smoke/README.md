# RADIUS smoke harness (local, no database, no dev server)

Re-creates the May 2026 substrate proof (vault: `Smoke-Test-RADIUS-2026-05-09`)
against the real decision core, so a change to `lib/services/network/` is
proven end-to-end through FreeRADIUS before any route exists:

```
radclient (simulated MikroTik hotspot)
    | UDP Access-Request, secret testing123
FreeRADIUS 3.2 (Homebrew), authorize { rest }
    | HTTP POST http://127.0.0.1:3099/api/network/radius-auth
mock-server.mjs  ->  decideNetworkAccess()  ->  toRlmRestReply()
    | HTTP 200 + {"Mikrotik-Rate-Limit","Mikrotik-Group","Session-Timeout"}  or  HTTP 401
FreeRADIUS  ->  Access-Accept with those reply attributes  /  Access-Reject
```

## Run

```bash
brew install freeradius-server          # once; provides /opt/homebrew/bin/radiusd + radclient
bash scripts/network/radius-smoke/run.sh
```

Environment overrides: `AUTH_PORT` (default 18120), `MOCK_PORT` (default 3099),
`RADIUSD` / `RADCLIENT` (binary paths). The script renders `raddb/` into a temp
dir, starts the mock and `radiusd -X`, fires the six fixtures, prints the mock
log, exits 0 only when all six match, and kills both processes on exit.

## Fixtures (identity already resolved — see the Q1 note in radius-decision.ts)

| Username | Role | State | Expected |
|---|---|---|---|
| `learner-a@jkkn.ai` | learner | 97 %, fees paid | Accept · `25M/50M` · `tier_a_learner` · 28800 s |
| `learner-b@jkkn.ai` | learner | 78 %, fees paid | Accept · `5M/10M` · `tier_c_learner` · 28800 s |
| `learner-c@jkkn.ai` | learner | 92 %, fees **overdue** | Reject · `Reply-Message = "fee_overdue"` |
| `senior-learner@jkkn.ai` | senior_learner | 100 %, fees paid | Accept · `25M/50M` · `tier_a_senior_learner` · 86400 s |
| `locked@jkkn.ai` | learner | locked until +1 h | Reject · `Reply-Message = "locked_out"` |
| `quote"back\slash@jkkn.ai` | — | not a fixture; has `"` and `\` in User-Name | Reject · `Reply-Message = "unknown_user"` (proves `%{jsonquote:}` keeps the JSON body parseable) |

`Mikrotik-Rate-Limit` is `rx/tx` read from the router's side, so the client's
**upload** comes first: 50 Mbps down / 25 Mbps up is `25M/50M`
(https://help.mikrotik.com/docs/display/ROS/RADIUS).

`EMERGENCY_OPEN=1` on the mock flips the panic switch: every fixture except
`locked@jkkn.ai` is accepted with only `Session-Timeout = 3600` — an abuse
lockout survives a panic-open (safe default, Director to confirm).

## Files

- `run.sh` — orchestrates everything, always cleans up.
- `mock-server.mjs` — stands in for the future `app/api/network/radius-auth` route; run via `npx tsx` so it imports the TypeScript modules directly.
- `raddb/` — minimal FreeRADIUS config templates (`@@PLACEHOLDER@@`s substituted by `run.sh`): `radiusd.conf`, `clients.conf`, `dictionary`, `mods-enabled/rest`, `sites-enabled/default`.

The rlm_rest response contract (unprefixed attribute names land in the reply
list; 2xx = accept with body decoded, 401 = reject) is cited in
`lib/services/network/radius-rest-format.ts`.
