# FreeRADIUS VPS playbook — `radius.jkkn.ai` (campus Wi-Fi SSO, Part 5)

**Status:** DRAFT — Director ruling 2026-09-06 (00:05 / 00:20): answer-independent work only. No database change, no code, no server ordered by this document.
**Spec of record:** `specs/network-sso-parts-2-5-2026-09-06.md` on branch `spec/network-sso-parts-2-5` (Part 5 + "What changed since May"). Locked decisions 25–30: vault note `Initiatives/Network-Infrastructure/Spec-Decisions-Locked-2026-05-08.md`. Substrate proof: `Smoke-Test-RADIUS-2026-05-09.md` (5/5 scenarios green on a Mac).
**Companion:** [MikroTik hotspot handoff](mikrotik-hotspot-handoff.md) — the router side.
**Audience:** the JKKN sysadmin and whoever at JICATE runs the VPS. Plain English, numbered steps, one "you are done when" line per section.

**Open question that this document does NOT decide — Q3:** who owns and pays for the VPS, and whether RADIUS accounting writes go straight into the database (Option A) or through an HTTPS route in MyJKKN (Option B). Both are written out in section 8 with a pros/cons table. The Director picks.

---

## 0. What this box does (read once)

```
Phone on campus Wi-Fi
   │  joins SSID, browser is captured by the MikroTik hotspot
   ▼
MikroTik CCR2116 (hotspot)  ── redirects browser ──►  https://wifi.jkkn.ai/api/network/sso?mac=…&ip=…&link-login-only=…&link-orig=…
   ▲                                                       │  learner signs in with Google inside MyJKKN (decision Q1, 2026-09-06)
   │  browser comes back to $(link-login-only)             │  MyJKKN mints a ONE-TIME username + password
   │  with that one-time username/password  ◄──────────────┘
   │
   │  RADIUS Access-Request over RADSEC (TLS, TCP 2083)
   ▼
FreeRADIUS on the VPS (this playbook)  ── rlm_rest, HTTPS POST, 300 ms budget ──►  https://www.jkkn.ai/api/network/radius-auth
   │                                                                                     (Part 2 — checks the one-time credential,
   │  Access-Accept + Mikrotik-Rate-Limit + Session-Timeout   ◄─────────────────────────  fee status, attendance tier, device cap, lockout)
   ▼
MikroTik lets the phone out; returning devices re-enter on MAC-cookie without a page.
CoA / Disconnect (UDP 3799, VPS ──► router) ends or re-shapes a live session when MyJKKN says so (decision 30).
Accounting (Start / Interim / Stop) lands in network_sessions — by Option A or Option B (Q3).
```

Three facts to hold in your head:

1. **The router calls out; nothing calls in to campus.** Only the VPS's CoA packets (UDP 3799) go toward the router, and only from the VPS IP.
2. **The VPS never sees a real MyJKKN password.** The credential on the wire is a one-time username/password minted by MyJKKN after Google sign-in; it is dead after one use.
3. **If the VPS or MyJKKN is down, campus Wi-Fi opens up** (decision 17). Section 12 is the runbook for that morning.

---

## 1. Provision the server — Hetzner CCX13 (decision 26)

Decision 26 named Hetzner CCX13 (dedicated vCPU) at "₹400–500/month". **Price check before ordering:** a September 2026 search result reports Hetzner raised CCX prices in June 2026 and lists CCX13 at about EUR 42.99/month (≈ ₹4,000). I could not confirm this on Hetzner's own pricing page from here — read the price in the Hetzner console before clicking Order, and if it is no longer in the ₹500 band, stop and tell the Director; the backup options named in decision 26 were DigitalOcean (~$24/month) and Linode (~₹450/month). The playbook below is provider-neutral; only step 1.2 is Hetzner-specific.

1. **Owner and payer (Q3 — open).** Do not order until the Director says whose card and whose account. Whoever owns the account owns the box; write the account e-mail in the vault note `Purchases/IT-Hardware/Campus-Network-Setup.md` when done.
2. **Order:** Hetzner Cloud → New project `jicate-radius` → Add server → Location **Singapore** if offered (lowest latency to Tamil Nadu), else Falkenstein/Nuremberg → Image **Debian 13** (Debian 12 also fine — see section 2) → Type **CCX13** (2 dedicated vCPU, 8 GB RAM, 80 GB NVMe) → SSH key only (upload the sysadmin's and the Director's public keys; no password login) → Enable backups (Hetzner snapshot, ~20 % extra) → Name `radius-01`.
3. **Firewall at the provider** (Hetzner Cloud Firewall, attach to the server): allow **TCP 22** from the JKKN campus WAN IPs (Rainbow + Real Network — take the current ones from `MikroTik-Current-Config-2026-05-08.md`, e.g. `103.98.192.37`) and from the Director's home IP; allow **TCP 2083** from the campus WAN IPs only; allow **TCP 80** from anywhere ONLY while issuing the certificate (section 3), then remove; allow **ICMP**. Everything else drop. **Do not open UDP 1812/1813 anywhere** — plain RADIUS over the internet is decision 27's "no".
4. **DNS:** in the `jkkn.ai` zone add `A radius.jkkn.ai → <VPS public IPv4>` (and `AAAA` if you enabled IPv6). TTL 300 for the first week.
5. **First login and basics:**
   ```bash
   ssh root@radius.jkkn.ai
   hostnamectl set-hostname radius-01
   timedatectl set-timezone Asia/Kolkata
   apt update && apt -y full-upgrade && apt -y install unattended-upgrades fail2ban nftables curl jq
   dpkg-reconfigure -plow unattended-upgrades      # answer Yes
   ```
6. **Record in MyJKKN (later, admin UI from Part 4 — not now):** the `network_radius_servers` row already seeded in PR #792 as "JICATE Shared RADIUS (placeholder)" needs `hostname = radius.jkkn.ai`, `ipv4_address = <VPS IP>`, `auth_port = 2083`, `coa_port = 3799`, `protocol = 'radsec'`, and later `tls_cert_fingerprint` (section 3). No database change is made by this playbook — write the values in the vault note until Part 4 exists.

**You are done when:** `ssh root@radius.jkkn.ai` works with a key, `dig +short radius.jkkn.ai` returns the VPS IP, and `nmap -p 22,2083,1812 radius.jkkn.ai` from your laptop shows 22 open, 2083 filtered (until the router IPs are added), 1812 filtered.

---

## 2. Install Debian + FreeRADIUS 3.2

FreeRADIUS 3.2 is what the May smoke check used (3.2.8 on Homebrew). Debian's own package is the 3.2 line on both Debian 12 (3.2.1) and Debian 13 (newer 3.2.x) — confirm with `apt show freeradius` before installing; if it says 3.0.x you are on the wrong image. If you need a newer 3.2.x than Debian ships, NetworkRADIUS publishes Debian packages at `https://packages.networkradius.com/` — follow their page, not a copy of it.

1. Install the packages:
   ```bash
   apt -y install freeradius freeradius-utils freeradius-rest freeradius-postgresql
   systemctl stop freeradius            # we configure first, start last
   ```
   `freeradius-rest` is the `rlm_rest` module (section 6). `freeradius-postgresql` is only needed for accounting Option A (section 8) — harmless to install now.
2. Config lives in `/etc/freeradius/3.0/` on Debian (the directory is still called `3.0` for the 3.x line). Everything below uses that path. Make a pristine copy first:
   ```bash
   cp -a /etc/freeradius/3.0 /root/freeradius-pristine-$(date +%F)
   ```
3. Turn off the modules and virtual servers we do not use (smaller attack surface, faster start):
   ```bash
   cd /etc/freeradius/3.0/sites-enabled && rm -f inner-tunnel
   cd /etc/freeradius/3.0/mods-enabled && rm -f eap chap mschap digest pap unix ntlm_auth
   ```
   We keep `default` for now (we will strip it in section 6) and add `tls` in section 4. Removing `pap` is deliberate: MyJKKN checks the one-time password, not FreeRADIUS, so no local password module is needed. (If a later change needs `pap`, re-link it; nothing is deleted.)
4. Quick sanity start in debug mode, then stop:
   ```bash
   freeradius -XC                       # config check only; must end with "Configuration appears to be OK"
   ```

**You are done when:** `freeradius -v` prints a 3.2.x version and `freeradius -XC` ends with `Configuration appears to be OK`.

---

## 3. Certificate for `radius.jkkn.ai` (Let's Encrypt) and the pinned fingerprint

The router talks TLS to this box. We give the box a public certificate so the router can verify it like a browser would (decision 27), and we record the certificate's SHA-256 fingerprint in `network_radius_servers.tls_cert_fingerprint` so MyJKKN's admin screen can show "the cert the router should be seeing".

1. Install certbot and issue the certificate (port 80 must be open at the provider firewall for this minute only):
   ```bash
   apt -y install certbot
   certbot certonly --standalone -d radius.jkkn.ai --agree-tos -m it@jkkn.ac.in --non-interactive
   ```
   Files land in `/etc/letsencrypt/live/radius.jkkn.ai/` (`fullchain.pem`, `privkey.pem`). Close port 80 again at the provider firewall.
2. Make the key readable by FreeRADIUS without loosening `/etc/letsencrypt`:
   ```bash
   install -d -o freerad -g freerad -m 750 /etc/freeradius/3.0/certs/le
   cat > /etc/letsencrypt/renewal-hooks/deploy/radius.sh <<'EOF'
   #!/bin/sh
   set -e
   D=/etc/letsencrypt/live/radius.jkkn.ai
   install -o freerad -g freerad -m 640 "$D/fullchain.pem" /etc/freeradius/3.0/certs/le/fullchain.pem
   install -o freerad -g freerad -m 640 "$D/privkey.pem"   /etc/freeradius/3.0/certs/le/privkey.pem
   systemctl restart freeradius
   openssl x509 -in "$D/cert.pem" -noout -fingerprint -sha256 | sed 's/^.*=//' > /var/lib/radius-cert-fingerprint.txt
   logger -t radius-cert "renewed; new SHA-256 fingerprint: $(cat /var/lib/radius-cert-fingerprint.txt)"
   EOF
   chmod 755 /etc/letsencrypt/renewal-hooks/deploy/radius.sh
   /etc/letsencrypt/renewal-hooks/deploy/radius.sh
   ```
3. Read the fingerprint that goes into `network_radius_servers.tls_cert_fingerprint`:
   ```bash
   cat /var/lib/radius-cert-fingerprint.txt
   # e.g. AB:CD:12:…  (64 hex digits with colons)
   ```
   Give this string to the Director (WhatsApp is fine — it is public information, the certificate itself is public). Until Part 4's admin screen exists it is written into the vault note; when Part 4 ships it is pasted into the RADIUS-server row.
4. **Renewal changes the fingerprint.** Let's Encrypt certificates live 90 days and certbot renews at ~60. Every renewal restarts FreeRADIUS (a 1–2 second blip; the router retries) and writes a new fingerprint to `/var/lib/radius-cert-fingerprint.txt` and to syslog. Two ways to live with that — pick one with the Director:
   - **Pin the CA, not the leaf** (recommended): the router trusts the Let's Encrypt root (ISRG Root X1); `tls_cert_fingerprint` becomes informational, refreshed by the health check in section 10. Nothing breaks at renewal.
   - **Pin the leaf**: the router (or MyJKKN's admin screen) verifies the exact fingerprint; someone must paste the new value every ~60 days or Wi-Fi login stops. Only choose this if a stronger threat model demands it.
5. Certbot's systemd timer (`systemctl list-timers certbot*`) does the renewal on its own; the deploy hook above runs only when a renewal actually happens.

**You are done when:** `openssl s_client -connect radius.jkkn.ai:2083 </dev/null 2>/dev/null | openssl x509 -noout -subject -dates` (after section 4 is up) shows `CN = radius.jkkn.ai` with a future `notAfter`, and the fingerprint file matches `openssl x509 -in /etc/letsencrypt/live/radius.jkkn.ai/cert.pem -noout -fingerprint -sha256`.

---

## 4. RADSEC listener on TCP 2083

RADSEC = RADIUS inside TLS (RFC 6614). FreeRADIUS ships the listener as `sites-available/tls`; we enable it and point it at the Let's Encrypt files. Source: FreeRADIUS "Enable RadSec" how-to — `https://www.freeradius.org/documentation/freeradius-server/3.2.9/howto/protocols/proxy/enable_radsec.html` and the annotated `sites-available/tls` at `https://networkradius.com/doc/current/raddb/sites-available/tls.html`.

1. Enable the virtual server:
   ```bash
   ln -s ../sites-available/tls /etc/freeradius/3.0/sites-enabled/tls
   ```
2. Edit `/etc/freeradius/3.0/sites-enabled/tls`. In the first `listen { … }` block set:
   ```
   listen {
       ipaddr = *
       port = 2083
       type = auth+acct          # one socket for Access-Request AND Accounting-Request
       proto = tcp
       virtual_server = default
       limit {
           max_connections = 64
           lifetime = 0
           idle_timeout = 600
       }
       tls {
           private_key_file = /etc/freeradius/3.0/certs/le/privkey.pem
           certificate_file = /etc/freeradius/3.0/certs/le/fullchain.pem
           ca_file = /etc/ssl/certs/ca-certificates.crt
           fragment_size = 8192
           tls_min_version = "1.2"
           require_client_cert = no     # the router does not present a client certificate (see handoff §3)
       }
   }
   ```
   Leave the `home_server`/proxy parts of that file untouched — we do not proxy anywhere.
3. `require_client_cert = no` is a deliberate first-week choice: RouterOS 7's `/radius add … certificate=` is optional and the router does not have a client certificate yet. Mutual TLS (router presents a cert the VPS verifies) is the hardening step for after the parallel week; add it as a follow-up in section 9.
4. Delete or comment out the plain-UDP `listen` blocks in `sites-enabled/default` (`type = auth` on 1812 and `type = acct` on 1813 bound to `ipaddr = *`). Keep ONE UDP listener bound to `127.0.0.1` on 1812 so `radclient` on the box can run local checks:
   ```
   listen { type = auth   ipaddr = 127.0.0.1  port = 1812 }
   listen { type = acct   ipaddr = 127.0.0.1  port = 1813 }
   ```
   With no public UDP listener, ports 1812/1813 are closed even if a firewall rule is wrong — belt and braces (section 9).
5. Restart and confirm the listener line in the debug output:
   ```bash
   systemctl restart freeradius && sleep 1 && journalctl -u freeradius -n 30 --no-pager
   # or, one-off: freeradius -X | grep -m1 'Listening on auth+acct proto tcp address \* port 2083 (TLS)'
   ```

**You are done when:** `ss -ltnp | grep 2083` shows FreeRADIUS listening on `*:2083`, and `openssl s_client -connect radius.jkkn.ai:2083 </dev/null` completes a handshake (`Verify return code: 0 (ok)`).

---

## 5. `clients.conf` — one entry per router, keyed by NAS-Identifier

Multi-tenancy per decision 26: every router that is allowed to talk to this box gets its own client entry. FreeRADIUS matches a client by **source IP**; the router also sends a **NAS-Identifier** attribute in every request. We use both: the IP says "this connection is allowed at all", the NAS-Identifier says "which registered router this is" and MyJKKN maps it to `network_routers.radius_nas_identifier` → institution(s).

**Two facts that change what decision 26 wrote:**

- **RouterOS forces the RADSEC shared secret to the word `radsec`** — "With RadSec RouterOS forces the shared secret to 'radsec' regardless of what has been set manually" (`https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS`). FreeRADIUS's RADSEC clients also default to `radsec`. So there is **no per-router unique secret** under RADSEC. What keeps tenant A out of tenant B is: TLS + the per-router source-IP allow-list + the NAS-Identifier check below. `network_routers.radius_shared_secret_ref` stays as the vault pointer for the literal `radsec` (or for a UDP fallback router), not as a per-tenant key.
- **One JKKN router serves 14 institutions.** The CCR2116 fronts every JKKN college. So the NAS-Identifier is the **router's** slug (e.g. `jkkn-main`), and the learner's own institution comes from their MyJKKN profile at authorisation time. For a future JICATE customer with one router per campus, router slug = institution slug and the spec's wording holds. Per-college tagging on the same router can additionally be sent by the hotspot profile's `radius-location-id` (WISPr-Location-ID) — see handoff §6 — `[UNVERIFIED — check on the router]` that the hotspot includes it in Access-Request.

1. RADSEC clients are declared INSIDE the `tls` virtual server, in the `clients radsec { … }` block of `/etc/freeradius/3.0/sites-enabled/tls` (not in `clients.conf`, which is for UDP). Replace the example client with one block per router:
   ```
   clients radsec {
       client jkkn-main {
           ipaddr        = 103.98.192.37        # Real Network WAN of the CCR2116 (from MikroTik-Current-Config-2026-05-08)
           proto         = tls
           secret        = radsec               # forced by RouterOS; do not "improve" this
           shortname     = jkkn-main            # == NAS-Identifier the router sends (handoff §5)
           nas_type      = other
           virtual_server = default
       }
       client jkkn-main-rainbow {
           ipaddr        = <Rainbow WAN IP>     # the CCR2116 has TWO WANs with PCC load-balancing; RADIUS may leave by either
           proto         = tls
           secret        = radsec
           shortname     = jkkn-main
           virtual_server = default
       }
       # client <customer-slug> { … }  — one more block per JICATE customer router, never a wildcard
   }
   ```
   The second block exists because the CCR2116 balances two WANs; unless the router pins RADIUS to one WAN with `src-address` (handoff §3 does this), packets can arrive from either IP.
2. Enforce "IP matches identity" in the `authorize` section of `sites-enabled/default` (before the `rest` call from section 6):
   ```
   authorize {
       if (!NAS-Identifier || (NAS-Identifier != "%{Client-Shortname}")) {
           reject
       }
       …
   }
   ```
   A router that connects from an allowed IP but claims another tenant's slug is rejected before MyJKKN is ever asked.
3. Adding a router later = add one `client` block + one `network_routers` row (Part 4 admin) + `systemctl reload freeradius`. Zero code, which is the point of decision 26.

**You are done when:** `freeradius -XC` is OK, and a connection from an IP NOT in the list is refused at the TLS layer (from your laptop: `openssl s_client -connect radius.jkkn.ai:2083` fails — the provider firewall should already stop it — while from the router the handoff's `/radius monitor 0` shows `accepts` counting up).

---

## 6. `rlm_rest` authorize → MyJKKN (`/api/network/radius-auth`), bearer from Supabase Vault, 300 ms budget

This is the wire the May smoke check proved: FreeRADIUS turns the Access-Request into one HTTPS POST and turns the JSON answer back into RADIUS attributes. Source: annotated `mods-available/rest` — `https://networkradius.com/doc/current/raddb/mods-available/rest.html`.

1. Enable the module and write its config:
   ```bash
   ln -sf ../mods-available/rest /etc/freeradius/3.0/mods-enabled/rest
   ```
   `/etc/freeradius/3.0/mods-available/rest` — replace the file body with:
   ```
   rest {
       connect_uri = "https://www.jkkn.ai"
       connect_timeout = 1.0

       tls {
           ca_path = /etc/ssl/certs
           check_cert = yes
           check_cert_cn = yes
       }

       authorize {
           uri = "${..connect_uri}/api/network/radius-auth"
           method = 'post'
           body = 'json'
           data = '{ "username": "%{User-Name}", "password": "%{User-Password}", "nas_identifier": "%{NAS-Identifier}", "nas_ip": "%{Packet-Src-IP-Address}", "client_mac": "%{Calling-Station-Id}", "called_station": "%{Called-Station-Id}", "nas_port_id": "%{NAS-Port-Id}", "acct_session_id": "%{Acct-Session-Id}", "location_id": "%{WISPr-Location-ID}" }'
           timeout = 0.3                      # 300 ms — the spec's hot-path budget
           tls = ${..tls}
       }

       pool {
           start = 4
           min = 4
           max = 32
           spare = 8
           uses = 0
           lifetime = 0
           idle_timeout = 60
       }
   }
   ```
   **Bearer token:** `rlm_rest` in 3.2 sends custom headers from the `REST-HTTP-Header` attribute in the `control` list. Add this to `authorize` in `sites-enabled/default` immediately before calling `rest` (step 3), reading the token from a root-only file so it never sits in the main config:
   ```
   update control {
       &REST-HTTP-Header += "Authorization: Bearer %{exec:/usr/local/sbin/radius-token}"
   }
   ```
   Simpler and faster — avoid the `exec` on every request by writing the header literally into a small include file with `chmod 600 root:freerad`:
   ```bash
   install -o root -g freerad -m 640 /dev/null /etc/freeradius/3.0/radius-auth-token.conf
   printf 'update control {\n    &REST-HTTP-Header += "Authorization: Bearer %s"\n}\n' "<TOKEN>" > /etc/freeradius/3.0/radius-auth-token.conf
   ```
   and `$INCLUDE radius-auth-token.conf` inside `authorize`. `[UNVERIFIED — check on the box]` that your packaged `rlm_rest` honours `REST-HTTP-Header` (it is documented for 3.0.16+; run `freeradius -X` and look for `Authorization: Bearer` in the curl debug lines when `rest` runs).
2. **Where the token comes from.** MyJKKN stores per-RADIUS-server bearer tokens in **Supabase Vault** (Part 2: "authenticated by a per-server bearer from Supabase Vault"). The Director or a super admin generates it in MyJKKN (Part 4 admin, when built) and hands it over out-of-band once; it is written into the file above and nowhere else. Rotation = new token in MyJKKN → new file on the VPS → `systemctl reload freeradius`. Until Part 2/4 exist, `radius-auth` answers nothing — this section can be configured but only proven against the local mock (`scripts/network/radius-smoke/`, Part 2).
3. Wire it into the `default` virtual server. `/etc/freeradius/3.0/sites-enabled/default`, `authorize { … }` becomes, in this order:
   ```
   authorize {
       preprocess
       if (!NAS-Identifier || (NAS-Identifier != "%{Client-Shortname}")) { reject }
       $INCLUDE radius-auth-token.conf
       rest
       if (ok || updated) {
           update control { &Auth-Type := Accept }
       }
   }
   authenticate {
       Auth-Type Accept { ok }
   }
   post-auth {
       Post-Auth-Type REJECT { attr_filter.access_reject }
   }
   ```
   MyJKKN already checked the one-time password, so FreeRADIUS sets `Auth-Type := Accept` when the HTTP call returned OK. Remove `files`, `sql`, `pap`, `chap`, `mschap`, `eap`, `expiration`, `logintime` from these sections — they would fail-closed on attributes we never send.
4. **What MyJKKN must answer** (the contract the May mock implemented, kept here so the sysadmin can read a debug log):
   - HTTP **200/201** with a JSON body of reply attributes → Access-Accept. `rlm_rest` maps JSON keys to attributes with `:=`/`+=` operators:
     ```json
     { "reply:Mikrotik-Rate-Limit": "50M/25M", "reply:Mikrotik-Group": "tier_a_learner", "reply:Session-Timeout": 28800, "reply:Idle-Timeout": 600 }
     ```
   - HTTP **401** or **403** → Access-Reject (fee overdue, locked, device cap, bad one-time credential). MyJKKN puts the human reason in its own audit row; the router only sees Reject.
   - HTTP **5xx** or a timeout past 300 ms → `fail`. **The learner is rejected, not let in** — decision 17's "open Wi-Fi when MyJKKN is down" is implemented on the router (section 12), not by accepting blindly here.
   - Reference mapping in the module doc: 401/403 → reject, 204 → ok, 5xx → fail, 404 → notfound.
5. The Mikrotik vendor dictionary (`Mikrotik-Rate-Limit`, `Mikrotik-Group`, …) ships with FreeRADIUS (`/usr/share/freeradius/dictionary.mikrotik`) and is included by default — nothing to add.

**You are done when:** with `freeradius -X` running and MyJKKN's `radius-auth` route (or the Part-2 mock on the box) answering, `echo 'User-Name=learner-a@jkkn.ai,User-Password=one-time-x,NAS-Identifier=jkkn-main' | radclient -x 127.0.0.1:1812 auth testing123` prints `Received Access-Accept` carrying `Mikrotik-Rate-Limit`, and the debug shows the `rest` call finishing well under 300 ms (`rlm_rest (rest): … Response code: 200`).

---

## 7. CoA / Disconnect on UDP 3799 toward each router (decision 30) and how MyJKKN triggers it

When a learner pays an overdue fee, or an admin presses "end session" (Part 4), the live session must change NOW, not at the next 8-hour re-login. RFC 5176 does this: the VPS sends a **Disconnect-Request** (kick) or **CoA-Request** (change rate limit / timeout) to the router, which acts within ~2 s. RouterOS listens for these on `/radius incoming` (default port 1700 — we set 3799 to match the seeded `network_radius_servers.coa_port`; handoff §4). What a CoA may change on RouterOS: `Mikrotik-Rate-Limit`, `Mikrotik-Group`, `Session-Timeout`, `Idle-Timeout`, `Filter-Id`, … — "it is not possible to change IP address, pool or routes that way — for such changes a user must be disconnected first" (`https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS`).

1. **The sending tool is `radclient`** (already installed with `freeradius-utils`). From the VPS, a kick looks like:
   ```bash
   echo 'User-Name="<the one-time username>",Acct-Session-Id="<from accounting>",Framed-IP-Address=192.168.99.23' \
     | radclient -x 103.98.192.37:3799 disconnect radsec
   ```
   and a rate change:
   ```bash
   echo 'User-Name="…",Acct-Session-Id="…",Mikrotik-Rate-Limit="10M/5M"' | radclient -x 103.98.192.37:3799 coa radsec
   ```
   `[UNVERIFIED — check on the router]` which secret RouterOS expects on **incoming** CoA when the outgoing entry is RADSEC — the docs say the secret is forced to `radsec` for the RADSEC client; if the router answers `CoA-NAK`/silence, try the plain secret you set on the `/radius add` line. Confirm on the first live kick and write the answer into this section.
2. **How MyJKKN triggers it.** FreeRADIUS has no HTTP API of its own, so the VPS runs a tiny receiver: an HTTPS endpoint (`https://radius.jkkn.ai:8443/coa`, bearer-protected with a second Vault token, allow-listed to Vercel egress is not possible — so bearer + rate-limit) that accepts `{ "action": "disconnect" | "coa", "router_ip": …, "username": …, "acct_session_id": …, "attrs": { … } }` and shells out to `radclient`. ~60 lines of Python under systemd, logging every call to syslog. MyJKKN's Part 4 `app/api/network/admin/kick/route.ts` and the fee-paid hook call this receiver with the `Acct-Session-Id` it stored from accounting (section 8). **This receiver is not in the repo** — it is the sysadmin's service on the box; keep its source in `/usr/local/sbin/coa-receiver.py` and a copy in the vault. If the Director prefers, the receiver can instead poll MyJKKN every 5 s for pending CoA jobs (outbound-only, no listener) — cheaper to secure, 5 s slower.
3. Router side (handoff §4): `/radius incoming set accept=yes port=3799` plus one firewall rule allowing UDP 3799 from the VPS IP only.
4. Provider firewall: nothing to open — CoA is outbound from the VPS.

**You are done when:** a `radclient … disconnect` for a live phone on the JKKN-RADIUS-Test SSID prints `Received Disconnect-ACK` and the phone drops to the login page within 5 s (and `/ip hotspot active print` on the router no longer lists it).

---

## 8. Accounting — OPTION A (direct `rlm_sql` writes) vs OPTION B (HTTPS receiver) — **Q3, Director decides**

RADIUS Accounting is the router telling the VPS "session started / still going (every 5 min) / ended, with byte counts". That is what fills `network_sessions` (`started_at`, `last_seen_at`, `ended_at`, `bytes_uploaded/downloaded`, `end_reason`) and what gives CoA its `Acct-Session-Id`. Decision 28 (May) chose direct writes; the September spec reopened it as Q3. Both are drafted below; **neither is enabled until the Director picks.** Volume estimate from decision 28: ~16,500 packets/day per institution at 5-min interim.

| | **OPTION A — direct `rlm_sql` INSERT into `network_sessions`** | **OPTION B — HTTPS receiver route in MyJKKN (`/api/network/radius-acct`)** |
|---|---|---|
| Path | VPS → Postgres (Supabase, port 5432/6543) | VPS → Vercel route → Supabase |
| Latency per packet | ~5–20 ms | ~100–300 ms (cold starts more) |
| Cost at 16.5k packets/day/institution | none beyond the VPS | ~0.5 M Vercel invocations/month at 1 institution; ×14 colleges is still 1 router today, so ×1 — but every JICATE customer adds its own |
| Credentials on the VPS | a **dedicated Postgres role** with `INSERT` on `network_sessions` only (no SELECT/UPDATE/DELETE; `UPDATE` needed for Interim/Stop — see note) | a bearer token (Vault), same pattern as section 6 |
| Blast radius if the VPS is compromised | attacker can insert rows (and update session rows if UPDATE is granted); cannot read learners | attacker can call one route with one token; MyJKKN validates and rate-limits |
| Business logic (map `User-Name` → `user_id`, `institution_id`, tier snapshot) | must be done in SQL on the VPS (`queries.conf`) or by a trigger in the database | lives in TypeScript next to Part 2, tested in CI |
| Schema drift | every `network_sessions` column change breaks `queries.conf` silently | route changes with the code |
| Route ceiling | 0 routes | +1 route against the 2,048 cap (headroom 19 today, 55 after #3295) |
| Supabase connection | needs the **direct** connection (or the pooler in session mode), IP allow-list on Supabase, SSL required; a dedicated role must be created by migration (Director-gated) | none |
| Behaviour when MyJKKN is down | accounting still lands (DB up, app down) | accounting buffered by FreeRADIUS's `detail` log and replayed, or lost |
| Who runs the SQL | sysadmin + JICATE | MyJKKN builders |

**Note on "INSERT-only":** RADIUS accounting is one INSERT (Start) and then UPDATEs (Interim, Stop) of the same row keyed by `Acct-Session-Id`. A strictly INSERT-only role forces an **append-only** design: one `network_session_events` row per packet and a view/trigger that folds them into `network_sessions`. That is the cleaner security story but it is a schema change (Part 1 revision territory). If the Director picks A, the choice inside A is: (A1) grant `INSERT, UPDATE` on `network_sessions` to the role, or (A2) append-only events table + trigger — A2 recommended.

**Option A — what the sysadmin would configure (not yet):**
```
# /etc/freeradius/3.0/mods-available/sql
sql {
    dialect = "postgresql"
    driver = "rlm_sql_postgresql"
    server = "db.kvizhngldtiuufknvehv.supabase.co"     # direct host, not the API host
    port = 5432
    login = "radius_acct"                              # created by a Director-gated migration
    password = "<from the same root-only file pattern as section 6>"
    radius_db = "postgres"
    read_clients = no
    acct_table1 = "network_sessions"
    acct_table2 = "network_sessions"
    pool { start = 2  min = 2  max = 8  spare = 2  idle_timeout = 60 }
    $INCLUDE ${modconfdir}/${.:name}/main/${dialect}/queries.conf
}
```
plus a hand-written `mods-config/sql/main/postgresql/queries.conf` whose `accounting { start / interim-update / stop }` sections target our columns (`client_mac`, `client_ip`, `acct_session_id`, `bytes_*`, `last_seen_at`, `ended_at`, `end_reason`) instead of the stock `radacct` table, and `sslmode=require` in the driver connection string. Then `ln -s ../mods-available/sql mods-enabled/sql` and `sql` in the `accounting { }` section of `sites-enabled/default`. Source: `https://networkradius.com/doc/current/raddb/mods-available/sql.html`.

**Option B — what the sysadmin would configure (not yet):** a second `rest` block (`accounting { uri = "${..connect_uri}/api/network/radius-acct" method = 'post' body = 'json' data = '{ "acct_status_type": "%{Acct-Status-Type}", "acct_session_id": "%{Acct-Session-Id}", "username": "%{User-Name}", "nas_identifier": "%{NAS-Identifier}", "client_mac": "%{Calling-Station-Id}", "client_ip": "%{Framed-IP-Address}", "bytes_in": "%{Acct-Input-Octets}", "bytes_out": "%{Acct-Output-Octets}", "session_time": "%{Acct-Session-Time}", "terminate_cause": "%{Acct-Terminate-Cause}" }' timeout = 2 }`) and `rest` in `accounting { }`. Also enable the `detail` module so packets are spooled to `/var/log/freeradius/radacct/` and can be replayed with `radsqlrelay`/`radclient` after an outage.

**Either way, until Q3 is decided:** enable only the `detail` module in `accounting { }` so every packet is written to disk on the VPS and nothing is lost; it can be replayed into A or B later.

**You are done when (after the Director's pick):** a phone that joins and leaves the JKKN-RADIUS-Test SSID produces one `network_sessions` row with `started_at`, `last_seen_at` ticking every 5 min, and `ended_at` + `end_reason` set after logout — visible in Supabase and, once Part 4 ships, on `/admin/network?tab=sessions`.

---

## 9. Hardening

1. **Per-router IP allow-list** at three layers: Hetzner Cloud Firewall (TCP 2083 only from campus WAN IPs), nftables on the box (same, in case the provider rule is edited by mistake), and the `clients radsec` blocks (section 5). nftables:
   ```bash
   cat > /etc/nftables.conf <<'EOF'
   flush ruleset
   table inet filter {
     set radius_clients { type ipv4_addr; elements = { 103.98.192.37, <Rainbow WAN IP> } }
     set admin_ips      { type ipv4_addr; elements = { <campus WAN IPs>, <Director home IP> } }
     chain input {
       type filter hook input priority 0; policy drop;
       ct state established,related accept
       iif lo accept
       ip protocol icmp accept
       tcp dport 22   ip saddr @admin_ips accept
       tcp dport 2083 ip saddr @radius_clients accept
       tcp dport 8443 accept                  # CoA receiver — bearer-protected; tighten to Vercel egress if a fixed range ever exists
       # UDP 1812/1813 deliberately absent — no plain RADIUS from the internet (decision 27)
     }
   }
   EOF
   systemctl enable --now nftables && nft list ruleset
   ```
2. **fail2ban / rate limits:** a `freeradius` jail is not stock; the cheap win is nftables connection-rate limiting on 2083 (`tcp dport 2083 ct state new limit rate 20/second accept`) and `max_connections = 64` in the TLS listener (section 4). For SSH, the stock `sshd` jail:
   ```bash
   printf '[sshd]\nenabled = true\nmaxretry = 4\nbantime = 1h\n' > /etc/fail2ban/jail.d/sshd.local && systemctl restart fail2ban
   ```
   Brute-force of the RADIUS credential itself is MyJKKN's job (decision 5: 5 attempts → 30-min lockout lives in `network_lockouts`), not the VPS's.
3. **No UDP 1812/1813 exposed:** enforced by having no public UDP listener (section 4 step 4) AND by the two firewalls. Check from outside: `nmap -sU -p 1812,1813 radius.jkkn.ai` → `open|filtered` at worst, never `open` with a reply.
4. **SSH:** keys only (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`), `AllowUsers root sysadmin`, and the admin IP set above.
5. **Secrets on disk:** the bearer token file and any DB password are `640 root:freerad`; `/etc/freeradius/3.0` is `750 freerad:freerad`; nothing is in the shell history (`unset HISTFILE` while pasting tokens, or type them into the file with an editor).
6. **Logs:** `journalctl -u freeradius` keeps auth decisions; set `auth = yes`, `auth_badpass = no`, `auth_goodpass = no` in `radiusd.conf` `log { }` so usernames are logged but never passwords (they are one-time anyway).
7. **Unattended upgrades** are on from section 1; FreeRADIUS restarts on a package upgrade are ~2 s; the router retries (`timeout=2s` in the handoff).
8. **Later (after the parallel week):** mutual TLS (`require_client_cert = yes` + a client certificate on the router via `/radius add … certificate=`), and moving the CoA receiver behind a fixed-IP relay if one exists.

**You are done when:** `nft list ruleset` shows the drop policy with the two sets populated, `nmap -Pn -p 22,2083,8443,1812 radius.jkkn.ai` from a non-allow-listed network shows only 8443 open, and `fail2ban-client status sshd` reports the jail active.

---

## 10. Health check + alert

1. **Local liveness** (every minute, systemd timer): `radclient` against the 127.0.0.1 listener with a status-server packet, and a TLS handshake check on 2083.
   ```bash
   cat > /usr/local/sbin/radius-health <<'EOF'
   #!/bin/sh
   set -e
   echo 'Message-Authenticator=0x00' | radclient -q -t 2 127.0.0.1:1812 status testing123 >/dev/null 2>&1 || { logger -t radius-health "FAIL status-server"; exit 1; }
   openssl s_client -connect 127.0.0.1:2083 -servername radius.jkkn.ai </dev/null 2>/dev/null | grep -q 'Verify return code: 0' || { logger -t radius-health "FAIL tls"; exit 1; }
   EXP=$(openssl x509 -in /etc/freeradius/3.0/certs/le/fullchain.pem -noout -enddate | cut -d= -f2)
   [ "$(date -d "$EXP" +%s)" -gt "$(date -d '+14 days' +%s)" ] || logger -t radius-health "WARN cert expires $EXP"
   logger -t radius-health "ok"
   EOF
   chmod 755 /usr/local/sbin/radius-health
   ```
   `status` needs `status_server = yes` in `radiusd.conf` (default on) — `[UNVERIFIED — check on the box]` that the packaged `radclient` accepts `status`; if not, replace with an `auth` packet for a fixed reject user.
2. **External check (what actually pages someone):** a free uptime monitor (UptimeRobot / Better Stack / Hetzner's own) doing a **TCP** check on `radius.jkkn.ai:2083` every minute and a **HTTPS** check on `https://radius.jkkn.ai:8443/healthz` (the CoA receiver answers 200 with `{ "freeradius": "up", "cert_days_left": N }`). Alert route: WhatsApp/e-mail to the sysadmin and the Director — decision 23's WhatsApp pattern already exists for anomaly alerts; reuse the same number.
3. **From MyJKKN's side** (Part 4, when built): `network_radius_servers.last_health_status` is updated by a cron that opens a TLS socket to `hostname:auth_port` and compares the presented certificate's SHA-256 with `tls_cert_fingerprint` (informational if the CA-pin choice was made in section 3). Not part of this playbook.
4. **What "healthy" means for the router:** `/radius monitor 0` on the router shows `timeouts` not increasing (handoff §9). That number, not the VPS's own opinion, is the truth the sysadmin reads first.

**You are done when:** killing FreeRADIUS on purpose (`systemctl stop freeradius`) produces an alert on the phone within 3 minutes, and `systemctl start freeradius` clears it.

---

## 11. Backup / restore of the configuration

Everything that matters is text under `/etc/freeradius/3.0`, `/etc/letsencrypt`, `/etc/nftables.conf`, `/usr/local/sbin/`, and the two secret files.

1. **Nightly tarball to the vault owner's storage** (systemd timer, 02:30 IST):
   ```bash
   tar czf /root/backup/radius-$(date +%F).tgz /etc/freeradius/3.0 /etc/letsencrypt /etc/nftables.conf /usr/local/sbin /etc/fail2ban/jail.d 2>/dev/null
   find /root/backup -name 'radius-*.tgz' -mtime +30 -delete
   ```
   and `rclone copy /root/backup <remote>:jicate-radius-backups/` to a bucket the Director controls (Hetzner Object Storage or Google Drive via rclone). Secrets are inside — the bucket must be private.
2. **Hetzner snapshots** (enabled in section 1) cover the whole disk weekly; they are the "rebuild in 10 minutes" path.
3. **Restore drill (do it once, before cutover):** create a second CCX13, `tar xzf` the latest tarball onto it, `apt install` the same packages, `freeradius -XC`, point a laptop's `radclient` at it. Note the time it took in the vault. Decision 17 assumes this box can be rebuilt in under an hour.
4. **Restore for real:** new server → section 1 steps 3–5 → untar → `certbot certonly` again only if `/etc/letsencrypt` was not restored → `systemctl restart freeradius nftables` → update the `A` record if the IP changed → tell the router nothing (it points at the DNS name) — `[UNVERIFIED — check on the router]` that RouterOS `/radius add address=` accepts a DNS name; the MikroTik doc lists `address` as "IPv4 or IPv6 address", so plan on updating the router's `/radius set 0 address=<new IP>` too.

**You are done when:** yesterday's tarball exists in the remote bucket and the restore drill produced a working second box once.

---

## 12. Decision-17 failover runbook — what to do at 6 am when MyJKKN or the VPS is down

Decision 17: **"Open Wi-Fi auto-restored until MyJKKN heals (safety-first)."** Meaning: campus internet must not depend on a cloud box being up. When the chain breaks, the hotspot steps aside and everyone gets plain internet (no login, no tiers, no accounting); when the chain heals, the hotspot steps back in and returning phones re-enter silently on MAC-cookie.

### How it opens automatically (what is already in place after the handoff, §10)

- The router runs a scheduler script every minute that asks `https://www.jkkn.ai/api/network/health?nas=jkkn-main` (a Part-2 route; until it exists the script checks `/radius monitor` timeouts instead — handoff §10 has both variants) and counts consecutive failures.
- After **3 consecutive failures** (3 minutes) it disables the hotspot server on the test bridge (`/ip hotspot disable hs-test`) and writes `WIFI-FAILOVER OPEN` to the router log. Every phone on that SSID now has open internet.
- After **5 consecutive successes** it re-enables the hotspot (`/ip hotspot enable hs-test`) and logs `WIFI-FAILOVER CLOSED`. Phones with a valid MAC-cookie get back in without seeing a page; new phones see the login page again.
- The **panic button** in MyJKKN admin (Part 4) is the manual version of the same switch: it makes the health route answer `open` for that router until an admin clears it. Not built yet; until then the manual steps below are the panic button.

### The 6 am steps (sysadmin)

1. **Confirm it is a real outage, not one phone.** From any campus device open `https://www.jkkn.ai` — does it load? On the router (WinBox → Terminal): `/radius monitor 0` — is `timeouts` climbing? `/log print where message~"WIFI-FAILOVER"` — did the script already open the Wi-Fi?
2. **If the log shows `WIFI-FAILOVER OPEN`: nothing to do for learners.** Wi-Fi is open. Send the Director one line: "Wi-Fi in failover-open since HH:MM, cause: MyJKKN/VPS down." Go to step 5.
3. **If the outage is real but the script did NOT open** (log silent, learners complaining "login page does not load"): open it by hand —
   ```
   /ip hotspot disable [find name=hs-test]
   /log warning "WIFI-FAILOVER OPEN (manual)"
   ```
   Learners are online within a minute. Then find out why the script did not fire: `/system scheduler print` (is `wifi-failover` enabled? `run-count` increasing?) and `/system script print` — fix later, not at 6 am.
4. **If MyJKKN is up but the VPS is down** (site loads, `timeouts` climbing, `ssh root@radius.jkkn.ai` refused): the script opens the Wi-Fi anyway in the health-route-less variant. Try `ssh` once more; if it answers, `systemctl status freeradius` → `systemctl restart freeradius`; if the box is gone, Hetzner console → Power → Reset; if still gone, section 11 step 4 (restore on a new box). None of this is urgent for learners — they are online.
5. **Tell people:** WhatsApp to the Director + IT group: "Campus Wi-Fi open (no login) since HH:MM — MyJKKN/RADIUS outage. Login returns automatically when the service is back." No learner-facing message is needed; they simply have internet.
6. **How it closes again — automatically:** once the health check succeeds 5 times in a row, the router re-enables the hotspot. Check `/log print where message~"WIFI-FAILOVER CLOSED"` and `/ip hotspot print` (`hs-test` no longer `X`). If you opened it BY HAND in step 3, the script's success counter will re-enable it too (it calls `enable`), unless you also disabled the scheduler — in that case close it yourself:
   ```
   /ip hotspot enable [find name=hs-test]
   /log warning "WIFI-FAILOVER CLOSED (manual)"
   ```
7. **After it is closed:** every session that ran during the open window was unmetered and un-audited; Part 4 records the window as an audit row (`is_emergency_open = true` exists on `network_sessions` for exactly this). Until Part 4, write the open/close times in the vault note.
8. **Write the incident down** (5 lines: when opened, why, when closed, what fixed it, what to change) in `Initiatives/Network-Infrastructure/` — the 1-week parallel run (decision 20) is judged partly on how many of these there were.

**You are done when:** you can point at two log lines — `WIFI-FAILOVER OPEN` and `WIFI-FAILOVER CLOSED` — with times, the Director has one message, and the incident note exists. If the window was longer than 30 minutes with the VPS reachable, section 10's alert did not do its job — fix that next.

---

## 13. What this playbook does NOT do (so nobody assumes it)

- It does not order the server or create the DNS record — Q3 first.
- It does not create the `radius_acct` Postgres role, the `network_*` tables (PR #792 is still Draft and un-applied on production), or any migration — Director-gated.
- It does not build `/api/network/radius-auth`, `/api/network/sso`, the health route, or the panic button — Parts 2–4.
- It does not touch live campus SSIDs — the handoff limits the hotspot to `JKKN-RADIUS-Test` until the 50-user parallel week is green.

*Sources verified on 2026-09-06: MikroTik RADIUS page (`https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS`), FreeRADIUS RadSec how-to (3.2.9), NetworkRADIUS annotated `sites-available/tls`, `mods-available/rest`, `mods-available/sql`. Anything marked `[UNVERIFIED — …]` was not confirmed against a live box.*
