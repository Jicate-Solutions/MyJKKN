"""Evolis Primacy 2 <-> MyJKKN print bridge (v0.3.2, 2026-10-03: mono back).
Polls MyJKKN for pending ID-card print jobs and drives the printer via the
official Evolis SDK. Runs as a Windows Service (nssm) in Block 4.
Duplex: if the claim response says has_back, the back PNG is fetched and staged
on CardFace.BACK — the SDK then enables duplex by itself (set_image docs:
"Setting a back bitmap also will impact the value of the Duplex and GDuplexType
settings"; GDuplexType falls back to the ribbon's default). One print() call
prints both faces. Missing/false has_back = front-only, exactly v0.3 behaviour.

v0.3.2 — the ribbon's DEFAULT duplex type for YMCKO is colour on BOTH faces
(DUPLEX_CC): a second full Y-M-C-K-O set for a back that is black text only.
Measured 2026-10-01: 133 cards consumed 264 sets (150 per 300-set roll, 84 s
per card). The "Front / Back combination = YMCO / K" saved in Evolis Premium
Suite does not reach an SDK session. So after the back is staged (which is
what resets GDuplexType) the session is told DUPLEX_CM explicitly: colour
front from Y-M-C-O, black back from the SAME set's K panel. One set per card,
300 per roll. The front path is unchanged. The 15 s post-card pause is also
cut to 2 s (print() blocks for the whole card, so it was pure idle time). See
MyJKKN repo docs/modules/id-cards/2026-10-01-OPS-bridge-mono-back.md.
"""
import os, sys, time, traceback
os.environ.setdefault("PYTHONUTF8", "1")

import urllib.request, json
from PIL import Image

ROTATE_DEGREES = 90       # front: flip to -90 if cards come out upside-down
BACK_ROTATE_DEGREES = 90  # back ONLY: flip to -90 if the first card's back is
                          # upside-down. Separate from the front's on purpose —
                          # the printer flips the card on one edge, so whether
                          # the back needs +90 or -90 is only provable on
                          # plastic, and correcting it must not break the front.

BASE_URL = os.environ.get("MYJKKN_BASE_URL", "https://www.jkkn.ai")
TOKEN = os.environ.get("AGENT_PRINT_TOKEN", "")
PRINTER = os.environ.get("EVOLIS_PRINTER_URI", "socket://192.10.1.102:9100")  # SDK URI (socket://IP:port)
POLL_SECONDS = 5
# Pause AFTER a card before polling for the next. v0.3.1 used 15 s as a rate
# limit for the printer's 280 cards/hour ceiling - but ps.print() only returns
# once the card is finished (pickup -> result measured 84 s/card on 2026-10-01
# with the colour/colour duplex), so the printer was then left idle for a
# further 15 s on every card. The physical print cycle IS the rate limit; the
# pause only needs to clear the ejector. v0.3.2: 2 s.
RATE_LIMIT_SECONDS = 2

FRIENDLY_ERRORS = {
    "ribbon": "Ribbon empty - replace and click Retry",
    "feeder": "Card feeder empty - load cards and click Retry",
    "cover": "Printer cover open - close it and click Retry",
    "offline": "Printer not responding - check power and network cable",
}

def api(method, path, body=None):
    req = urllib.request.Request(
        BASE_URL + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def friendly(err_text):
    low = err_text.lower()
    for key, msg in FRIENDLY_ERRORS.items():
        if key in low:
            return msg
    return f"Printer error: {err_text[:200]}"

def fetch_side_png(job, side):
    """Download the rendered PNG for one side of the card.
    Returns (bytes, None) on success, (None, "back_not_configured") when the
    template has no back, (None, error_message) on any other failure."""
    import urllib.error
    url = (BASE_URL + "/api/id-cards/templates/" + str(job["template_id"]) +
           "/render?profile_id=" + str(job["profile_id"]) + "&side=" + side + "&format=png")
    req = urllib.request.Request(
        url, method="GET",
        headers={"Authorization": "Bearer " + os.environ["AGENT_PRINT_TOKEN"]},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            status = getattr(r, "status", None) or r.getcode()
            ctype = r.headers.get("Content-Type", "")
            body = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            try:
                err = json.loads(e.read().decode())
                if err.get("error", {}).get("code") == "back_not_configured":
                    return None, "back_not_configured"
            except Exception:
                pass
        return None, "Card image download failed (" + side + "): HTTP " + str(e.code) + " - check AGENT_PRINT_TOKEN"
    except urllib.error.URLError as e:
        return None, "Card image download failed (" + side + "): " + str(getattr(e, "reason", e))
    if status != 200:
        return None, "Card image download failed (" + side + "): HTTP " + str(status)
    if not ctype.startswith("image/png"):
        return None, "Card image download failed (" + side + "): expected image/png, got '" + ctype + "'"
    # Fronts carry a photo (>10KB always); text-only backs are legitimately
    # smaller, so the back only guards against empty/error bodies.
    floor = 10240 if side == "front" else 2048
    if len(body) <= floor:
        return None, "Card image download failed (" + side + "): image too small (" + str(len(body)) + " bytes)"
    return body, None

def prep_bmp(png_body, png_path, rotate_degrees):
    """PNG bytes -> printer-ready portrait BMP next to png_path. Returns bmp path."""
    with open(png_path, "wb") as f:
        f.write(png_body)
    # Drop alpha (RGB) and rotate to portrait.
    img = Image.open(png_path).convert("RGB")
    if img.width > img.height:
        img = img.rotate(rotate_degrees, expand=True)
    bmp_path = os.path.splitext(png_path)[0] + ".bmp"
    img.save(bmp_path, "BMP")
    print("prepared " + os.path.basename(bmp_path) + " " + str(img.width) + "x" +
          str(img.height) + " (rotate=" + str(rotate_degrees) + ")", flush=True)
    return bmp_path

def _force_mono_back(ps):
    """Colour front + black back from ONE ribbon set (GDuplexType=DUPLEX_CM).

    Call AFTER set_image(CardFace.BACK): staging a back bitmap resets the
    Duplex/GDuplexType settings to the ribbon's default (DUPLEX_CC on YMCKO).
    Every step is guarded and logged; a setting the SDK does not know can never
    stop a print — the worst case is the old two-set behaviour, visible in the
    log as "[mono-back] ... FAILED".
    """
    import evolis
    key = getattr(evolis.SettingKey, "GDuplexType", None)
    if key is None:
        print("[mono-back] SettingKey.GDuplexType missing - run probe-sdk.ps1", flush=True)
        return
    try:
        ok = ps.set_setting(key, "DUPLEX_CM")
    except Exception as e:
        print("[mono-back] set_setting(GDuplexType, DUPLEX_CM) FAILED: " + repr(e), flush=True)
        return
    try:
        now = ps.get_setting(key)
    except Exception:
        now = "?"
    print("[mono-back] GDuplexType=DUPLEX_CM accepted=" + str(ok) + " now=" + str(now), flush=True)


def print_card(job, has_back=False):
    """Print one card (duplex when has_back). Returns (success, error_message)."""
    import evolis
    co = evolis.Connection(PRINTER, evolis.OpenMode.DIRECT)
    if not co.is_open():
        return False, FRIENDLY_ERRORS["offline"]
    try:
        cards_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cards")
        os.makedirs(cards_dir, exist_ok=True)
        body, err = fetch_side_png(job, "front")
        if err:
            return False, err
        front_bmp = prep_bmp(body, os.path.join(cards_dir, "job-" + str(job["id"]) + ".png"),
                             ROTATE_DEGREES)
        ps = evolis.PrintSession(co)
        ps.set_image(evolis.CardFace.FRONT, front_bmp)
        if has_back:
            body, err = fetch_side_png(job, "back")
            if err == "back_not_configured":
                # A front-only card is CORRECT here: claim said has_back but the
                # template has no back side. Log it and carry on single-sided.
                print("job " + str(job["id"]) + ": template has no back - printing front-only", flush=True)
            elif err:
                # Do NOT silently print half a card: fail so the retry/requeue
                # path gets another shot at fetching the back.
                return False, err
            else:
                back_bmp = prep_bmp(body, os.path.join(cards_dir, "job-" + str(job["id"]) + "-back.png"),
                                    BACK_ROTATE_DEGREES)
                # Staging a BACK image auto-enables duplex in the SDK
                # (Duplex/GDuplexType pick up the ribbon's default duplex mode).
                ps.set_image(evolis.CardFace.BACK, back_bmp)
                # ...and that default is colour/colour = two ribbon sets per
                # card. Override to colour front / black back (one set). Must
                # come AFTER set_image(BACK) - see _force_mono_back.
                _force_mono_back(ps)
        ok = ps.print()  # ONE print() call - both faces when duplex
        return (True, None) if ok else (False, "Print command was rejected by the printer")
    except Exception as e:
        return False, friendly(str(e))
    finally:
        co.close()

def main():
    if not TOKEN:
        print("AGENT_PRINT_TOKEN not set - bridge cannot authenticate. Exiting.")
        sys.exit(1)
    print(f"bridge v0.3.2 (duplex-aware, mono back) up: base={BASE_URL} printer={PRINTER}", flush=True)
    while True:
        try:
            jobs = api("GET", "/api/id-cards/jobs?status=pending&limit=1")
            rows = jobs if isinstance(jobs, list) else jobs.get("data", [])
            if rows:
                job = rows[0]
                claimed = api("POST", f"/api/id-cards/jobs/{job['id']}/pickup", {})
                # has_back comes from the claim response; fail-soft — missing or
                # false means front-only (byte-for-byte v0.3 behaviour).
                c = claimed.get("data", claimed) if isinstance(claimed, dict) else {}
                has_back = bool(c.get("has_back", False)) if isinstance(c, dict) else False
                ok, err = print_card(job, has_back)
                if not ok:  # retry once (hybrid failure model)
                    time.sleep(3)
                    ok, err = print_card(job, has_back)
                api("POST", f"/api/id-cards/jobs/{job['id']}/result",
                    {"success": ok, "error_message": None if ok else err})
                print(f"job {job['id']}: {'printed' if ok else 'FAILED: ' + str(err)}")
                time.sleep(RATE_LIMIT_SECONDS)
            else:
                time.sleep(POLL_SECONDS)
        except KeyboardInterrupt:
            break
        except Exception:
            traceback.print_exc()
            time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    main()
