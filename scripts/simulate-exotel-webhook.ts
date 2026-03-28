// scripts/simulate-exotel-webhook.ts
// Simulate an Exotel webhook callback for testing.
//
// Usage:
//   npx tsx scripts/simulate-exotel-webhook.ts <call-log-id> [status] [base-url]
//
// Examples:
//   npx tsx scripts/simulate-exotel-webhook.ts abc-123 completed
//   npx tsx scripts/simulate-exotel-webhook.ts abc-123 ringing
//   npx tsx scripts/simulate-exotel-webhook.ts abc-123 in-progress http://localhost:3000

const callLogId = process.argv[2];
const status = process.argv[3] || 'completed';
const baseUrl = process.argv[4] || 'http://localhost:3000';

if (!callLogId) {
  console.error('Usage: npx tsx scripts/simulate-exotel-webhook.ts <call-log-id> [status] [base-url]');
  process.exit(1);
}

const token = process.env.EXOTEL_API_TOKEN || 'mock-token';

const body = new URLSearchParams({
  CallSid: `sim-${Date.now()}`,
  Status: status,
  Duration: status === 'completed' ? '45' : '0',
  RecordingUrl: status === 'completed' ? 'https://example.com/recording.mp3' : '',
  Price: status === 'completed' ? '0.75' : '0',
  CustomField: callLogId,
  Direction: 'outbound',
  From: '09876543210',
  To: '09876543211',
});

async function main() {
  console.log(`Simulating Exotel webhook: ${status} for call ${callLogId}`);
  console.log(`URL: ${baseUrl}/api/webhooks/telephony`);

  const response = await fetch(`${baseUrl}/api/webhooks/telephony`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-exotel-token': token,
    },
    body: body.toString(),
  });

  const result = await response.json();
  console.log(`Response (${response.status}):`, JSON.stringify(result, null, 2));
}

main().catch(console.error);
