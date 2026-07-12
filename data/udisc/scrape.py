"""Scrape the Hawkins Random Doubles UDisc league into local JSON.

Usage:
  python3 udisc_scrape.py enumerate      -> writes events_index.json
  python3 udisc_scrape.py fetchone <sid> -> prints one round's essentials
"""
import json, sys, time, urllib.request, datetime, re

LEAGUE = "hawkins-random-doubles-nC3Rvk"
BASE = "https://udisc.com"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125 Safari/537.36")

def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")

def raw_first(text):
    """First JSON value (payload may have trailing stream chunks)."""
    return json.JSONDecoder().raw_decode(text)[0]

def resolve(arr):
    def r(i, stack):
        # Negative reference codes are turbo-stream sentinels (undefined/NaN/etc);
        # real negative numbers are stored as literals at positive indices.
        if not isinstance(i, int) or i < 0 or i >= len(arr):
            return None
        if i in stack:
            return None
        v = arr[i]
        if isinstance(v, dict):
            if v and all(isinstance(k, str) and k.startswith("_") for k in v):
                s2 = stack | {i}
                out = {}
                for k, val in v.items():
                    key = r(int(k[1:]), s2)
                    out[key if isinstance(key, (str, int)) else str(key)] = r(val, s2)
                return out
            return v
        if isinstance(v, list):
            s2 = stack | {i}
            return [r(x, s2) for x in v]
        return v
    return r(0, frozenset())

def get_data(path):
    """Fetch a route's .data, following SingleFetchRedirect app-redirects."""
    for _ in range(6):
        # split query
        if "?" in path:
            p, q = path.split("?", 1)
            url = f"{BASE}{p}.data?{q}"
        else:
            url = f"{BASE}{path}.data"
        text = _get(url)
        arr = raw_first(text)
        if isinstance(arr, list) and arr and isinstance(arr[0], list) \
                and arr[0] and arr[0][0] == "SingleFetchRedirect":
            # locate the redirect target string
            idx = arr.index("redirect")
            target = arr[idx + 1]
            # strip scheme+host if present
            m = re.match(r"https?://[^/]+(/.*)", target)
            path = m.group(1) if m else target
            continue
        return resolve(arr)
    raise RuntimeError("too many redirects for " + path)

def find_all(o, name, out):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == name:
                out.append(v)
            find_all(v, name, out)
    elif isinstance(o, list):
        for v in o:
            find_all(v, name, out)

def ms_to_date(v):
    if isinstance(v, list) and len(v) == 2 and v[0] == "D":
        v = v[1]
    if isinstance(v, (int, float)):
        return datetime.datetime.utcfromtimestamp(v / 1000).date().isoformat()
    return None

def enumerate_events():
    seen = {}
    page = 1
    while True:
        data = get_data(f"/leagues/{LEAGUE}/schedule?page={page}")
        listings = []
        find_all(data, "eventListings", listings)
        got = listings[0] if listings else []
        new = 0
        for el in got:
            sid = el.get("shortId")
            if not sid:
                continue
            # date from first round, else startDate
            date = None
            rounds = el.get("eventRounds") or []
            if rounds:
                date = ms_to_date(rounds[0].get("startsAt"))
            if not date:
                date = ms_to_date(el.get("startDate"))
            status = el.get("status") or (rounds[0].get("status") if rounds else None)
            if sid not in seen:
                new += 1
            seen[sid] = {"shortId": sid, "date": date, "name": el.get("name"),
                         "status": status,
                         "playFormat": el.get("playFormat"),
                         "layoutName": el.get("layoutName")}
        print(f"  page {page}: {len(got)} listings, {new} new (total {len(seen)})", file=sys.stderr)
        if new == 0:
            break
        page += 1
        time.sleep(0.3)
    return sorted(seen.values(), key=lambda e: e["date"] or "")

def extract_round(short_id):
    """Fetch one event's round-1 leaderboard and return essentials."""
    data = get_data(f"/events/hawkins-random-doubles-{short_id}/leaderboard?round=1")
    lb = data["routes/events/$slug/leaderboard"]["data"]
    reg = lb.get("registrantDetailLookupByRegistrantId", {})

    def players_for(rid):
        det = reg.get(rid, {})
        out = []
        for s in (det.get("soloUserRegistrants") or []):
            out.append({"name": s.get("name"),
                        "userId": s.get("registrantUserId"),
                        "pdga": s.get("pdgaNumber")})
        return out

    el = lb.get("eventListing") or {}
    locs = el.get("locations") or []
    course = locs[0].get("courseName") if locs else None
    layout = (lb.get("round", {}) or {}).get("frozenLayout", {}).get("name") \
        or (lb.get("layout", {}) or {}).get("name")
    teams = []
    for e in lb.get("roundEntryResults", []):
        teams.append({
            "place": e.get("ranking"),
            "tie": bool(e.get("rankingIsTie")),
            "score": e.get("relativeEventScore"),
            "startHole": e.get("startingHoleIndex"),
            "complete": e.get("isComplete"),
            "players": players_for(e.get("eventRegistrantId")),
        })
    teams.sort(key=lambda t: (t["place"] if t["place"] is not None else 999))
    return {
        "shortId": short_id,
        "date": ms_to_date((lb.get("round", {}) or {}).get("startsAt")),
        "title": el.get("name"),
        "course": course,
        "layout": layout,
        "teamCount": len(teams),
        "teams": teams,
    }

def player_key(p):
    if p.get("userId"):
        return "u:" + p["userId"]
    return "g:" + re.sub(r"\s+", " ", (p.get("name") or "").strip().lower())

def scrape_all(outdir):
    import os
    os.makedirs(os.path.join(outdir, "rounds"), exist_ok=True)
    idx = json.load(open("events_index.json"))
    finished = [e for e in idx if e["status"] == "finished"]
    players, events, teams, regs = {}, [], [], []
    for n, ev in enumerate(finished, 1):
        try:
            r = extract_round(ev["shortId"])
        except Exception as exc:
            print(f"  [{n}/{len(finished)}] {ev['date']} {ev['shortId']} FAILED: {exc}",
                  file=sys.stderr)
            continue
        date = r["date"] or ev["date"]
        event_id = ev["shortId"]
        events.append({"event_id": event_id, "date": date, "title": r["title"],
                       "course": r["course"], "layout": r["layout"],
                       "teamCount": r["teamCount"]})
        # per-round file (essentials, self-contained)
        json.dump({"event_id": event_id, "date": date, "title": r["title"],
                   "course": r["course"], "layout": r["layout"], "teams": r["teams"]},
                  open(os.path.join(outdir, "rounds", f"{date}_{event_id}.json"), "w"),
                  indent=2)
        # normalized rows
        for ti, t in enumerate(r["teams"]):
            team_id = f"{event_id}-t{ti}"
            teams.append({"team_id": team_id, "event_id": event_id,
                          "placement": t["place"], "tie": t["tie"],
                          "score": t["score"], "startHole": t["startHole"]})
            for p in t["players"]:
                k = player_key(p)
                if k not in players:
                    players[k] = {"player_id": k, "name": p["name"],
                                  "userId": p.get("userId"), "pdga": p.get("pdga")}
                regs.append({"event_id": event_id, "team_id": team_id, "player_id": k})
        print(f"  [{n}/{len(finished)}] {date} {event_id}: {r['teamCount']} teams",
              file=sys.stderr)
        time.sleep(0.3)
    json.dump(sorted(players.values(), key=lambda p: (p["name"] or "")),
              open(os.path.join(outdir, "players.json"), "w"), indent=2)
    json.dump(sorted(events, key=lambda e: e["date"]),
              open(os.path.join(outdir, "events.json"), "w"), indent=2)
    json.dump(teams, open(os.path.join(outdir, "teams.json"), "w"), indent=2)
    json.dump(regs, open(os.path.join(outdir, "registrations.json"), "w"), indent=2)
    print(f"\nDONE: {len(events)} events, {len(players)} players, "
          f"{len(teams)} teams, {len(regs)} registrations -> {outdir}")

if __name__ == "__main__":
    if sys.argv[1] == "enumerate":
        evs = enumerate_events()
        json.dump(evs, open("events_index.json", "w"), indent=2)
        print(f"wrote events_index.json: {len(evs)} events, "
              f"{evs[0]['date']} .. {evs[-1]['date']}")
    elif sys.argv[1] == "fetchone":
        print(json.dumps(extract_round(sys.argv[2]), indent=2))
    elif sys.argv[1] == "scrape":
        scrape_all(sys.argv[2])
