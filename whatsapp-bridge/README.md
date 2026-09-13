# JKKN WhatsApp Bridge — Windows Operator Runbook

This is the small program that connects **one shared JKKN WhatsApp number** to
MyJKKN (www.jkkn.ai). It runs on the always-on Windows box on campus.

You do **not** need to be a developer to run it. This page is the whole job.

---

## What it actually does

MyJKKN lives on the internet (Vercel). This Windows box sits inside the campus
network, behind the college firewall. The internet **cannot** reach in here —
and it does not need to.

Instead, the bridge works like someone checking a pigeonhole:

1. Every 5 seconds it asks MyJKKN: *"anything to send?"*
2. If there is, it sends those WhatsApp messages, one at a time, with a short
   pause between each.
3. It tells MyJKKN what happened to each one.
4. When somebody replies on WhatsApp, it pushes that reply up to MyJKKN.
5. Every minute it tells MyJKKN "I'm still alive".

All of that is **outgoing** traffic, like a browser. So:

- No firewall changes.
- No port forwarding.
- No fixed IP address.
- No VPN or tunnel.

> **Why we rebuilt this.** The old version ran on Railway and opened a separate
> hidden Chrome browser for *every department*. The machine ran out of room to
> start them and died with `spawn chromium EAGAIN`. This one opens **no browser
> at all** and uses **one** WhatsApp account for everybody.

---

## What you need before you start

| You need | Notes |
|---|---|
| The file `jkkn-whatsapp-bridge.exe` | Given to you by the MyJKKN team |
| A phone with the bridge's SIM in it | A dedicated JKKN number, not anyone's personal number |
| WhatsApp installed on that phone, signed in on that number | |
| The `BRIDGE_SECRET` password | From the MyJKKN team. Treat it like a password. |

---

## Step 1 — Put the files in place

Make a folder. This exact path is used everywhere below:

```
C:\JKKN\whatsapp-bridge\
```

Copy `jkkn-whatsapp-bridge.exe` into it.

## Step 2 — Write the settings file

In that same folder, create a file called **`start-bridge.bat`** with Notepad
and paste this in. Replace `PUT_THE_SECRET_HERE` with the real secret.

```bat
@echo off
cd /d C:\JKKN\whatsapp-bridge

set MYJKKN_URL=https://www.jkkn.ai
set BRIDGE_SECRET=PUT_THE_SECRET_HERE
set POLL_INTERVAL_SECONDS=5
set SEND_DELAY_MS=1500
set DB_PATH=C:\JKKN\whatsapp-bridge\session.db
set LOG_PATH=C:\JKKN\whatsapp-bridge\logs\bridge.log
set LISTEN_ADDR=127.0.0.1:8080

jkkn-whatsapp-bridge.exe
```

Save it. **Do not email this file to anyone** — it contains the secret.

## Step 3 — Run it once and scan the QR

Double-click `start-bridge.bat`. A black window opens and prints a big square
QR code.

On the phone with the bridge's SIM:

1. Open WhatsApp
2. **Settings → Linked devices → Link a device**
3. Point the camera at the QR square in the black window

If the QR is hard to scan in the black window (common over Remote Desktop),
open a browser on the Windows box and go to **http://127.0.0.1:8080/qr** —
the same code appears there as a clean picture.

When it works the window prints:

```
PAIRING: success — the session is now saved to ...
```

**You only ever do this once.** The login is saved in `session.db`. Restarts,
reboots and Windows updates do not need a new scan.

> The QR expires after about a minute. If nobody scanned it in time, close the
> window and double-click `start-bridge.bat` again for a fresh one.

## Step 4 — Make it start by itself

The box must run the bridge even when nobody is logged in. Pick **one** of these.

### Option A — Task Scheduler (built into Windows, nothing to install)

1. Press Start, type **Task Scheduler**, open it
2. Right-hand side → **Create Task…** (not "Create Basic Task")
3. **General** tab:
   - Name: `JKKN WhatsApp Bridge`
   - Select **Run whether user is logged on or not**  ← this is the important one
   - Tick **Run with highest privileges**
   - Configure for: your Windows version
4. **Triggers** tab → **New…** → Begin the task: **At startup** → OK
5. **Actions** tab → **New…**
   - Action: Start a program
   - Program/script: `C:\JKKN\whatsapp-bridge\start-bridge.bat`
   - Start in: `C:\JKKN\whatsapp-bridge`
6. **Settings** tab:
   - Tick **If the task fails, restart every:** `1 minute`, **Attempt to restart up to:** `999` times
   - **Untick** "Stop the task if it runs longer than" — this task is meant to run forever
7. OK. Windows asks for the machine's password — that is normal, it needs it to
   run the task while logged out.

Reboot the box once and check Step 5 to confirm it came back by itself.

### Option B — NSSM (nicer; makes it a real Windows Service)

Download NSSM from https://nssm.cc, unzip, then in an **Administrator**
Command Prompt:

```
nssm install JKKNWhatsAppBridge
```

In the window that opens:

- **Application** tab
  - Path: `C:\JKKN\whatsapp-bridge\jkkn-whatsapp-bridge.exe`
  - Startup directory: `C:\JKKN\whatsapp-bridge`
- **Environment** tab — paste (one per line, no `set`, no quotes):
  ```
  MYJKKN_URL=https://www.jkkn.ai
  BRIDGE_SECRET=PUT_THE_SECRET_HERE
  POLL_INTERVAL_SECONDS=5
  SEND_DELAY_MS=1500
  DB_PATH=C:\JKKN\whatsapp-bridge\session.db
  LOG_PATH=C:\JKKN\whatsapp-bridge\logs\bridge.log
  LISTEN_ADDR=127.0.0.1:8080
  ```
- **Exit actions** tab — Restart action: **Restart application**

Click **Install service**, then:

```
nssm start JKKNWhatsAppBridge
```

---

## Step 5 — How to tell if it is healthy

Open a browser **on the Windows box** and go to:

**http://127.0.0.1:8080/health**

You will see one line like this:

```json
{"status":"ok","connected":true,"logged_in":true,"phone_number":"919xxxxxxxxx","version":"1.0.0","spool_depth":0}
```

Read it like this:

| What you see | What it means | What to do |
|---|---|---|
| `"status":"ok"` | Everything is working | Nothing |
| `"status":"unpaired"` | Nobody has scanned the QR yet | Do Step 3 |
| `"status":"disconnected"` | Lost the WhatsApp connection | Wait 2 minutes — it reconnects itself. Still stuck? See below. |
| `"spool_depth":0` | No incoming messages are stuck | Nothing |
| `"spool_depth":47` and rising | MyJKKN is unreachable; replies are safely queued on disk | Check campus internet. Nothing is lost. |

This page only works **on the box itself**. That is deliberate: nobody else on
campus can reach it, and neither can the internet.

---

## Where the logs are

```
C:\JKKN\whatsapp-bridge\logs\bridge.log
```

Older logs are kept next to it, zipped, for 30 days. Open the file with Notepad.
Lines starting `INFO` are normal. `WARN` is usually temporary. `ERROR` is worth
reading.

Some problems print a **loud banner** surrounded by `!!!!!!!!` lines. Those need
a person. See the next section.

---

## When something goes wrong

### "It stopped sending"

1. Open http://127.0.0.1:8080/health
2. `"connected":false` → it lost the connection. It retries by itself, waiting a
   little longer each time, up to 5 minutes. Give it 10 minutes.
3. Still false after 10 minutes → restart it (Task Scheduler: right-click the
   task → End, then Run. NSSM: `nssm restart JKKNWhatsAppBridge`).
4. Still false → open the log and look for a loud banner.

### Loud banner: "WHATSAPP REJECTED THIS BRIDGE AS OUTDATED"

**Restarting will not fix this, and neither will re-scanning the QR.**

WhatsApp periodically stops accepting older bridge software. The `.exe` itself
has to be rebuilt by the MyJKKN team with a newer library and copied over.
**Message the MyJKKN team, quote this banner, and say the bridge needs a new
build.** This is the failure that has cost other projects several days — telling
someone early is the whole fix.

### Loud banner: "THIS WHATSAPP ACCOUNT WAS LOGGED OUT"

Someone unlinked the device from the phone (WhatsApp → Linked devices), or
WhatsApp logged it out. Do **Step 3** again — scan a new QR.

### Loud banner: "ANOTHER DEVICE TOOK OVER THIS WHATSAPP SESSION"

Somebody linked the bridge's number on another computer. Only one machine can
hold this session. Decide which one keeps it, then re-pair here with Step 3.

### Loud banner: "WHATSAPP HAS TEMPORARILY BANNED THIS NUMBER"

Too many messages went out too fast. The ban lifts by itself — the banner says
when. Before starting again, raise `SEND_DELAY_MS` (e.g. from `1500` to `4000`)
in `start-bridge.bat` and tell the MyJKKN team.

### Loud banner: "MYJKKN REJECTED THE BRIDGE SECRET"

The `BRIDGE_SECRET` in `start-bridge.bat` no longer matches the one in MyJKKN.
Get the current one from the MyJKKN team, edit the file, restart.

### The box was rebooted

Nothing to do — if you did Step 4 it comes back on its own. Check Step 5 to be
sure. No QR is needed.

### You need to move to a different WhatsApp number

1. Stop the bridge
2. Delete `session.db` (and `session.db-shm` / `session.db-wal` if present)
3. Start it and scan the QR with the new phone

---

## Every setting, in one table

| Setting | Default | What it does |
|---|---|---|
| `MYJKKN_URL` | *(required)* | Where MyJKKN lives, e.g. `https://www.jkkn.ai`. Must be `https://`. |
| `BRIDGE_SECRET` | *(required)* | Shared password proving this box is ours. |
| `POLL_INTERVAL_SECONDS` | `5` | How often to ask MyJKKN for messages to send. |
| `SEND_DELAY_MS` | `1500` | Pause between two sends. Raise it if WhatsApp complains. |
| `DB_PATH` | `jkkn-whatsapp-bridge.db` | The file holding the WhatsApp login and any queued replies. **Back this up.** |
| `LISTEN_ADDR` | `127.0.0.1:8080` | Where the health page lives. Must stay on `127.0.0.1`. |
| `LOG_PATH` | `logs/bridge.log` | Log file. Rotates at 10 MB, keeps 10 files for 30 days. |
| `PENDING_LIMIT` | `20` | How many messages to fetch per check. |
| `HEARTBEAT_SECONDS` | `60` | How often to tell MyJKKN we are alive. |
| `FORWARD_GROUP_MESSAGES` | `false` | Whether messages from WhatsApp **groups** are sent up to MyJKKN. Off by default. |
| `MAX_MEDIA_MB` | `16` | Largest attachment the bridge will send. |
| `ALLOW_INSECURE_URL` | `false` | Allows a plain `http://` MyJKKN URL. **Testing only** — it would put the secret on the wire in clear text. |
| `HTTP_TIMEOUT_SECONDS` | `30` | How long to wait for MyJKKN before giving up on one call. |

---

## For developers

### Build

```bash
./build.sh          # Windows .exe into dist/
./build.sh all      # plus a binary for this machine
```

`CGO_ENABLED=0` is a hard requirement, not an optimisation. The SQLite driver is
`modernc.org/sqlite`, which is pure Go — that is what lets a single `.exe` run on
Windows with no C toolchain and no DLLs. If a change ever makes the build need
CGO, the wrong SQLite driver has been introduced.

### Versions

`go.mau.fi/whatsmeow` is **pinned**. An older whatsmeow gets refused by WhatsApp
with `Client outdated (405)` and no amount of restarting recovers it. When that
banner appears in the field, bump the pin, rebuild, redeploy.

The pinned whatsmeow requires **Go 1.26 or newer** (its own `go.mod` says so),
so the toolchain here is 1.26, not 1.25.

### The MyJKKN side

The bridge expects these four routes to exist on `MYJKKN_URL`, each
authenticated by the `x-bridge-secret` header:

| Route | Direction |
|---|---|
| `GET  /api/whatsapp-bridge/pending?limit=N` | messages to send |
| `POST /api/whatsapp-bridge/ack` | result of one send |
| `POST /api/whatsapp-bridge/inbound` | a received message |
| `POST /api/whatsapp-bridge/heartbeat` | liveness |

### Tests

```bash
go vet ./...
go test ./...
```
