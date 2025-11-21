# Quick Command: Get Vercel IPs for HDFC

## Get Your Current Production IPs

### Method 1: Using nslookup (Windows)
```bash
nslookup www.jkkn.ai
```

### Method 2: Using dig (Linux/Mac)
```bash
dig www.jkkn.ai +short
```

### Method 3: Using curl
```bash
curl -s https://www.jkkn.ai/api/debug/check-ip
```

## Current Status (As of 2025-01-21)

### Your Production IPs
```
216.150.1.129
216.150.16.129
```

### Vercel IP Range to Whitelist
```
76.76.21.0/24
```

This range includes approximately 254 IP addresses that Vercel may use for your Mumbai deployment.

## Copy-Paste Email for HDFC

```
Subject: Urgent - IP Whitelisting Request for SG3726 (Vercel Deployment)

Dear HDFC SmartGateway Team,

Merchant ID: SG3726
Domain: www.jkkn.ai

We are experiencing BAD_ORIGIN errors due to IP blocking. We use Vercel cloud platform deployed in Mumbai, India.

Current Production IPs:
- 216.150.1.129
- 216.150.16.129

However, Vercel uses dynamic IPs. Please whitelist this IP range:
- 76.76.21.0/24 (Mumbai Region - All Vercel IPs)

Server Location: Mumbai, India (confirmed)
Platform: Vercel Edge Network (Indian infrastructure)

These IPs are all located in India. Vercel's architecture requires whitelisting the entire range to prevent service interruptions during deployments and scaling.

Please confirm once whitelisted.

Thank you.
```

## Verify After Whitelisting

Check if whitelisting worked:
```bash
curl -X POST https://smartgateway.hdfcuat.bank.in/session \
  -H "Authorization: Basic <YOUR_BASE64_KEY>" \
  -H "x-merchantid: SG3726" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

Or visit your test endpoint:
```
https://www.jkkn.ai/billing/payment-test
```
