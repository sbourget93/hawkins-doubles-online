"""Finalize the player map and load pre-2026 UDisc events into an environment via /commands.

  python3 load.py dry  <api>   # build + validate against <api>'s roster, no writes
  python3 load.py load <api>   # actually POST the batches

<api> is the base incl. /api, e.g. http://localhost/api or
https://hawkinsdubs.stephengb.com/api . The EXISTING roster (merge targets) is
read from <api>/players so merges resolve to that environment's real player ids
and typed-new names are correctly treated as new.
"""
import json, sys, re, uuid, urllib.request
from collections import defaultdict

ROOT = "/Users/stephenbourget/workspace/hawkins-doubles-online"
DATA = f"{ROOT}/data/udisc"
MAP = f"{DATA}/player_map"
NS = uuid.UUID("11111111-2222-3333-4444-555555555555")  # deterministic id namespace

# --- manual exceptions -----------------------------------------------------
# scraped userId -> corrected match_name (override whatever the map file says)
USERID_OVERRIDE = {"bwxxFcuFik": "Dan Curreri"}  # was "Dan Duff"; actually Dan Curreri (exists)
# new players that belong to the A pool (default is B)
POOL_A = {n.lower() for n in [
    "Harry Chace", "Lawrence Warwick", "Shane Wyatt", "Dan Laviolette", "Keaton Albro",
    "Carter Middleton", "Rick Steehler", "Eric Wilson", "Dima Dima", "Mike Drolet",
]}
WOMEN = {n.lower() for n in ["Emily Braun", "Amanda Borgman"]}
# ---------------------------------------------------------------------------

def det(*parts):
    return str(uuid.uuid5(NS, "|".join(str(p) for p in parts)))

def clean_name(s):
    s = re.sub(r"\s+", " ", (s or "").strip())
    def cap(t):
        if "-" in t:
            return "-".join(cap(x) for x in t.split("-"))
        if t[:2].lower() == "mc" and len(t) > 2:
            return "Mc" + t[2:3].upper() + t[3:].lower()
        if t[:2].lower() == "o'" and len(t) > 2:
            return "O'" + t[2:3].upper() + t[3:].lower()
        return t[:1].upper() + t[1:].lower() if t else t
    return " ".join(cap(t) for t in s.split(" "))

def split_name(full):
    toks = clean_name(full).split(" ")
    if len(toks) == 1:
        return toks[0], "(UDisc)"
    return toks[0], " ".join(toks[1:])

norm = lambda s: re.sub(r"\s+", " ", (s or "").strip().lower())

def fetch_existing(api):
    data = json.load(urllib.request.urlopen(f"{api}/players", timeout=20))
    return {norm(p["first_name"] + " " + p["last_name"]): p["player_id"] for p in data["players"]}

def load_map():
    rows = []
    for f in ["EXACT.json", "CONFIRM_first_name.json", "CONFIRM_fuzzy.json",
              "RESOLVE_ambiguous.json", "NEW.json"]:
        rows += json.load(open(f"{MAP}/{f}"))
    return rows

def build_resolution(existing):
    map_rows = load_map()
    resolve = {}        # scraped id (u:userId) -> target player_id
    new_players = {}    # target player_id -> (first, last, pool, is_woman)
    applied = set()     # override display-names actually created
    for r in map_rows:
        sid = "u:" + r["userId"]
        mn = USERID_OVERRIDE.get(r["userId"], (r.get("match_name") or "NEW").strip())
        if mn == "NEW":
            pid = det("player", "user", r["userId"])
            first, last = split_name(r["scraped_name"])
        elif norm(mn) in existing:
            resolve[sid] = existing[norm(mn)]
            continue
        else:
            pid = det("player", "name", norm(mn))
            first, last = split_name(mn)
        disp = norm(first + " " + last)
        pool = "A" if disp in POOL_A else "B"
        woman = disp in WOMEN
        if disp in POOL_A or disp in WOMEN:
            applied.add(disp)
        new_players[pid] = (first, last, pool, woman)
        resolve[sid] = pid
    return resolve, new_players, applied

# --- scraped data ---
events = {e["event_id"]: e for e in json.load(open(f"{DATA}/events.json"))}
teams_by_ev = defaultdict(list)
for t in json.load(open(f"{DATA}/teams.json")):
    teams_by_ev[t["event_id"]].append(t)
regs_by_team = defaultdict(list)
for rg in json.load(open(f"{DATA}/registrations.json")):
    regs_by_team[rg["team_id"]].append(rg["player_id"])
pre = sorted([e for e in events.values() if e["date"] < "2026-01-01"], key=lambda e: e["date"])

def build_batches(resolve, new_players):
    emitted, batches = set(), []
    for e in pre:
        sid_ev = e["event_id"]
        le = det("levent", sid_ev)
        ts = f"{e['date']}T22:00:00.000Z"
        evs, n = [], [0]
        def add(typ, agg, data):
            evs.append({"event_id": det("cmd", sid_ev, n[0]), "type": typ,
                        "aggregate_id": agg, "data": data, "created_at": ts})
            n[0] += 1
        add("LeagueEventCreated", le, {"date": e["date"], "title": e["title"] or "Hawkins Dubs"})
        ev_teams = teams_by_ev[sid_ev]
        pids_here = [resolve[sp] for t in ev_teams for sp in regs_by_team[t["team_id"]]]
        for pid in dict.fromkeys(pids_here):
            if pid in new_players and pid not in emitted:
                first, last, pool, woman = new_players[pid]
                add("PlayerCreated", pid, {"first_name": first, "last_name": last,
                                           "is_woman": woman, "default_pool": pool})
                emitted.add(pid)
        holes = {}
        for t in ev_teams:
            h = (t["startHole"] or 0) + 1
            if h not in holes:
                holes[h] = det("card", sid_ev, h)
                add("CardCreated", holes[h], {"league_event_id": le, "starting_hole": h})
        for t in ev_teams:
            tid = det("team", t["team_id"])
            add("TeamCreated", tid, {"card_id": holes[(t["startHole"] or 0) + 1], "handicap": 0})
            for sp in regs_by_team[t["team_id"]]:
                rid = det("reg", t["team_id"], sp)
                add("RegistrationCreated", rid, {"league_event_id": le, "player_id": resolve[sp]})
                add("RegistrationTeamAssigned", rid, {"team_id": tid})
            if t["score"] is not None:
                add("TeamScoreChanged", tid, {"score": t["score"]})
            if t["placement"] is not None:
                add("TeamPlacementChanged", tid, {"placement": t["placement"]})
        add("LeagueEventStateChanged", le, {"state": "completed"})
        batches.append((e, evs))
    return batches

if __name__ == "__main__":
    mode = sys.argv[1]
    api = sys.argv[2] if len(sys.argv) > 2 else "http://localhost/api"
    existing = fetch_existing(api)
    resolve, new_players, applied = build_resolution(existing)
    batches = build_batches(resolve, new_players)
    total = sum(len(evs) for _, evs in batches)
    merges = sum(1 for v in resolve.values() if v not in new_players)
    print(f"target api: {api}")
    print(f"existing roster: {len(existing)} | events: {len(batches)} | commands: {total}")
    print(f"new players: {len(new_players)} | scraped ids merging into existing: {merges}")
    want = POOL_A | WOMEN
    missing = want - applied
    print(f"overrides applied: {len(applied)}/{len(want)}" + (f"  MISSING: {sorted(missing)}" if missing else "  (all matched)"))
    print("  pool A new players:", sorted(f"{f} {l}" for (f, l, p, w) in new_players.values() if p == "A"))
    print("  women new players:", sorted(f"{f} {l}" for (f, l, p, w) in new_players.values() if w))
    print("  Dan Curreri override merges:", resolve.get("u:bwxxFcuFik") == existing.get("dan curreri"))

    if mode == "load":
        ver = json.load(urllib.request.urlopen(f"{api}/league-events"))["version"]
        print(f"\nLOADING to {api} ... start version={ver}")
        for i, (e, evs) in enumerate(batches, 1):
            body = json.dumps({"expected_version": ver, "events": evs}).encode()
            req = urllib.request.Request(f"{api}/commands", data=body,
                                         headers={"Content-Type": "application/json"}, method="POST")
            try:
                ver = json.load(urllib.request.urlopen(req))["version"]
            except urllib.error.HTTPError as ex:
                print(f"  [{i}/{len(batches)}] {e['date']} FAILED {ex.code}: {ex.read().decode()[:300]}")
                sys.exit(1)
            print(f"  [{i}/{len(batches)}] {e['date']} -> v{ver}")
        print(f"\nDONE. final version={ver}")
