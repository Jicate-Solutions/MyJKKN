// scripts/test-razorpay-webhook.mjs
//
// Local smoke-test for the Razorpay common-account webhook endpoint
// (POST /api/webhooks/razorpay). Signs a sample event with the SAME
// RAZORPAY_WEBHOOK_SECRET you entered in the Razorpay dashboard and POSTs it to
// your running dev server — so you can verify the route + signature + logging
// without a public tunnel.
//
// Usage:
//   1. Ensure `npm run dev` is running (RESTART it after editing .env so the
//      new RAZORPAY_WEBHOOK_SECRET is loaded).
//   2. node --env-file=.env scripts/test-razorpay-webhook.mjs [order_id] [event]
//
// Examples:
//   node --env-file=.env scripts/test-razorpay-webhook.mjs
//   node --env-file=.env scripts/test-razorpay-webhook.mjs order_PfX12abc payment.captured
//
// A dummy order id proves the endpoint + signature + webhook_logs insert work
// (the handler will log "order not found"). Pass a REAL razorpay_order_id from
// the payment_transactions table to also exercise the status-update path.

import crypto from 'node:crypto';

const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
if (!secret) {
  console.error('✗ RAZORPAY_WEBHOOK_SECRET is not set.');
  console.error('  Run with:  node --env-file=.env scripts/test-razorpay-webhook.mjs');
  process.exit(1);
}

const url = process.env.WEBHOOK_URL ?? 'http://localhost:3000/api/webhooks/razorpay';
const orderId = process.argv[2] ?? 'order_LOCALTEST0001';
const event = process.argv[3] ?? 'payment.captured';

const nowSec = Math.floor(Date.now() / 1000);

const payload = {
  entity: 'event',
  event,
  contains: ['payment', 'order'],
  payload: {
    payment: {
      entity: {
        id: 'pay_LOCALTEST0001',
        entity: 'payment',
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        method: 'card',
        captured: true,
        created_at: nowSec,
        notes: { module: 'billing' },
      },
    },
    order: {
      entity: {
        id: orderId,
        entity: 'order',
        amount: 50000,
        amount_paid: 50000,
        currency: 'INR',
        status: 'paid',
        notes: { module: 'billing' },
      },
    },
  },
  created_at: nowSec,
};

// The route verifies HMAC over the EXACT raw body, so sign the same string we send.
const body = JSON.stringify(payload);
const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

console.log(`→ POST ${url}`);
console.log(`  event=${event}  order_id=${orderId}`);

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': signature,
    },
    body,
  });
  const text = await res.text();
  console.log(`← ${res.status} ${res.statusText}: ${text}`);

  if (res.status === 200) {
    console.log('✓ Endpoint accepted the signed webhook. Now check the razorpay_webhook_events table and the dev-server logs.');
  } else if (res.status === 401) {
    console.log('✗ 401 invalid_signature — the .env secret does not match the running server. Restart `npm run dev` after editing .env.');
  } else if (res.status === 500) {
    console.log('✗ 500 misconfigured — RAZORPAY_WEBHOOK_SECRET is empty in the running server. Restart `npm run dev`.');
  }
} catch (err) {
  console.error(`✗ Request failed: ${err.message}`);
  console.error('  Is the dev server running on :3000? Start it with `npm run dev`.');
}
