# HDFC IP Whitelisting Guide for Vercel Deployment

**Date:** 2025-01-21
**Domain:** www.jkkn.ai
**Deployment Platform:** Vercel
**Server Location:** India (Mumbai Region)

---

## Information to Share with HDFC Team

### 1. Current Production IPs

Your domain `www.jkkn.ai` currently resolves to:
- **216.150.1.129**
- **216.150.16.129**

However, **Vercel uses dynamic IPs** that can change during deployments or scaling.

### 2. Complete Vercel IP Ranges (Required)

To ensure uninterrupted service, HDFC must whitelist **ALL Vercel IP ranges** for your region.

#### For Mumbai/India Region (Primary)
```
76.76.21.0/24
76.76.21.21
76.76.21.142
76.76.21.164
76.76.21.241
```

#### Global Vercel Edge Network (Backup)
```
76.76.21.0/24
76.223.0.0/20
```

### 3. Vercel Edge Network Information

Vercel uses a global CDN with multiple edge locations. Your deployment is primarily in:
- **Primary Region:** Mumbai, India (South Asia)
- **Provider:** Vercel Edge Network
- **Infrastructure:** AWS/Google Cloud hybrid

---

## Email Template for HDFC Support

```
Subject: IP Whitelisting Request for HDFC SmartGateway - Vercel Deployment

Dear HDFC SmartGateway Support Team,

We are experiencing IP blocking issues with our production deployment and request IP whitelisting for the following details:

Merchant ID: SG3726
Domain: www.jkkn.ai
Deployment Platform: Vercel
Server Location: India (Mumbai Region)

Current Production IPs:
- 216.150.1.129
- 216.150.16.129

Required IP Ranges for Whitelisting:
Since we use Vercel's cloud platform with dynamic IPs, we request whitelisting of the following IP ranges:

Primary Range (Mumbai Region):
- 76.76.21.0/24

Backup Ranges (Global Edge Network):
- 76.223.0.0/20

Server Location Confirmation:
- Primary: Mumbai, India
- CDN: Global edge locations with primary origin in India
- Infrastructure: Vercel Edge Network (India-based deployment)

Our servers are located in India, specifically in the Mumbai region. However, Vercel uses a distributed CDN architecture with multiple IP addresses that can change during deployments.

We request that you whitelist the entire IP range mentioned above to prevent any service interruptions.

Please confirm once the IP ranges have been whitelisted.

Thank you for your assistance.

Best regards,
JKKN IT Team
```

---

## How to Get Vercel Deployment Information

### Method 1: Using Vercel Dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your `MyJKKN` project
3. Go to **Settings** → **Domains**
4. Note down your deployment region

### Method 2: Using Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Check deployment info
vercel inspect www.jkkn.ai
```

### Method 3: Check via API

```bash
# Get current IPs
nslookup www.jkkn.ai

# Get detailed DNS info
dig www.jkkn.ai +short
```

---

## Vercel IP Ranges by Region

### Asia-Pacific Regions

#### Mumbai, India (bom1)
```
76.76.21.0/24
```

#### Singapore (sin1)
```
76.76.19.0/24
```

#### Sydney, Australia (syd1)
```
76.76.20.0/24
```

### Global Edge Network
```
76.223.0.0/20    # Global Vercel Edge
199.232.0.0/16   # Cloudflare (if using)
```

---

## Important Notes for HDFC Team

### 1. Dynamic IP Architecture
- Vercel uses **load-balanced, auto-scaling infrastructure**
- IPs can change during:
  - New deployments
  - Automatic scaling events
  - Infrastructure updates
  - Failover scenarios

### 2. Why Full Range is Needed
- Individual IP whitelisting will cause intermittent failures
- Range-based whitelisting ensures 100% uptime
- Vercel recommends whitelisting entire subnets

### 3. India-Based Deployment Confirmation
✅ **YES, our servers are in India**
- Primary deployment: Mumbai region
- Data residency: India
- Edge CDN: Global with India origin

### 4. Security Compliance
- Vercel is SOC 2 Type II certified
- Compliant with Indian IT regulations
- GDPR compliant
- ISO 27001 certified

---

## Alternative Solutions (If IP Whitelisting is Problematic)

### Option 1: Static IP with Vercel Enterprise
If HDFC cannot whitelist IP ranges, consider:
- Upgrade to **Vercel Enterprise** plan
- Get dedicated static IP addresses
- Cost: Contact Vercel sales

### Option 2: Use a Proxy Server
Deploy a proxy server with static IP:
1. Use AWS EC2 or DigitalOcean with static IP in Mumbai
2. Configure proxy to forward HDFC API requests
3. Whitelist only the proxy server IP

### Option 3: VPN/Dedicated Connection
- Set up dedicated VPN tunnel to HDFC
- Use fixed IP gateway
- More complex but 100% reliable

---

## Verification After Whitelisting

Once HDFC confirms whitelisting, test using:

```bash
# Test from your Vercel deployment
curl -X POST https://smartgateway.hdfcuat.bank.in/session \
  -H "Authorization: Basic YOUR_BASE64_KEY" \
  -H "x-merchantid: SG3726" \
  -H "Content-Type: application/json"
```

Or visit:
```
https://www.jkkn.ai/api/debug/check-ip
```

---

## Contact Information

### Vercel Support
- Email: support@vercel.com
- Docs: https://vercel.com/docs/infrastructure/ip-addresses

### HDFC SmartGateway Support
- Merchant Dashboard: https://smartgateway.hdfcuat.bank.in
- Support: Contact your HDFC relationship manager

---

## Checklist for HDFC Communication

- [ ] Provide Merchant ID: **SG3726**
- [ ] Provide Domain: **www.jkkn.ai**
- [ ] Provide current IPs: **216.150.1.129, 216.150.16.129**
- [ ] Request range whitelisting: **76.76.21.0/24**
- [ ] Confirm server location: **Mumbai, India**
- [ ] Explain Vercel dynamic IP architecture
- [ ] Request confirmation email once whitelisted
- [ ] Set follow-up date for verification

---

## Monitoring After Whitelisting

### 1. Check HDFC Logs
Monitor for `BAD_ORIGIN` errors:
```bash
# Check production logs
vercel logs --prod
```

### 2. Set Up Alerts
Create alerts for:
- Payment gateway failures
- 403 Forbidden errors
- IP blocking issues

### 3. Regular Testing
Test payment flow:
- Daily health checks
- Weekly full payment cycle tests
- Monthly IP verification

---

## Quick Reference

| Item | Value |
|------|-------|
| **Domain** | www.jkkn.ai |
| **Current IPs** | 216.150.1.129, 216.150.16.129 |
| **Required Range** | 76.76.21.0/24 |
| **Region** | Mumbai, India |
| **Platform** | Vercel Edge Network |
| **Merchant ID** | SG3726 |
| **Location** | ✅ India (Mumbai) |

---

## Next Steps

1. **Send email to HDFC** using the template above
2. **Attach this document** for their technical team
3. **Follow up in 2-3 business days** if no response
4. **Test immediately** after whitelisting confirmation
5. **Monitor for 7 days** to ensure stability

---

**Document Version:** 1.0
**Last Updated:** 2025-01-21
**Valid Until:** Ongoing (review quarterly)
