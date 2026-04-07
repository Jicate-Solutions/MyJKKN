# KBM Marathon 2.0 — Deployment Guide

## Public Site Deployment

### Current State
- **Deployed at:** https://kbm-marathon-public.vercel.app
- **Target domain:** marathon.jkkn.ac.in (DNS not yet configured)
- **Vercel team:** jkkn-institutions
- **GitHub:** github.com/Ommsharravana/kbm-marathon-public

### Deploy from Code
```bash
cd /Users/omm/PROJECTS/kbm-marathon-public
npm run build                    # Verify build passes (2.2s)
git add -A && git commit -m "message"
git push origin main             # Triggers Vercel auto-deploy
# OR manual deploy:
vercel --yes --prod
```

### Environment Variables (Vercel)
```bash
# Already set:
vercel env ls
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# NEXT_PUBLIC_SITE_URL
# NEXT_PUBLIC_RAZORPAY_KEY_ID
# GEMINI_API_KEY

# To add/update:
echo "value" | vercel env add VAR_NAME production
```

### DNS Setup for marathon.jkkn.ac.in
1. Go to JKKN domain DNS manager
2. Add CNAME record: `marathon` → `cname.vercel-dns.com`
3. In Vercel dashboard: Settings → Domains → Add `marathon.jkkn.ac.in`
4. Wait for SSL certificate (automatic, 5-10 min)
5. Verify: `curl -I https://marathon.jkkn.ac.in`

### Razorpay Setup (When Ready)
1. Get Razorpay key pair from JKKN account
2. Add to Vercel: `NEXT_PUBLIC_RAZORPAY_KEY_ID` (public key)
3. Add to Vercel: `RAZORPAY_KEY_SECRET` (secret key, for webhook verification)
4. Update `/api/verify-payment/route.ts` to verify signatures
5. Update registration form to show Razorpay payment dialog

## Internal Module (MyJKKN)

### Current State
- **Branch:** `omm-dev` (38 commits ahead of main)
- **Deployed at:** https://myjkkn-omm-dev.vercel.app
- **GitHub:** github.com/JKKN-Institutions/MyJKKN

### Deploy
```bash
cd /Users/omm/PROJECTS/MyJKKN
npx next build                   # Verify (77s)
git push origin omm-dev          # Auto-deploy to Vercel
```

The MyJKKN marathon module uses the same Supabase project — no additional env vars needed.

## Database Setup

### CRITICAL: Create Missing GPS Tables

The 2 GPS tracking tables must exist before race day:

```bash
# Option 1: Via Supabase CLI
~/bin/supabase db execute --project-ref hhprjbgknupaplivtoib "$(cat <<'SQL'
CREATE TABLE IF NOT EXISTS public.marathon_race_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.marathon_events(id),
  bib text NOT NULL,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  distance_km numeric(8,3) DEFAULT 0,
  pace_per_km numeric(8,2) DEFAULT 0,
  elapsed_seconds integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, bib)
);
CREATE INDEX IF NOT EXISTS idx_marathon_race_tracks_event ON public.marathon_race_tracks(event_id);
CREATE INDEX IF NOT EXISTS idx_marathon_race_tracks_bib ON public.marathon_race_tracks(bib);
ALTER TABLE public.marathon_race_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_can_insert_tracks" ON public.marathon_race_tracks FOR INSERT WITH CHECK (true);
CREATE POLICY "public_can_read_tracks" ON public.marathon_race_tracks FOR SELECT USING (true);
CREATE POLICY "public_can_update_tracks" ON public.marathon_race_tracks FOR UPDATE USING (true);

CREATE TABLE IF NOT EXISTS public.marathon_race_track_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  bib text NOT NULL,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  speed numeric(6,2),
  accuracy numeric(6,2),
  timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marathon_track_points_event_bib ON public.marathon_race_track_points(event_id, bib);
ALTER TABLE public.marathon_race_track_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_can_insert_points" ON public.marathon_race_track_points FOR INSERT WITH CHECK (true);
CREATE POLICY "public_can_read_points" ON public.marathon_race_track_points FOR SELECT USING (true);
SQL
)"

# Option 2: Via Supabase SQL Editor (dashboard.supabase.com)
# Copy the SQL above and paste into the SQL editor
```

### Verify Tables Exist
```bash
cd /Users/omm/PROJECTS/MyJKKN && node -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://hhprjbgknupaplivtoib.supabase.co', 'YOUR_ANON_KEY');
['marathon_race_tracks','marathon_race_track_points'].forEach(async t => {
  const {error} = await s.from(t).select('id').limit(0);
  console.log(t + ': ' + (error ? 'MISSING' : 'OK'));
});
"
```

## Remaining Items (Post-Deploy)

| Item | Priority | Notes |
|------|----------|-------|
| Create GPS tables in Supabase | P0 — race day blocker | SQL above |
| Point DNS marathon.jkkn.ac.in | P0 — user-facing URL | CNAME to Vercel |
| Configure Razorpay | P1 — enables online payment | Get keys from JKKN account |
| RLS review for marathon tables | P1 — security | Verify policies match spec |
| Regenerate Supabase types | P2 — DX improvement | `supabase gen types typescript` |
| Task timeline (Gantt) for committees | P3 — nice to have | Currently accordion only |
