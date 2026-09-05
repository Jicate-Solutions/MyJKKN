# MikroTik CCR2116 hotspot handoff — `JKKN-RADIUS-Test` SSID only (campus Wi-Fi SSO, Part 5)

**Status:** DRAFT — Director ruling 2026-09-06 (00:05 / 00:20): answer-independent work only. Nothing in this document is to be run on the router until the Director says "go" and the VPS in the [FreeRADIUS playbook](freeradius-vps-playbook.md) is up.
**Router:** MikroTik CCR2116-12G-4S+ at `172.20.0.1`, identity "JKKN College", **RouterOS 7.20.6** (config pull `Purchases/IT-Hardware/MikroTik-Current-Config-2026-05-08.md`). Login user `JKKN`; WinBox at `172.20.0.1:7194`; SSH from `172.20.0.0/16` and the Director's home range.
**Decisions this follows:** Q1 (2026-09-06 00:20) — the learner signs in with Google inside MyJKKN; the router only ever sees a one-time username/password. Q2 — the CCR2116 hotspot hosts the captive page (RouterOS 7.20.x). Decisions 25, 27, 29, 30 (vault `Spec-Decisions-Locked-2026-05-08.md`).
**Every RouterOS command below was checked against `help.mikrotik.com` on 2026-09-06; the page is cited under each block.** Anything I could not confirm is marked `[UNVERIFIED — check on the router]`. RouterOS shows the valid values for any property if you type the command up to the property name and press `?`.

---

## 0. Read first — what changes and what does not

- **Live SSIDs are not touched.** Everything here lives on a new bridge `bridge-test` with its own subnet `192.168.99.0/24` and the SSID `JKKN-RADIUS-Test`. Live campus networks, queues, NAT and the PCC load-balancing keep running exactly as in the May pull.
- **The CCR2116 has no radio.** The May handoff's `/interface wireless add …` cannot run on this box (it is a wired router; the wireless menu has no interfaces). The SSID is created on an access point (the Omada/EAP610 controller once purchased, or any AP currently alive) and carried to the router on a VLAN — §2 covers the router half; the AP half is one screen in the AP controller ("new SSID, VLAN 99, open, no password").
- **The flow you are building (Q1, external-portal pattern):**
  1. Phone joins `JKKN-RADIUS-Test`, opens any site → the hotspot shows `login.html`.
  2. Our `login.html` immediately sends the browser to `https://wifi.jkkn.ai/api/network/sso?mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)&link-orig=$(link-orig)`.
  3. MyJKKN signs the learner in with Google, checks fees/attendance/devices, mints a one-time username + password, and sends the browser back to `$(link-login-only)` with those two values in a form POST (`username`, `password`, `dst`).
  4. The hotspot forwards them over RADIUS (RADSEC) to the VPS → MyJKKN answers Accept with a rate limit and session length, or Reject.
  5. Returning phones re-enter on **MAC-cookie** without a page for 3 days (default `mac-cookie-timeout`).
- **Back-out at any moment:** §11. Two commands, 10 seconds.

---

## 1. Backup before anything

1. In WinBox → New Terminal (or `ssh JKKN@172.20.0.1`):
   ```
   /system backup save name=pre-hotspot-sso-2026-09
   /export file=pre-hotspot-sso-2026-09
   ```
2. Download both files (WinBox → Files → drag to your PC) and put a copy in the vault folder `Purchases/IT-Hardware/`.

**You are done when:** `/file print` lists `pre-hotspot-sso-2026-09.backup` and `pre-hotspot-sso-2026-09.rsc`, and both are on your PC.

---

## 2. The isolated network the hotspot runs on (`bridge-test`, VLAN 99)

Ask the AP controller for the SSID `JKKN-RADIUS-Test` tagged **VLAN 99** on the trunk that reaches the router port the APs hang off (take the port from the May pull — e.g. `ether10` "campus"). Then on the router:

```
/interface vlan add name=vlan99-radius-test vlan-id=99 interface=ether10 comment="JKKN-RADIUS-Test SSID (SSO trial)"
/interface bridge add name=bridge-test comment="Hotspot SSO trial — isolated"
/interface bridge port add bridge=bridge-test interface=vlan99-radius-test
/ip address add interface=bridge-test address=192.168.99.1/24 comment="Hotspot SSO trial"
/ip pool add name=test-pool ranges=192.168.99.10-192.168.99.250
/ip dhcp-server add interface=bridge-test address-pool=test-pool name=dhcp-test lease-time=1h disabled=no
/ip dhcp-server network add address=192.168.99.0/24 gateway=192.168.99.1 dns-server=192.168.99.1 comment="Hotspot SSO trial"
/interface list member add list=LAN interface=bridge-test
```

Notes: `dns-server=192.168.99.1` on purpose — the hotspot intercepts DNS so the captive redirect works on every phone. `/interface list member … list=LAN` puts the bridge under the existing LAN → WAN forward/NAT rules from `MikroTik-Firewall-Rules.md`, so hotspot users get internet through the same masquerade as everyone else. If the parallel week needs more than ~240 devices, widen the pool to a /23. Replace `ether10` with the real trunk port after `/interface print`.

Sources: VLAN — `https://help.mikrotik.com/docs/spaces/ROS/pages/103841820/VLAN`; Bridge — `https://help.mikrotik.com/docs/spaces/ROS/pages/2555920/Bridging+and+Switching`; DHCP — `https://help.mikrotik.com/docs/spaces/ROS/pages/24805500/DHCP` `[UNVERIFIED — check on the router]` (these are the standard 7.x menus; I verified the hotspot/RADIUS pages below, not these three, from here).

**You are done when:** a phone on `JKKN-RADIUS-Test` gets a `192.168.99.x` address (`/ip dhcp-server lease print`) — it will NOT have internet yet, and that is correct.

---

## 3. Point the router at the RADIUS VPS — `/radius add` with RADSEC

```
/radius add address=<VPS_IP> protocol=radsec service=hotspot timeout=2s src-address=103.98.192.37 comment="JICATE RADIUS radius.jkkn.ai — RADSEC 2083"
```

- `protocol=radsec` — RADIUS over TLS on TCP 2083 (decision 27). Property values: "protocol (radsec | udp; Default: udp)".
- **The secret is forced.** "With RadSec RouterOS forces the shared secret to 'radsec' regardless of what has been set manually." So do not paste a long secret from the Director for a RADSEC entry; the VPS side is set to `radsec` too. What protects the link is TLS plus the VPS's per-router IP allow-list.
- `src-address=103.98.192.37` pins RADIUS to the Real Network WAN so the VPS sees one fixed source IP (the CCR2116 balances two WANs with PCC; without this the request can leave by Rainbow and be refused). Use whichever WAN the Director allow-listed on the VPS; if the pinned WAN is down, RADIUS is down — the failover script in §10 covers that.
- `service=hotspot` — only hotspot uses this server. Do **not** add `login`: that would make router logins depend on the VPS.
- `timeout=2s` — the doc default is 1100 ms; 2 s gives the VPS's 300 ms call to MyJKKN room across the internet.
- `certificate=` is left empty for the parallel week (the VPS has `require_client_cert = no`). Mutual TLS is a later hardening step.
- `require-message-auth` — 7.20 defaults to `yes-for-request-resp`; leave it.
- **Server certificate check:** RouterOS needs to trust the Let's Encrypt chain to verify `radius.jkkn.ai`. RouterOS 7 has a built-in trust store; if the handshake fails with a certificate error in `/log`, import ISRG Root X1: `/tool fetch url=https://letsencrypt.org/certs/isrgrootx1.pem` then `/certificate import file-name=isrgrootx1.pem passphrase=""` `[UNVERIFIED — check on the router]` whether `/radius` verifies the server certificate at all in 7.20 — the RADIUS page does not say; if it does not, pinning happens on the MyJKKN side (playbook §3) and nothing more is needed here.

Then:
```
/radius monitor 0
```
shows `pending / accepts / rejects / timeouts / bad-replies / rtt` — the numbers you will read all week.

Source: `https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS` (property table, RadSec example `/radius add service=hotspot,ppp address=10.0.0.3 secret=radsec protocol=radsec certificate=client.crt`, and `/radius monitor 0`).

**You are done when:** `/radius print` shows the entry with `protocol=radsec`, and after §6 the first login attempt makes `accepts` or `rejects` in `/radius monitor 0` go from 0 to 1 (either is fine — `timeouts` climbing is the bad sign).

---

## 4. Let the VPS end or re-shape a session — CoA on UDP 3799 (decision 30)

```
/radius incoming set accept=yes port=3799
/ip firewall filter add chain=input action=accept protocol=udp dst-port=3799 src-address=<VPS_IP> comment="RADIUS CoA/Disconnect from radius.jkkn.ai only" place-before=[find where chain=input and action=drop and in-interface-list=WAN]
```

- `/radius incoming` properties: `accept` ("Enable unsolicited RADIUS messages") and `port` (default **1700**). We set 3799 to match the RFC 5176 port seeded in MyJKKN (`network_radius_servers.coa_port = 3799`).
- The firewall rule must sit ABOVE the "drop all other WAN input" rule from `MikroTik-Firewall-Rules.md`; the `place-before=[find …]` does that if that rule exists — if `find` returns nothing, add the rule and drag it up in WinBox. `[UNVERIFIED — check on the router]` the exact `find` expression against your rule set; `/ip firewall filter print` first.
- What a CoA can change live: `Mikrotik-Rate-Limit`, `Mikrotik-Group`, `Session-Timeout`, `Idle-Timeout`, `Filter-Id`, … "it is not possible to change IP address, pool or routes that way — for such changes a user must be disconnected first."

Source: `https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS` (`/radius incoming` table; Change of Authorization section).

**You are done when:** `/radius incoming print` shows `accept: yes  port: 3799`, and a `radclient … disconnect` from the VPS (playbook §7) drops a logged-in phone within 5 s.

---

## 5. Identify this router to the VPS — NAS-Identifier

FreeRADIUS on the VPS keys each tenant by source IP **and** the `NAS-Identifier` attribute the router sends; MyJKKN maps that string to `network_routers.radius_nas_identifier`. RouterOS sends the **system identity** as NAS-Identifier `[UNVERIFIED — check on the router]` (confirm in the VPS debug log: `freeradius -X` shows `NAS-Identifier = "…"` on the first request).

The identity is "JKKN College" today. Two ways, pick with the Director:
- **Change the identity** to the slug the VPS expects: `/system identity set name=jkkn-main` — cosmetic elsewhere (WinBox title, logs, LLDP), zero functional impact; or
- **Keep the identity** and register the string `JKKN College` verbatim as `shortname` on the VPS and as `radius_nas_identifier` in MyJKKN. Spaces are fine in RADIUS strings.

Per-college tagging on the same router (the CCR2116 fronts all 14 institutions): the hotspot profile can send `radius-location-id` / `radius-location-name` — set them in §6 to the college the SSID belongs to during the trial; MyJKKN receives them as `WISPr-Location-ID/Name` `[UNVERIFIED — check on the router]`.

Source: `/system identity` — `https://help.mikrotik.com/docs/spaces/ROS/pages/8978441/Identity` `[UNVERIFIED — check on the router]` (standard 7.x command).

**You are done when:** the VPS debug log shows the NAS-Identifier you expect on the first Access-Request.

---

## 6. The hotspot profile — RADIUS on, external-portal + MAC-cookie login

```
/ip hotspot profile add name=hs-radius-sso hotspot-address=192.168.99.1 dns-name=login.wifi.jkkn.ai \
    use-radius=yes radius-accounting=yes radius-interim-update=5m radius-mac-format=XX:XX:XX:XX:XX:XX \
    login-by=mac-cookie,http-pap http-cookie-lifetime=3d \
    radius-location-id=jkkn-main-trial radius-location-name="JKKN-RADIUS-Test" \
    html-directory-override=hotspot-jkkn
```

Why each property (all quoted from the HotSpot page):
- `use-radius=yes` — "Use RADIUS to authenticate HotSpot users."
- `login-by=mac-cookie,http-pap` — `http-pap`: "login/password is required for user to authenticate in HotSpot. Username and password are sent over network in plain text" — required because MyJKKN's page POSTs the one-time credential to the router's `/login` from outside (the customisation page: "When login submits to external servers, HTTP-PAP must be enabled"). Plain text on the campus LAN is acceptable because the credential is one-time and dead after use. `mac-cookie`: "first successful login. Mac cookie keeps record of username and password for the MAC address if there is only one host with such MAC" / "new host appears. Hotspot checks if there is a mac cookie record for the MAC address and logs in host using recorded username and password." That is decision 15's one-tap return. **Do not add `http-chap`** (it would force an MD5 challenge the external page cannot compute) and **do not add `mac`** (MAC-only login would let any device in without MyJKKN).
- `radius-accounting=yes` + `radius-interim-update=5m` — Start/Interim/Stop every 5 min feed `network_sessions` (playbook §8, Q3).
- `radius-mac-format=XX:XX:XX:XX:XX:XX` — the format MyJKKN stores in `client_mac`.
- `dns-name=login.wifi.jkkn.ai` — the hostname of the router's login page; the hotspot answers it itself, no public DNS needed. `[UNVERIFIED — check on the router]` that a sub-domain of a real zone is accepted without a certificate warning — if phones show a warning, use a plain name like `wifi-login.local`.
- `html-directory-override=hotspot-jkkn` — our `login.html` lives in a separate folder so a RouterOS upgrade never overwrites it (§8). The property was listed as `html-directory-override` on the HotSpot page; the customisation page calls it "html-override-directory" — type `/ip hotspot profile set hs-radius-sso html-` and press Tab to see the exact name on 7.20.6.
- `radius-location-id/name` — sent to RADIUS; MyJKKN uses them to tag the college during the trial (§5).

**MAC-cookie and the one-time password:** a MAC-cookie re-login replays the stored username/password to RADIUS. Because MyJKKN's password is one-time, MyJKKN's `radius-auth` (Part 2) must treat "same MAC + same one-time username within the cookie window" as a valid re-entry — this is a Part 2 requirement, written here so the router setting and the code agree. Until Part 2 handles it, a returning phone will be rejected and fall back to the login page (annoying, not unsafe). `[UNVERIFIED — check on the router]` — the doc does not say what is transmitted on a MAC-cookie re-login; confirm in the VPS debug log during the trial.

Also set a user profile so RADIUS replies are the only rate limit (the default profile carries none):
```
/ip hotspot user profile set default mac-cookie-timeout=3d shared-users=1 keepalive-timeout=2m
```
`shared-users=1` — one login per one-time username; the device cap (decision 10) is MyJKKN's job, not the router's.

Source: `https://help.mikrotik.com/docs/spaces/ROS/pages/56459266/HotSpot+-+Captive+portal` (profile property table; `login-by` values `cookie|http-chap|http-pap|https|mac|trial|mac-cookie`; `mac-cookie-timeout` default 3d) and `https://help.mikrotik.com/docs/spaces/ROS/pages/87162881/Hotspot+customisation` (external login needs HTTP-PAP).

**You are done when:** `/ip hotspot profile print detail where name=hs-radius-sso` shows `use-radius=yes login-by=mac-cookie,http-pap radius-accounting=yes`.

---

## 7. The hotspot server on the trial bridge only

```
/ip hotspot add name=hs-test interface=bridge-test address-pool=test-pool profile=hs-radius-sso addresses-per-mac=2 idle-timeout=10m keepalive-timeout=2m login-timeout=5m disabled=no
```

- `interface=bridge-test` — the ONLY interface with a hotspot. Never `bridge` / a live LAN interface during the trial.
- `addresses-per-mac=2` (doc default 2). `idle-timeout` — "period of inactivity for unauthorized clients"; `login-timeout` — time allowed to finish the Google sign-in before the host entry is dropped (5 min is generous for a first-time consent screen).
- Do not run `/ip hotspot setup` — the wizard creates a local user, a profile and DNS settings we do not want; the explicit commands above replace it.

Source: `https://help.mikrotik.com/docs/spaces/ROS/pages/56459266/HotSpot+-+Captive+portal` (`/ip hotspot` server properties).

**You are done when:** a phone on `JKKN-RADIUS-Test` opening `http://neverssl.com` is redirected to the router's login page (the stock one for now), and `/ip hotspot host print` lists the phone.

---

## 8. `login.html` — hand the browser to MyJKKN, receive it back

Create a folder `hotspot-jkkn` on the router (WinBox → Files → drag a folder, or upload one file into `hotspot-jkkn/` and the folder appears) containing ONE file, `login.html`:

```html
<html>
<head>
<meta charset="utf-8">
<title>JKKN Wi-Fi</title>
$(if error)
<!-- RADIUS said no (or the one-time credential was already used): show the reason, offer to try again -->
<meta http-equiv="refresh" content="4; url=https://wifi.jkkn.ai/blocked?reason=$(error-orig)&mac=$(mac-esc)">
$(else)
<!-- First visit or MAC-cookie expired: hand the browser to MyJKKN -->
<meta http-equiv="refresh" content="0; url=https://wifi.jkkn.ai/api/network/sso?mac=$(mac-esc)&ip=$(ip)&link-login-only=$(link-login-only)&link-orig=$(link-orig-esc)">
$(endif)
</head>
<body style="font-family:sans-serif;text-align:center;padding:2em">
$(if error)
<p>Wi-Fi login did not go through: <b>$(error)</b></p>
<p><a href="$(link-login-only)?dst=$(link-orig-esc)">Try again</a></p>
$(else)
<p>Taking you to JKKN sign-in…</p>
<p><a href="https://wifi.jkkn.ai/api/network/sso?mac=$(mac-esc)&ip=$(ip)&link-login-only=$(link-login-only)&link-orig=$(link-orig-esc)">Continue</a></p>
$(endif)
</body>
</html>
```

Variables (customisation page): `link-login-only` — "link to login page, not including original URL requested"; `link-orig` — "original URL requested"; `mac` — "MAC address of the user"; `ip` — "IP address of the client"; `-esc` forms (`mac-esc`, `link-orig-esc`) are URL-safe. There is no `link-login-only-esc`; the value is a plain `http://login.wifi.jkkn.ai/login` so it is safe unescaped. `error`/`error-orig` are login-page-only. The `$(if …) $(else) $(endif)` construct is the one the stock `login.html` uses for its error row `[UNVERIFIED — check on the router]` — if the page renders the literal `$(if error)` text, drop the conditional and keep only the redirect line.

**The way back (what MyJKKN's `/api/network/sso` does — Part 3, written here so both sides agree):** after Google sign-in and the checks, MyJKKN returns a page that auto-submits
```html
<form method="post" action="$(link-login-only)">          <!-- the value the router gave us, e.g. http://login.wifi.jkkn.ai/login -->
  <input type="hidden" name="username" value="<one-time username>">
  <input type="hidden" name="password" value="<one-time password>">
  <input type="hidden" name="dst"      value="<link-orig>">
</form>
```
That is the documented external-authentication pattern: the external server logs the client in "by redirecting it back to the original HotSpot servlet login page, specifying the correct username and password" — with `http-pap` on (§6). Form fields are `username`, `password`, `dst`, `popup`. On Accept the router shows its `alogin.html` (stock is fine) and sends the phone to `dst`; on Reject the router re-renders our `login.html` with `$(error)` set, which sends the learner to `https://wifi.jkkn.ai/blocked?reason=…` (Part 3's Tamil/English page).

Upload: WinBox → Files → drag `login.html` into `hotspot-jkkn/`, or `scp login.html JKKN@172.20.0.1:hotspot-jkkn/login.html`. Then confirm `/file print where name~"hotspot-jkkn"` lists it. The stock pages (`alogin.html`, `status.html`, `logout.html`, `error.html`, …) stay in the built-in `hotspot` folder; an override folder only needs the files you replace.

Source: `https://help.mikrotik.com/docs/spaces/ROS/pages/87162881/Hotspot+customisation` (variables, external authentication, upload methods, "it is suggested to edit the files manually").

**You are done when:** a phone on the trial SSID opening any http site lands on `https://wifi.jkkn.ai/api/network/sso?mac=…` (until Part 3 ships, that URL 404s — the redirect itself, with the four parameters filled, is what you are proving).

---

## 9. Walled garden — what a phone may reach BEFORE login

The phone must reach MyJKKN, Supabase (MyJKKN's Google sign-in goes through `kvizhngldtiuufknvehv.supabase.co/auth/v1/authorize`), and Google's sign-in hosts, and nothing else, before it is logged in.

```
/ip hotspot walled-garden add dst-host=wifi.jkkn.ai action=allow comment="SSO portal"
/ip hotspot walled-garden add dst-host=www.jkkn.ai action=allow comment="MyJKKN (Google callback lands here)"
/ip hotspot walled-garden add dst-host=jkkn.ai action=allow comment="apex redirect"
/ip hotspot walled-garden add dst-host=kvizhngldtiuufknvehv.supabase.co action=allow comment="Supabase Auth — /auth/v1/authorize + callback"
/ip hotspot walled-garden add dst-host=accounts.google.com action=allow comment="Google sign-in"
/ip hotspot walled-garden add dst-host=*.googleapis.com action=allow comment="oauth2.googleapis.com token + userinfo"
/ip hotspot walled-garden add dst-host=*.gstatic.com action=allow comment="Google sign-in page assets"
/ip hotspot walled-garden add dst-host=*.googleusercontent.com action=allow comment="Google profile pictures on the consent screen"
/ip hotspot walled-garden add dst-host=apis.google.com action=allow comment="Google One Tap script"
/ip hotspot walled-garden add dst-host=accounts.youtube.com action=allow comment="Google sign-in sometimes bounces via YouTube accounts"
```

- `dst-host` — "Domain name of the destination web-server"; wildcards `*` and `?` are allowed; `action=allow` — "allow access to the web-page without authorization".
- HTTPS to these hosts works through the walled garden because the hotspot matches the TLS SNI / destination by DNS resolution `[UNVERIFIED — check on the router]` — if the Google page loads blank, add the IP-level rule `/ip hotspot walled-garden ip add dst-host=accounts.google.com action=accept` for the same names (the `walled-garden ip` menu has `action=accept|drop|reject`, `dst-host`, `dst-port`, `protocol`).
- **Do NOT allow** `connectivitycheck.gstatic.com`, `captive.apple.com`, `www.msftconnecttest.com` — those are how phones detect a captive portal; allowing them makes phones think they are online and never show the login. `*.gstatic.com` above is a wildcard — if Android stops popping the login, replace it with the specific hosts the sign-in page loads (`ssl.gstatic.com`, `fonts.gstatic.com`) `[UNVERIFIED — check on the router]`.
- MyJKKN fonts are self-hosted (Next.js `next/font/google` builds them in), so `fonts.googleapis.com` is not needed at runtime.

Source: `https://help.mikrotik.com/docs/spaces/ROS/pages/56459266/HotSpot+-+Captive+portal` (Walled Garden — `/ip hotspot walled-garden` and `/ip hotspot walled-garden ip` property lists).

**You are done when:** a phone that has NOT logged in can complete the Google sign-in screens inside MyJKKN (once Part 3 exists), and `http://neverssl.com` is still blocked until it does.

---

## 10. Decision-17 failover switch on the router (auto-open, auto-close)

The playbook's §12 is the 6 am runbook; this is the script it relies on. It disables the trial hotspot after 3 unsuccessful health checks in a row and re-enables it after 5 good ones. Two variants — use **A** once Part 2's health route exists, **B** until then.

```
/system script add name=wifi-failover policy=read,write,test dont-require-permissions=yes source={
  :global wfFail;  :global wfOk
  :if ([:typeof $wfFail] = "nothing") do={ :set wfFail 0 }
  :if ([:typeof $wfOk]   = "nothing") do={ :set wfOk 0 }
  :local healthy false
  # --- Variant A: ask MyJKKN (Part 2 route). Expect the body "ok" ---
  :do {
    :local r [/tool fetch url="https://www.jkkn.ai/api/network/health?nas=jkkn-main" http-method=get output=user as-value duration=5s]
    :if (($r->"status") = "finished" && ($r->"data") = "ok") do={ :set healthy true }
  } on-error={ :set healthy false }
  # --- Variant B (until Part 2 exists): judge by RADIUS timeouts instead. Uncomment, comment A out. ---
  # :local m [/radius monitor 0 once as-value]
  # :set healthy ((($m->"timeouts") = 0) || (($m->"accepts") + ($m->"rejects")) > 0)
  :if ($healthy) do={ :set wfOk ($wfOk + 1); :set wfFail 0 } else={ :set wfFail ($wfFail + 1); :set wfOk 0 }
  :local hsDisabled [/ip hotspot get [find name=hs-test] disabled]
  :if ($wfFail >= 3 && !$hsDisabled) do={
    /ip hotspot disable [find name=hs-test]
    /log warning "WIFI-FAILOVER OPEN (auto): MyJKKN/RADIUS unreachable 3x"
  }
  :if ($wfOk >= 5 && $hsDisabled) do={
    /ip hotspot enable [find name=hs-test]
    /log warning "WIFI-FAILOVER CLOSED (auto): healthy 5x"
  }
}
/system scheduler add name=wifi-failover interval=1m on-event=wifi-failover start-time=startup comment="Decision 17 — open Wi-Fi when MyJKKN/RADIUS is down"
```

- `/tool fetch … output=user as-value` returns `status` (`finished` on success) and `data`; `http-method=get` and `duration` are documented properties. Variant B uses `/radius monitor 0 once as-value` `[UNVERIFIED — check on the router]` — `monitor` supports `once`, and `as-value` on monitor commands works on most 7.x menus but I could not confirm it for `/radius`; if it errors, use Variant A only or replace B with a `/ping <VPS_IP> count=3` reachability check.
- The whole script is `[UNVERIFIED — check on the router]` as a unit: paste it, then run `/system script run wifi-failover` by hand and read `/log print`. A syntax error shows up immediately; a logic error shows up as the hotspot flapping — watch `/log print where message~"WIFI-FAILOVER"` for the first hour.
- **What "open" means:** `/ip hotspot disable` removes the captive portal from `bridge-test`; every phone on the SSID has plain internet with no login, no rate tier, no accounting. **What "closed" means:** the hotspot is back; phones with a live MAC-cookie re-enter silently, new phones see the login page.
- Scheduler: `/system scheduler add` properties `name`, `interval`, `on-event`, `start-time`, `start-date` — doc example `/system scheduler add interval=1h name=run-1h on-event=log-test`.
- Manual panic (until Part 4's button exists): `/ip hotspot disable [find name=hs-test]` to open, `/ip hotspot enable [find name=hs-test]` to close — the script will not fight you as long as its counters agree with reality (it only acts on the transition).

Sources: Fetch — `https://help.mikrotik.com/docs/spaces/ROS/pages/8978514/Fetch`; Scheduler — `https://help.mikrotik.com/docs/spaces/ROS/pages/40992881/Scheduler`; Scripting — `https://help.mikrotik.com/docs/spaces/ROS/pages/47579229/Scripting` `[UNVERIFIED — check on the router]`.

**You are done when:** stopping FreeRADIUS on the VPS (or blocking 2083 for a minute) produces `WIFI-FAILOVER OPEN` in `/log` within 4 minutes and a phone on the SSID gets internet without a page; starting it again produces `WIFI-FAILOVER CLOSED` within 6 minutes.

---

## 11. Back-out (10 seconds) and full removal

Stop the trial without removing anything:
```
/ip hotspot disable [find name=hs-test]
/system scheduler disable [find name=wifi-failover]
```
Phones on `JKKN-RADIUS-Test` now have open internet; live SSIDs were never involved.

Remove everything (after the Director says the trial is over):
```
/system scheduler remove [find name=wifi-failover]
/system script remove [find name=wifi-failover]
/ip hotspot remove [find name=hs-test]
/ip hotspot profile remove [find name=hs-radius-sso]
/ip hotspot walled-garden remove [find comment~"SSO|MyJKKN|Supabase|Google|apex"]
/radius incoming set accept=no port=1700
/ip firewall filter remove [find comment~"RADIUS CoA"]
/radius remove [find comment~"JICATE RADIUS"]
/ip dhcp-server remove [find name=dhcp-test]
/ip dhcp-server network remove [find comment~"Hotspot SSO trial"]
/ip pool remove [find name=test-pool]
/ip address remove [find comment~"Hotspot SSO trial"]
/interface list member remove [find interface=bridge-test]
/interface bridge port remove [find bridge=bridge-test]
/interface bridge remove [find name=bridge-test]
/interface vlan remove [find name=vlan99-radius-test]
/file remove [find name~"hotspot-jkkn"]
```
Or simply `/system backup load name=pre-hotspot-sso-2026-09` (reboots the router — only outside working hours).

**You are done when:** `/ip hotspot print` is empty and `/radius print` has no JICATE entry.

---

## 12. Reading the router during the trial — the four commands

```
/radius monitor 0                                  ; accepts / rejects / timeouts / rtt — the VPS heartbeat
/ip hotspot active print                           ; who is logged in, by user, IP, MAC, uptime, login-by (mac-cookie vs http-pap)
/ip hotspot host print                             ; every device on the SSID incl. not-yet-logged-in
/log print where topics~"hotspot|radius" or message~"WIFI-FAILOVER"
```
To end one session by hand: `/ip hotspot active remove [find user="<one-time username>"]`. To let a specific device (a printer, an IoT box) bypass login during the trial: `/ip hotspot ip-binding add mac-address=AA:BB:CC:DD:EE:FF type=bypassed server=hs-test comment="…"` — `type=bypassed` "excludes login requirement" (decision 22's whitelist, router side).

Source: `https://help.mikrotik.com/docs/spaces/ROS/pages/56459266/HotSpot+-+Captive+portal` (active/host monitoring, ip-binding `type=regular|bypassed|blocked`); `https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS` (`/radius monitor 0`).

---

## 13. The 50-user parallel week before any cutover (decision 20)

**Preconditions (all four, or do not start):** VPS up and `/radius monitor 0` accepting; MyJKKN Parts 2 + 3 deployed (`/api/network/radius-auth`, `/api/network/sso`, `/wifi/blocked`); the failover script proven once (§10 "done when"); Q3 decided so accounting lands somewhere (playbook §8) — or at least the `detail` spool is on.

| Day | Who | What | Pass line |
|---|---|---|---|
| **0 (Sat)** | sysadmin + Director | §1–§10 on the router; one phone, one learner account. Accept AND Reject both seen in `/log`, in `/radius monitor 0`, and in `network_sessions` (the spec's Part-5 acceptance line). Kick via CoA once. Failover open/close once. | 2 log lines each, screenshots in the vault |
| **1 (Mon)** | 10 volunteers — 5 learners, 3 Senior Learners, 2 team members, from ONE college, on their own phones | Join `JKKN-RADIUS-Test`, sign in with Google, use it for the day. Evening: forget and re-join — expect MAC-cookie silent re-entry. | 10/10 signed in; ≥8/10 re-entered without a page; 0 timeouts in `/radius monitor 0` |
| **2 (Tue)** | same 10 + 15 more (25) | Add one learner with an overdue fee and one locked account (arranged with the accounts office) — both must land on `/wifi/blocked` with the right reason. Pay the fee → CoA re-authorises within 2 min. | Reject reasons correct; CoA observed; rtt in `/radius monitor 0` under 500 ms |
| **3 (Wed)** | 50 (add a second college's volunteers) | Peak-hour check 09:00–10:00: all 50 sign in within the same 30 minutes. Read `/radius monitor 0` `pending` — should never sit above 5. | 50/50 in; no `timeouts`; `network_sessions` shows 50 rows with 5-min `last_seen_at` ticks |
| **4 (Thu)** | 50 | **Planned outage:** stop FreeRADIUS on the VPS at 11:00 for 10 minutes. Expect `WIFI-FAILOVER OPEN` by 11:04, everyone online, `CLOSED` by ~11:16, MAC-cookie users back without a page. Then the same with MyJKKN's health route returning an error (Variant A). | Both transitions logged; no volunteer lost internet for more than 4 min; incident note written (playbook §12 step 8) |
| **5 (Fri)** | 50 | Device-cap and multi-device day: each volunteer adds a laptop; learners on a 3-device cap get the 4th refused with the reason. Run through `wifi.jkkn.ai/devices` (Part 3) to remove one and re-add. | Cap enforced; removal works; no orphaned `network_sessions` rows |
| **6–7 (Sat–Sun)** | sysadmin | Leave it running unattended. Monday morning read: `/log`, `/radius monitor 0`, the VPS health alerts, `network_sessions` count vs `/ip hotspot active`. | Zero unexplained `WIFI-FAILOVER` lines; certificate days-left > 30; backups present (playbook §11) |

**Go / no-go for cutover (Director):** every Pass line green, fewer than 3 volunteer complaints not explained by a bug that is already fixed, and the failover exercised on a real (not simulated) blip if one happened. Only then does the hotspot profile move from `bridge-test` to a live bridge — one college at a time (spec Q5 leans pilot-first; 14 institutions are live, not 7), never all at once on a Monday.

**You are done when:** the week's table is filled in with dates and numbers in the vault (`Initiatives/Network-Infrastructure/Parallel-Week-<date>.md`) and the Director has written go or no-go under it.

---

*Verified 2026-09-06 against: `https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS`, `https://help.mikrotik.com/docs/spaces/ROS/pages/56459266/HotSpot+-+Captive+portal`, `https://help.mikrotik.com/docs/spaces/ROS/pages/87162881/Hotspot+customisation`, `https://help.mikrotik.com/docs/spaces/ROS/pages/8978514/Fetch`, `https://help.mikrotik.com/docs/spaces/ROS/pages/40992881/Scheduler`. Router facts from the 2026-05-08 config pull (RouterOS 7.20.6). `[UNVERIFIED — check on the router]` flags every line I could not confirm from those pages.*
