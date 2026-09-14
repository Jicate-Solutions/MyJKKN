// Mock MyJKKN RADIUS endpoint for the local FreeRADIUS smoke harness.
//
// Run through tsx so the real TypeScript decision + format modules are used:
//   npx tsx scripts/network/radius-smoke/mock-server.mjs
//
// It resolves the five May 2026 fixture usernames to decision inputs and answers
// with the SAME modules a future app/api/network/radius-auth route will call.
// Nothing here touches a database.
import http from 'node:http';
import { createRequire } from 'node:module';

// The repo's package.json is CommonJS (no "type": "module"), so tsx compiles the
// .ts modules to CJS; ESM named imports of them fail under Node 26. Requiring
// them through tsx's CJS hook (which also honours the "@/..." tsconfig path)
// keeps the mock on the exact production modules.
const require = createRequire(import.meta.url);
const { decideNetworkAccess } = require('../../../lib/services/network/radius-decision.ts');
const { toRlmRestReply } = require('../../../lib/services/network/radius-rest-format.ts');

const PORT = Number(process.env.MOCK_PORT || 3099);

const TIERS = [
  { code: 'tier_a', attendanceMinPct: 95, attendanceMaxPct: 100, downloadMbps: 50, uploadMbps: 25 },
  { code: 'tier_b', attendanceMinPct: 85, attendanceMaxPct: 95, downloadMbps: 25, uploadMbps: 12 },
  { code: 'tier_c', attendanceMinPct: 75, attendanceMaxPct: 85, downloadMbps: 10, uploadMbps: 5 },
  { code: 'tier_d', attendanceMinPct: 0, attendanceMaxPct: 75, downloadMbps: 5, uploadMbps: 2 },
];

const SESSION_HOURS = {
  learner: 8,
  senior_learner: 24,
  team_member: 24,
  admin: 24,
  warden: 0,
  security: 0,
  guest: 1,
};

const oneHourAhead = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

/** username -> the parts of the decision input that vary per fixture. */
const FIXTURES = {
  'learner-a@jkkn.ai': { role: 'learner', attendancePct: 97, feeOverdue: false, lockedUntil: null },
  'learner-b@jkkn.ai': { role: 'learner', attendancePct: 78, feeOverdue: false, lockedUntil: null },
  'learner-c@jkkn.ai': { role: 'learner', attendancePct: 92, feeOverdue: true, lockedUntil: null },
  'senior-learner@jkkn.ai': { role: 'senior_learner', attendancePct: 100, feeOverdue: false, lockedUntil: null },
  'locked@jkkn.ai': { role: 'learner', attendancePct: 99, feeOverdue: false, lockedUntil: oneHourAhead() },
};

function decideFor(username) {
  const fixture = FIXTURES[username];
  if (!fixture) return { accept: false, reason: 'unknown_user' };
  return decideNetworkAccess({
    identity: { profileId: `fixture:${username}`, role: fixture.role, institutionId: 'fixture-institution' },
    attendancePct: fixture.attendancePct,
    feeOverdue: fixture.feeOverdue,
    lockedUntil: fixture.lockedUntil,
    activeDeviceCount: 0,
    maxDevicesForRole: 3,
    tiers: TIERS,
    sessionHoursByRole: SESSION_HOURS,
    emergencyOpen: process.env.EMERGENCY_OPEN === '1',
    now: new Date().toISOString(),
  });
}

function stamp() {
  return new Date().toISOString().slice(11, 19);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/network/radius-auth') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":"not_found"}');
    return;
  }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    let username = '';
    try {
      username = String(JSON.parse(raw || '{}').username || '');
    } catch {
      // A body rlm_rest failed to escape is a contract break, not an unknown
      // person: answer 500 (RADIUS "fail", no Reply-Message) so the harness can
      // tell it apart from a clean unknown_user reject.
      console.log(`[${stamp()}] BAD JSON body: ${raw}`);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"bad_json"}');
      return;
    }
    const decision = decideFor(username);
    const reply = toRlmRestReply(decision);
    console.log(`[${stamp()}] HIT ${username || '(no username)'} -> ${reply.status} ${decision.accept ? 'accept' : decision.reason} ${JSON.stringify(reply.body)}`);
    res.writeHead(reply.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[${stamp()}] mock MyJKKN radius-auth listening on http://127.0.0.1:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
