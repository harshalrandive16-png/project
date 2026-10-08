"""Live disaster feed for BhoomiSuraksha.
Setup:  pip install feedparser requests
In app.py:
    from live_feed import live_bp
    app.register_blueprint(live_bp)
"""
import re, time, calendar, html
from urllib.parse import quote
import requests, feedparser
from flask import Blueprint, jsonify

live_bp = Blueprint("live_feed", __name__)
_cache = {"t": 0, "data": None}
TTL = 120  # seconds

HAZARD_Q = ["India flood alert", "India landslide", "India cyclone", "India earthquake",
            "India cloudburst", "India heavy rain red alert"]
ROAD_Q = ["highway blocked landslide India", "NH road closed flood India",
          "road washed away bridge collapse India"]

HAZARDS = {"flood": "flood", "landslide": "landslide", "cyclone": "cyclone", "earthquake": "earthquake",
           "cloudburst": "cloudburst", "lightning": "lightning", "heatwave": "heatwave",
           "rain": "heavy rain", "depression": "cyclone"}
SEV_HI = ["dead", "killed", "death", "die", "toll", "collapse", "red alert", "evacuat",
          "washed away", "trapped", "missing", "swept"]
SEV_MD = ["orange alert", "flash flood", "alert", "warning", "submerge", "inundat"]

STATES = {
 "Kerala": (10.85, 76.27), "Uttarakhand": (30.07, 79.02), "Himachal": (31.10, 77.17),
 "Odisha": (20.95, 85.10), "Assam": (26.20, 92.94), "Maharashtra": (19.75, 75.71),
 "Tamil Nadu": (11.13, 78.66), "West Bengal": (22.99, 87.85), "Bihar": (25.10, 85.31),
 "Uttar Pradesh": (26.85, 80.91), "Delhi": (28.61, 77.21), "Gujarat": (22.26, 71.19),
 "Rajasthan": (27.02, 74.22), "Madhya Pradesh": (22.97, 78.66), "Chhattisgarh": (21.28, 81.87),
 "Jharkhand": (23.61, 85.28), "Karnataka": (15.32, 75.71), "Andhra": (15.91, 79.74),
 "Telangana": (18.11, 79.02), "Punjab": (31.15, 75.34), "Haryana": (29.06, 76.09),
 "Jammu": (33.78, 76.58), "Kashmir": (34.08, 74.80), "Sikkim": (27.53, 88.51),
 "Arunachal": (28.22, 94.73), "Meghalaya": (25.47, 91.37), "Manipur": (24.66, 93.91),
 "Nagaland": (26.16, 94.56), "Tripura": (23.94, 91.99), "Mizoram": (23.16, 92.94),
 "Goa": (15.30, 74.12), "Ladakh": (34.15, 77.58), "Mumbai": (19.08, 72.88),
}
STATE_LABEL = {"Himachal": "Himachal Pradesh", "Andhra": "Andhra Pradesh", "Jammu": "Jammu & Kashmir",
               "Kashmir": "Jammu & Kashmir", "Arunachal": "Arunachal Pradesh", "Mumbai": "Maharashtra"}


def fetch(q):
    url = f"https://news.google.com/rss/search?q={quote(q + ' when:3d')}&hl=en-IN&gl=IN&ceid=IN:en"
    try:
        r = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        return feedparser.parse(r.content).entries
    except Exception:
        return []


def parse(entries):
    out, seen = [], set()
    for e in entries:
        title = html.unescape(e.get("title", ""))
        src = (e.get("source") or {}).get("title", "")
        if src and title.endswith(" - " + src):
            title = title[: -len(src) - 3]
        key = title.lower()[:60]
        if key in seen or not e.get("published_parsed"):
            continue
        seen.add(key)
        low = title.lower()
        state = next((s for s in STATES if s.lower() in low), None)
        hazard = next((v for k, v in HAZARDS.items() if k in low), "alert")
        sev = 3 if any(w in low for w in SEV_HI) else 2 if any(w in low for w in SEV_MD) else 1
        out.append({"title": title, "source": src or "News", "url": e.get("link", ""),
                    "ts": calendar.timegm(e.published_parsed) * 1000, "hazard": hazard,
                    "state": state, "sev": sev,
                    "level": {3: "severe", 2: "high", 1: "moderate"}[sev]})
    return out


def build():
    alerts = []
    for q in HAZARD_Q:
        alerts += parse(fetch(q))
    alerts = list({a["title"].lower()[:60]: a for a in alerts}.values())
    alerts.sort(key=lambda a: a["ts"], reverse=True)

    roads = []
    for q in ROAD_Q:
        for r in parse(fetch(q)):
            low = r["title"].lower()
            if not re.search(r"highway|road|bridge|expressway|nh[- ]?\d+|yatra|route", low):
                continue
            if not re.search(r"block|closed|shut|washed|cut off|collapse|jam|diversion|halt|snarl", low):
                continue
            m = re.search(r"\bNH[- ]?(\d+[A-Z]?)", r["title"], re.I)
            blocked = re.search(r"block|closed|shut|washed|cut off|collapse", low)
            r["code"] = f"NH-{m.group(1).upper()}" if m else "ROAD"
            r["status"] = "BLOCKED" if blocked else "CAUTION"
            r["level"] = "severe" if blocked else "high"
            roads.append(r)
    roads = list({r["title"].lower()[:60]: r for r in roads}.values())
    roads.sort(key=lambda r: r["ts"], reverse=True)

    # Ranking: score by recency x severity x number of reports per state
    now, groups = time.time() * 1000, {}
    for a in alerts:
        if not a["state"]:
            continue
        g = groups.setdefault(a["state"], {"score": 20, "n": 0, "ts": 0, "hz": {}})
        age_h = (now - a["ts"]) / 3.6e6
        g["score"] += a["sev"] * 4 * max(0.2, 1 - age_h / 72)
        g["n"] += 1
        g["ts"] = max(g["ts"], a["ts"])
        g["hz"][a["hazard"]] = g["hz"].get(a["hazard"], 0) + 1
    ranking = []
    for s, g in groups.items():
        sc = min(99, round(g["score"]))
        lat, lng = STATES[s]
        ranking.append({"name": STATE_LABEL.get(s, s), "hazard": max(g["hz"], key=g["hz"].get),
                        "score": sc, "reports": g["n"], "ts": g["ts"], "lat": lat, "lng": lng,
                        "level": "SEVERE" if sc >= 75 else "HIGH" if sc >= 55 else "MODERATE" if sc >= 40 else "LOW"})
    ranking.sort(key=lambda x: x["score"], reverse=True)
    return {"alerts": alerts[:30], "roads": roads[:20], "ranking": ranking[:12],
            "generated": int(now)}


@live_bp.route("/api/live-feed")
def live_feed():
    if not _cache["data"] or time.time() - _cache["t"] > TTL:
        _cache["data"], _cache["t"] = build(), time.time()
    resp = jsonify(_cache["data"])
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp
