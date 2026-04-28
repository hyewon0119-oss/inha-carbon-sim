"""OSM Overpass API에서 인하대 캠퍼스 영역의 모든 building 폴리곤을 가져와 JSON으로 저장.

사용:
    python fetch_osm_buildings.py
출력:
    frontend/src/osm_buildings.json
"""

import json
import urllib.request
import urllib.parse
import sys
from pathlib import Path

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# 인하대학교 본 캠퍼스 (남, 서, 북, 동) — 검색용 광역 bbox
BBOX = (37.4465, 126.6480, 37.4540, 126.6640)

# 1) 인하대 캠퍼스 폴리곤 (amenity=university or landuse=university)
# 2) 그 안의 모든 building 폴리곤
QUERY = f"""
[out:json][timeout:60];
// 1. 인하대학교 캠퍼스 경계
(
  way["amenity"="university"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  way["landuse"="university"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  relation["amenity"="university"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
)->.campus;

// 2. 캠퍼스 폴리곤 안의 건물 (관계 의미상 inha 캠퍼스 안)
(
  way(area.campus)["building"];
  relation(area.campus)["building"];
)->.campus_buildings;

// 3. 또한 일반 bbox 내 모든 건물 (캠퍼스 폴리곤이 없을 경우 대비)
(
  way["building"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  relation["building"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
)->.all_buildings;

// 출력
.campus out geom;
.all_buildings out geom;
"""


def fetch():
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    headers = {
        "User-Agent": "inha-carbon-sim/0.1 (educational; https://github.com/example)",
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    req = urllib.request.Request(OVERPASS_URL, data=data, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def parse_height(tags, default_levels=3):
    """height 우선, 없으면 building:levels * 3.5m, 그것도 없으면 default_levels * 3.5m"""
    h = tags.get("height")
    if h:
        try:
            return float(str(h).replace("m", "").strip())
        except ValueError:
            pass
    levels = tags.get("building:levels") or tags.get("levels")
    if levels:
        try:
            return int(float(levels)) * 3.5
        except ValueError:
            pass
    return default_levels * 3.5


def parse_levels(tags):
    levels = tags.get("building:levels") or tags.get("levels")
    if levels:
        try:
            return int(float(levels))
        except ValueError:
            return None
    return None


def way_to_polygon(el):
    if "geometry" not in el:
        return None
    pts = [[g["lon"], g["lat"]] for g in el["geometry"]]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 3:
        return None
    return pts


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def main():
    print("Fetching from Overpass API...", flush=True)
    try:
        raw = fetch()
    except Exception as e:
        print(f"Overpass fetch failed: {e}", file=sys.stderr)
        sys.exit(1)

    # 캠퍼스 경계 폴리곤 (amenity=university)
    campus_polys = []
    buildings = []
    for el in raw.get("elements", []):
        if el.get("type") != "way":
            continue
        polygon = way_to_polygon(el)
        if not polygon:
            continue
        tags = el.get("tags", {})
        if tags.get("amenity") == "university" or tags.get("landuse") == "university":
            campus_polys.append({"name": tags.get("name", ""), "polygon": polygon})
            continue
        if "building" not in tags:
            continue
        name = (
            tags.get("name:ko")
            or tags.get("name")
            or tags.get("name:en")
            or tags.get("ref")
            or ""
        )
        # 건물 중심점이 어느 캠퍼스 폴리곤 안에 있는지 검사
        cxs = [p[0] for p in polygon]
        cys = [p[1] for p in polygon]
        cx = sum(cxs) / len(cxs)
        cy = sum(cys) / len(cys)
        in_campus = None
        for cp in campus_polys:
            if point_in_ring(cx, cy, cp["polygon"]):
                in_campus = cp["name"] or "campus"
                break
        buildings.append({
            "osm_id": el["id"],
            "name": name,
            "building": tags.get("building", "yes"),
            "levels": parse_levels(tags),
            "height": round(parse_height(tags), 1),
            "polygon": polygon,
            "in_campus": in_campus,  # 캠퍼스 폴리곤 안이면 캠퍼스 이름, 아니면 None
        })

    # 캠퍼스 폴리곤도 같이 저장
    out = Path(__file__).parent / "frontend" / "src" / "osm_buildings.json"
    payload = {"campus_polys": campus_polys, "buildings": buildings}
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    named = sum(1 for b in buildings if b["name"])
    in_campus_count = sum(1 for b in buildings if b["in_campus"])
    print(f"OK: {len(buildings)} buildings ({named} named, {in_campus_count} in campus polygon)", flush=True)
    print(f"   {len(campus_polys)} campus polygons found", flush=True)
    print(f"   → {out}", flush=True)


if __name__ == "__main__":
    main()
