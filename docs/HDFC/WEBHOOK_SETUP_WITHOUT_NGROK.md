# HDFC Webhook Setup Without ngrok

## 🚀 Quick Setup Using localhost.run (No Installation Required)

### Step 1: Start Your Development Server

```bash
cd "D:\JKKN\MYJKKN Portal\MyJKKN"
npm run dev
```

Server should be running at: http://localhost:3000

### Step 2: Create Public Tunnel Using localhost.run

Open a **NEW** terminal/command prompt and run:

```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

You'll see output like:
```
** your connection id is abc123-def456-ghi789, please mention it if you send me a message about an issue. **

abc123.lhr.localhost.run tunneled with tls termination, https://abc123.lhr.localhost.run
```

### Step 3: Copy Your Public URL

From the output above, copy the **HTTPS URL**:
```
https://abc123.lhr.localhost.run
```

### Step 4: Configure HDFC Webhook

Go to HDFC SmartGateway Dashboard:
- Settings → Webhooks

**Fill in:**
- **Primary WebHook URL**: `https://abc123.lhr.localhost.run/api/billing/payment/webhook`
- **Add Full Gateway Response**: ✅ Checked
- **Username**: (Leave empty)
- **Password**: (Leave empty)

Click **"Update Webhooks Settings"**

### Step 5: Test Your Setup

Open a new browser tab and verify webhook is accessible:
```
https://abc123.lhr.localhost.run/api/billing/payment/webhook
```

You should see:
```json
{
  "service": "HDFC Payment Gateway Webhook",
  "status": "active",
  "endpoint": "/api/billing/payment/webhook",
  "methods": ["POST"]
}
```

### Step 6: Test a Payment

1. Go to your app: `https://abc123.lhr.localhost.run`
2. Navigate to: Billing → Students → [Select student]
3. Click "Pay Online"
4. Complete test payment

### Step 7: Monitor Webhook Calls

In the terminal where localhost.run is running, you'll see webhook requests coming in.

---

## 🔄 Important Notes

### URL Changes
⚠️ **The localhost.run URL changes each time you restart the tunnel**

When you restart, you'll get a NEW URL like:
- First time: `https://abc123.lhr.localhost.run`
- After restart: `https://xyz789.lhr.localhost.run`

**You need to update HDFC webhook settings each time!**

### Keep Tunnel Running
- Keep the localhost.run terminal window open
- Don't close it while testing
- If it disconnects, run the ssh command again

---

## 🌟 Better Alternative: Deploy to Vercel (Permanent URL)

For a **permanent URL that doesn't change**, use Vercel:

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Deploy Your App

```bash
cd "D:\JKKN\MYJKKN Portal\MyJKKN"
vercel login
vercel
```

Follow the prompts:
- Link to existing project? **No**
- Project name? **myjkkn** (or your choice)
- Directory? **./** (press Enter)
- Override settings? **No**

### Step 3: Add Environment Variables

After deployment, go to:
- https://vercel.com/dashboard
- Select your project
- Settings → Environment Variables

Add these variables:
```
NEXT_PUBLIC_SUPABASE_URL=https://kvizhngldtiuufknvehv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
HDFC_MERCHANT_ID=SG3726
HDFC_PAYMENT_PAGE_CLIENT_ID=hdfcmaster
HDFC_API_KEY=8E8045D3D584A97BCB6204A1E26399
HDFC_API_SECRET=8E8045D3D584A97BCB6204A1E26399
HDFC_RESPONSE_KEY=0B25C9C98964040A45ABC962DF9F8B
HDFC_CARD_ENCODING_KEY=0B25C9C98964040A45ABC962DF9F8B
HDFC_BASE_URL=https://smartgateway.hdfcuat.bank.in
HDFC_TEST_MODE=true
HDFC_ENABLE_LOGGING=false
NEXT_PUBLIC_APP_URL=https://your-vercel-url.vercel.app
```

### Step 4: Redeploy

```bash
vercel --prod
```

### Step 5: Use Permanent URL in HDFC

You'll get a URL like: `https://myjkkn.vercel.app`

**Configure in HDFC:**
```
https://myjkkn.vercel.app/api/billing/payment/webhook
```

This URL **never changes**! Perfect for testing.

---

## 📊 Comparison

| Method | Installation | URL Stability | Speed | Best For |
|--------|-------------|---------------|-------|----------|
| **localhost.run** | None | Changes on restart | Instant | Quick testing |
| **Vercel** | CLI install | Permanent | 1-2 min deploy | Stable testing |
| **Cloudflare Tunnel** | Download | Changes | Instant | Alternative to localhost.run |
| **Railway** | CLI install | Permanent | 2-3 min deploy | Production-like testing |

---

## ✅ Recommended Approach

**For immediate testing**: Use **localhost.run**
```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

**For stable testing**: Use **Vercel**
```bash
vercel
```

---

## 🐛 Troubleshooting

### localhost.run connection refused
**Try alternative hosts:**
```bash
# Try serveo.net
ssh -R 80:localhost:3000 serveo.net

# Try telebit.cloud (requires sign-up)
npx telebit http 3000
```

### Webhook not receiving calls
**Check:**
1. ✅ Tunnel is running (don't close terminal)
2. ✅ Dev server is running on port 3000
3. ✅ URL in HDFC matches tunnel URL exactly
4. ✅ Added `/api/billing/payment/webhook` at the end

### Test webhook manually
```bash
# Get your tunnel URL (e.g., https://abc123.lhr.localhost.run)
curl https://abc123.lhr.localhost.run/api/billing/payment/webhook

# Should return webhook status
```

---

## 🎯 Quick Commands Reference

### Start localhost.run tunnel:
```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

### Deploy to Vercel:
```bash
vercel
```

### Test webhook endpoint:
```bash
curl https://your-url/api/billing/payment/webhook
```

---

**Choose the method that works best for you and start testing!** 🚀
