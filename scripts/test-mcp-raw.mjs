#!/usr/bin/env node
/**
 * Raw HTTP MCP test (no SDK client, avoids Windows libuv crash).
 * Usage: node scripts/test-mcp-raw.mjs [url] [api-key]
 */
const url = process.argv[2] || 'http://localhost:3099/api/mcp/mcp';
const apiKey = process.argv[3] || '';

const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
};
if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

async function mcpRequest(method, params = {}, id = null) {
  const body = { jsonrpc: '2.0', method, params };
  if (id !== null) body.id = id;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  console.log(`   HTTP ${resp.status} | Content-Type: ${resp.headers.get('content-type')}`);

  // Parse SSE if present
  if (text.includes('event: message')) {
    const dataLine = text.split('\n').find(l => l.startsWith('data: '));
    if (dataLine) return JSON.parse(dataLine.slice(6));
  }

  if (text.trim()) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return null;
}

async function run() {
  console.log(`\nMCP Server Test`);
  console.log(`URL: ${url}`);
  console.log(`Key: ${apiKey ? apiKey.slice(0, 10) + '...' : '(none)'}\n`);

  // Step 1: Initialize
  console.log('1. initialize');
  const initResult = await mcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'raw-test', version: '1.0.0' },
  }, 1);
  console.log('   Result:', JSON.stringify(initResult?.result || initResult, null, 2));

  if (!initResult?.result) {
    console.log('\n   FAILED: No init result. Aborting.');
    process.exit(1);
  }

  // If we got a session ID, use it
  const sessionId = initResult?.sessionId;
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
    console.log(`   Session: ${sessionId}`);
  }

  // Step 2: notifications/initialized
  console.log('\n2. notifications/initialized');
  await mcpRequest('notifications/initialized');

  // Step 3: tools/list
  console.log('\n3. tools/list');
  const toolsResult = await mcpRequest('tools/list', {}, 2);

  if (toolsResult?.result?.tools) {
    const tools = toolsResult.result.tools;
    console.log(`   Found ${tools.length} tools:`);
    for (const t of tools) {
      console.log(`   - ${t.name}: ${(t.description || '').slice(0, 80)}`);
    }

    // Step 4: Call first tool
    if (tools.length > 0) {
      const toolName = tools.find(t => t.name.includes('morning'))?.name || tools[0].name;
      console.log(`\n4. tools/call: ${toolName}`);
      const callResult = await mcpRequest('tools/call', { name: toolName, arguments: {} }, 3);
      const content = callResult?.result?.content?.[0]?.text;
      if (content) {
        console.log(`   Result (first 500 chars):\n   ${content.slice(0, 500)}`);
      } else {
        console.log(`   Result:`, JSON.stringify(callResult, null, 2)?.slice(0, 500));
      }
    }
  } else {
    console.log('   Result:', JSON.stringify(toolsResult, null, 2)?.slice(0, 300));
  }

  console.log('\nDone!\n');
}

run().catch(err => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
