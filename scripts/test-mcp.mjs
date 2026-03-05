#!/usr/bin/env node
/**
 * Quick MCP client test using the official SDK.
 * Usage: node scripts/test-mcp.mjs [url] [api-key]
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2] || 'http://localhost:3099/api/mcp/mcp';
const apiKey = process.argv[3] || '';

console.log(`\n🔗 Connecting to: ${url}`);
console.log(`🔑 API Key: ${apiKey ? apiKey.slice(0, 10) + '...' : '(none)'}\n`);

const headers = {};
if (apiKey) {
  headers['Authorization'] = `Bearer ${apiKey}`;
}

const transport = new StreamableHTTPClientTransport(
  new URL(url),
  { requestInit: { headers } }
);

const client = new Client({ name: 'mcp-test-client', version: '1.0.0' });

try {
  console.log('1️⃣  Connecting (initialize + initialized)...');
  await client.connect(transport);
  console.log('   ✅ Connected!\n');

  console.log('2️⃣  Listing tools...');
  const { tools } = await client.listTools();
  console.log(`   ✅ Found ${tools.length} tools:\n`);
  for (const tool of tools) {
    console.log(`   • ${tool.name}: ${tool.description?.slice(0, 80)}`);
  }

  if (tools.length > 0) {
    console.log(`\n3️⃣  Calling tool: ${tools[0].name}...`);
    try {
      const result = await client.callTool({ name: tools[0].name, arguments: {} });
      const text = result.content?.[0]?.text || JSON.stringify(result);
      console.log(`   ✅ Result (first 500 chars):\n   ${text.slice(0, 500)}`);
    } catch (err) {
      console.log(`   ❌ Tool call error: ${err.message}`);
    }
  }

  console.log('\n4️⃣  Closing...');
  await client.close();
  console.log('   ✅ Done!\n');
} catch (err) {
  console.error(`\n❌ Error: ${err.message}`);
  if (err.cause) console.error(`   Cause: ${err.cause}`);
  process.exit(1);
}
