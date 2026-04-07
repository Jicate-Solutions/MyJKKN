# WhatsApp Chat Inbox Enhancements — Spec

> **Created:** 2026-04-08 | **Status:** Ready for implementation
> **Scope:** 6 features flagged from fresh-eyes review of PR #66
> **Timeline:** No hard deadline — iterative improvement
> **Users:** Admission counselors (desktop + mobile), field staff at expos

---

## Problem Statement

The WhatsApp chat inbox at `/admission/marketing/chat` has the right visual design (WhatsApp clone) but is missing critical workflow features that counselors need daily: assigning leads to each other, tagging conversations, and several UX features that make it feel native (emoji, voice playback, typing indicators). Dead buttons that look clickable but do nothing erode trust.

---

## Priority Order (based on interview)

| P | Feature | Why |
|---|---------|-----|
| P0 | Assign Counselor (auto + manual) | Multiple counselors need handoff — core workflow |
| P0 | Tags (predefined + custom) | Categorize conversations for follow-up |
| P1 | Emoji Picker | "Must feel like WhatsApp" — standard full emoji keyboard |
| P1 | Voice Message Playback | Parents send voice notes — counselors need to listen |
| P2 | Typing Indicator | Nice-to-have for WhatsApp feel |
| P2 | Mobile/Desktop Resize Sync | Theoretical bug — no reports yet |
| SKIP | Message Virtualization | Conversations are <50 messages — not needed now |

---

## Feature 1: Assign Counselor (P0)

### Requirements
- **Auto-assign on first inbound message** — round-robin across available counselors for that institution
- **Manual reassign anytime** — dropdown in sidebar + chat header
- **Roster source:** Users with admission role in the institution (from `profiles` table)
- **After hours:** Assign immediately (counselor responds when available)
- **Visual:** Show assigned counselor's name + avatar in chat header and sidebar

### User Stories
- As a counselor, I see only MY assigned conversations by default (filter: "My Chats")
- As a counselor, I can reassign a conversation to a colleague from the sidebar
- As an admin, I see ALL conversations regardless of assignment
- When a new WhatsApp message arrives, the system auto-assigns to the counselor with fewest active conversations

### API (already exists)
- `POST /api/admission/chat/conversations/{id}/assign` — already built
- `wa_conversations.assigned_to` column exists
- `wa_settings.auto_assignment_mode` exists (round_robin / manual / load_balanced)

### UI Changes
- **Sidebar "Assign to Counselor" button:** Replace placeholder with a `Select` dropdown listing institution staff
- **Chat header:** Show assigned counselor name next to contact name
- **Conversation list:** Add "My Chats" / "All Chats" filter

### Edge Cases
- Counselor leaves/is deactivated → conversations auto-reassign
- No counselors available → stays unassigned, admin notified
- Self-assign → counselor can claim unassigned conversations

---

## Feature 2: Tags (P0)

### Requirements
- **Predefined tags:** Admin creates tag options (hot-lead, follow-up, docs-pending, callback-requested, enrolled, lost)
- **Custom tags:** Counselors can type new tags that persist for future use
- **Multi-tag:** Conversations can have multiple tags
- **Tag colors:** Deterministic color based on tag name (already implemented in conversation list)

### User Stories
- As a counselor, I click "Add tag" in the sidebar → see predefined + recent tags → select or type new
- As a counselor, I filter conversation list by tag
- As an admin, I manage predefined tags in settings

### API (partially exists)
- `wa_conversations.tags` column exists (string array)
- Need: `PUT /api/admission/chat/conversations/{id}` to update tags
- Need: predefined tags stored in `wa_settings` or a new `wa_tag_definitions` table

### UI Changes
- **Sidebar "Add tag" button:** Replace dead button with Popover showing tag list + search/create input
- **Conversation list:** Tag pills already render — add tag filter dropdown

### Edge Cases
- Tag with special chars (emoji, quotes) — sanitize
- Removing last tag from a conversation
- Tag name >50 chars — truncate

---

## Feature 3: Emoji Picker (P1)

### Requirements
- **Standard full emoji keyboard** — same categories as WhatsApp (Smileys, People, Animals, Food, Travel, Activities, Objects, Symbols, Flags)
- **Recent emojis** — remember last 20 used
- **Search** — type to filter emojis
- **Skin tone selector** — optional, nice-to-have

### Implementation
- Use `emoji-mart` or `@emoji-mart/react` package (widely used, WhatsApp-like UI)
- Trigger: click smiley face icon (😀) in message input bar
- Insert emoji at cursor position in textarea
- Store recent emojis in localStorage

### UI Changes
- **Input bar smiley button:** Opens emoji picker Popover above input
- Picker positioned: above input on desktop, bottom sheet on mobile

---

## Feature 4: Voice Message Playback (P1)

### Requirements
- **Receive + play only** — counselors listen but reply with text
- Parents send voice notes via WhatsApp → Meta delivers as audio attachment
- Audio URL from `msg.content.media_url` with `media_mime_type: 'audio/ogg'`

### UI Changes
- **Audio bubble:** Custom audio player inside message bubble
  - Play/pause button
  - Waveform visualization (or simple progress bar)
  - Duration display
  - WhatsApp-style green waveform for outbound, gray for inbound
- Use HTML5 `<audio>` element with custom controls

### Edge Cases
- Audio URL expired (WhatsApp CDN links expire after ~30 days)
- Large audio file (>5 min) — show duration warning
- Audio format not supported by browser — show "Download" fallback link

---

## Feature 5: Typing Indicator (P2)

### Requirements
- Show "typing..." when the contact is typing on WhatsApp
- Meta does NOT send typing indicators via Cloud API webhooks — this is a limitation
- **Alternative:** Show "Counselor is typing..." to the contact (if counselor is typing in MyJKKN)

### Implementation Options
1. **Outbound only:** When counselor types in MyJKKN, call Meta API `POST /{phone_id}/messages` with `status: "typing"` (if supported)
2. **Visual only:** Show typing dots in the chat thread when counselor is composing (local UI, no API)
3. **Skip for now** — Meta Cloud API doesn't support inbound typing indicators

### Recommendation
Skip real typing indicators (API limitation). Add visual "composing" state in chat thread header when counselor is typing — purely local UI.

---

## Feature 6: Mobile/Desktop Resize Sync (P2)

### Problem
When user resizes browser from desktop to mobile width (or rotates tablet), the `mobileView` state and desktop layout can desync — e.g., profile panel visible in mobile mode with no back button.

### Fix
- Add `useMediaQuery('(min-width: 768px)')` hook
- On breakpoint change: reset `mobileView` to 'list' and `showProfile` to false
- One `useEffect` watching the media query

### Scope
~10 lines of code in `page.tsx`. No API changes.

---

## Out of Scope

- Voice message SENDING (counselors reply with text only)
- Video calling
- Message forwarding / reply-to-specific-message
- Chat pinning / muting / archiving
- Message reactions (WhatsApp Cloud API doesn't support outbound reactions)
- Message virtualization (conversations are <50 messages, not needed)
- Read receipts for group chats (1:1 only)

---

## Implementation Order

| Sprint | Features | Effort |
|--------|----------|--------|
| 1 | Assign Counselor + Tags (P0) | Backend wiring exists, UI changes only |
| 2 | Emoji Picker + Voice Playback (P1) | New dependency (emoji-mart) + audio player component |
| 3 | Typing indicator + Resize fix (P2) | Small UI additions |

---

## Acceptance Criteria

### Assign Counselor
- [ ] New conversation auto-assigns to counselor with fewest active chats
- [ ] Sidebar dropdown lists all institution staff with admission role
- [ ] Selecting a counselor updates `assigned_to` and shows in header
- [ ] "My Chats" filter shows only assigned conversations

### Tags
- [ ] "Add tag" button opens popover with predefined + search
- [ ] New custom tag persists for future conversations
- [ ] Tags visible in conversation list and sidebar
- [ ] Can remove tags by clicking X on tag pill

### Emoji Picker
- [ ] Smiley button opens full emoji keyboard
- [ ] Emoji inserted at cursor position
- [ ] Recent emojis shown first
- [ ] Search works

### Voice Playback
- [ ] Audio messages show custom player (play/pause + progress)
- [ ] Duration visible before playing
- [ ] Works on mobile browsers
