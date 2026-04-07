# KBM Marathon 2.0 — Race Day Operations Guide

> **Date:** April 12, 2026 (Sunday)
> **Time:** 6:00 AM flag-off (assembly 5:30 AM)
> **Venue:** JKKN College Ground, Kumarapalayam

## Pre-Race Day Checklist (April 10-11)

### T-2 Days (April 10)
- [ ] Registration closes (automatic — based on `registration_close_date`)
- [ ] Verify total registration count on internal dashboard
- [ ] Print BIB stickers for all registered participants
- [ ] Prepare T-shirt inventory by size
- [ ] Place QR code posters at all checkpoints

### T-1 Day (April 11)
- [ ] Set event status to `execution` in MyJKKN Settings
- [ ] Verify GPS tables exist in Supabase (CRITICAL — run migration if not)
- [ ] Test race tracker: open `/race` on a phone, start tracking, verify data appears in Live Ops
- [ ] Test QR scanner: scan a checkpoint QR, verify it appears in checkpoint panel
- [ ] Test family tracker: share `/track/[bib]` link, verify it shows live position
- [ ] Test voice coach: enable in race tracker, verify Tamil/English announcements work
- [ ] Brief all checkpoint volunteers on QR code locations
- [ ] Brief medical team on stationary runner alert system
- [ ] Charge all coordinator phones (Live Ops needs continuous screen-on)

### Race Morning (April 12, 4:00-5:30 AM)
- [ ] Set event status to `live` via Race Controls in Live Ops (or manually in settings)
- [ ] Verify public site shows countdown expired / "Race Has Begun!"
- [ ] Open Live Ops page on coordinator laptop/tablet: `/events/marathon/[id]/live`
- [ ] Verify map loads with Kumarapalayam center
- [ ] Start volunteer check-in process
- [ ] Medical stations confirm ready

## During The Race (6:00 AM - ~8:00 AM)

### Coordinator Dashboard
Open: `https://myjkkn-omm-dev.vercel.app/events/marathon/[id]/live`

**What you see:**
- Runner count bar: Currently Tracking / On Course / Finished / Avg Pace
- Runner map: colored dots for each GPS-active runner
- Checkpoint panel: runners passed at each station + throughput
- Stationary alerts: runners with no GPS update >3 minutes (potential medical)

### Monitoring Priorities

| Priority | Watch For | Action |
|----------|----------|--------|
| CRITICAL | Stationary alert (red) | Send medical team to GPS location |
| HIGH | Checkpoint throughput drops to 0 | Send marshal to check station |
| MEDIUM | Runner count not increasing | Check if registration desk has issues |
| LOW | Average pace very slow | Normal for casual runners |

### QR Checkpoint Flow
1. Runner approaches checkpoint (water/medical/waypoint)
2. Runner opens `/race` → taps "Scan Checkpoint"
3. Camera opens → scans QR poster
4. Scan logged to `marathon_checkpoint_scans` with timestamp
5. Checkpoint panel in Live Ops updates in real-time

### Incident Logging
1. In Live Ops → Incident Panel → "Log Incident"
2. Select: type (medical/logistics/security/weather), severity (low-critical)
3. Enter description + location
4. When resolved: click "Resolve" → add resolution notes

### Family Tracker
- Runners share `/track/[bib]` link with family via WhatsApp
- Family sees: live GPS position, current distance, pace, estimated finish
- Auto-refreshes every 10 seconds
- No auth needed — anyone with the link can view

## Post-Race (8:00 AM+)

### Immediate (within 30 minutes)
1. Set event status to `post_event` via Race Controls → "End Race"
2. Go to Results page → "Import from GPS" to auto-populate finish times
3. Review imported results — check for accuracy
4. Manually enter results for runners without GPS tracking
5. Verify rankings (auto-calculated)

### Same Day
1. Generate certificate IDs: Results page → bulk action
2. Verify certificates work: scan one QR on `/verify/[certId]`
3. Share results page link: `marathon.jkkn.ac.in/results`
4. Analytics page auto-populates with race intelligence:
   - Pace distribution
   - College performance ranking
   - Checkpoint throughput heatmap
   - "Watch the Race" replay

### Within 1 Week
1. Upload event photos to gallery (manual)
2. Generate AI race stories for participants (Phase B feature)
3. Review analytics for next year's improvements
4. Archive event: Settings → status to `archived`
5. Debrief: what worked, what didn't, what to improve for KBM 3.0

## Troubleshooting

### "Race Tracker shows no GPS data"
- Check: Are GPS tables created in Supabase? (`marathon_race_tracks`, `marathon_race_track_points`)
- Check: Is the phone's location permission granted?
- Check: Is the phone's screen staying on? (Wake Lock should be active)
- Check: Is there cellular signal at the route? (GPS works offline but sync needs data)

### "Family Tracker shows 'Runner not currently tracking'"
- Runner may not have started the tracker yet
- Runner's phone may have lost signal — tracker works offline, syncs when reconnected
- Check: is the BIB number correct in the URL?

### "Live Ops map is empty"
- Most likely: GPS tables don't exist in Supabase (run migration)
- Check: Are runners actually using the race tracker? (need to open `/race` and start tracking)
- Check: Supabase status at `status.supabase.com`

### "Voice Coach not speaking"
- iOS: check that phone is not on silent mode (hardware switch)
- Tamil: verify `navigator.language` or toggle language manually
- Some browsers need user gesture before playing audio — runner must tap "Start" first

### "QR Scanner camera black/denied"
- Check browser camera permissions
- Try closing and reopening the scanner
- Fallback: manually note the checkpoint name and time — enter later

### "Registration form error on submit"
- Duplicate phone number? → "Already registered" error is expected
- Network timeout? → form data is preserved, retry submission
- Check Supabase connection status

## Emergency Contacts

| Role | Name | Phone |
|------|------|-------|
| Event Coordinator | Dhineshkumar B | — |
| Director | Ommsharravana | 77082 27266 |
| Technical Support | — | 80159 34542 |
| General Enquiry | — | 96986 24110 |
| Medical Emergency | Local ambulance | 108 |

## Key URLs (Race Day)

| URL | Purpose | Who Uses |
|-----|---------|----------|
| `marathon.jkkn.ac.in` (or Vercel URL) | Public site | Runners, families, media |
| `marathon.jkkn.ac.in/race` | GPS race tracker | Runners during the race |
| `marathon.jkkn.ac.in/track/[bib]` | Family live tracker | Families watching from home |
| `marathon.jkkn.ac.in/results` | Leaderboard | Everyone after the race |
| `myjkkn-omm-dev.vercel.app/events/marathon/[id]/live` | Live Ops command center | Coordinators |
| `myjkkn-omm-dev.vercel.app/events/marathon/[id]/results` | Results management | Coordinators |
