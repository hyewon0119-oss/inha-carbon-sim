import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ITEM_MAP, buildItemPolygon, buildPolePolygon } from './items.js';
import { CAMPUS_ZONES, DECORATIVE_TREES, WALKWAYS } from './zones.js';
import { CAMPUS_POLYS, INHA_BUILDINGS } from './inha_buildings.js';

// 캠퍼스 건물의 OSM way ID — OSM 배경 레이어에서 이 ID들은 제외해서 z-fighting 방지
const CAMPUS_OSM_IDS = INHA_BUILDINGS.map((b) => b.osm_id).filter(Boolean);

// OpenFreeMap 무료 벡터 타일 사용 — 토큰 불필요
// (Mapbox 토큰이 있어도 maplibre는 mapbox:// 내부 URL을 해결 못해서 무조건 OpenFreeMap 사용)
const INHA_CENTER = [126.6555, 37.4493];

const ZONE_STYLE = {
  old_building:   { ground: '#f8514922', line: '#f85149', roof: '#7d3c40', wall: '#5a2a2d' },
  new_building:   { ground: '#56d36422', line: '#56d364', roof: '#3a8b48', wall: '#246332' },
  solar_building: { ground: '#f2cc6033', line: '#f2cc60', roof: '#b8964a', wall: '#7d6630' },
  hospital:       { ground: '#ff7b7222', line: '#ff7b72', roof: '#8a4a48', wall: '#5a2e2c' },
  auxiliary:      { ground: '#8b949e22', line: '#8b949e', roof: '#6c7a8c', wall: '#3f4a5b' },
  main_road:      { ground: '#f8514944', line: '#ff7b72' },
  parking:        { ground: '#a371f733', line: '#a371f7' },
  green:          { ground: '#3fb95055', line: '#3fb950' },
  plaza:          { ground: '#8b949e33', line: '#8b949e' },
  sports:         { ground: '#58a6ff33', line: '#58a6ff' },
  water:          { ground: '#1e6091', line: '#58a6ff' },
};

const BUILDING_TYPES = ['old_building', 'new_building', 'solar_building', 'hospital', 'auxiliary'];

// 폴리곤 좌표를 GeoJSON 좌표로 변환 (outer + 선택적 hole)
function toGeoJSONCoords(z) {
  const outer = [...z.polygon, z.polygon[0]];
  if (z.hole) {
    return [outer, [...z.hole, z.hole[0]]];
  }
  return [outer];
}

function zonesToGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: CAMPUS_ZONES.map((z) => ({
      type: 'Feature',
      properties: {
        id: z.id, name: z.name, zoneType: z.type, note: z.note || '',
        height: z.height || 0, floors: z.floors || 0,
        isBuilding: BUILDING_TYPES.includes(z.type),
      },
      geometry: { type: 'Polygon', coordinates: toGeoJSONCoords(z) },
    })),
  };
}

function buildingsGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: CAMPUS_ZONES
      .filter((z) => BUILDING_TYPES.includes(z.type) && z.height)
      .map((z) => ({
        type: 'Feature',
        properties: { id: z.id, name: z.name, zoneType: z.type, height: z.height, floors: z.floors },
        geometry: { type: 'Polygon', coordinates: toGeoJSONCoords(z) },
      })),
  };
}

// 점이 폴리곤 안에 있는지 (hole 고려)
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInZone(lng, lat, zone) {
  if (!pointInRing(lng, lat, zone.polygon)) return false;
  if (zone.hole && pointInRing(lng, lat, zone.hole)) return false;
  return true;
}

function findBuildingHeight(lng, lat) {
  const z = CAMPUS_ZONES.find(
    (z) => BUILDING_TYPES.includes(z.type) && pointInZone(lng, lat, z)
  );
  return z?.height || 0;
}

// 배치된 아이템들을 3D 폴리곤 GeoJSON으로 변환
function placedItemsGeoJSON(items) {
  const features = [];
  for (const it of items) {
    const meta = ITEM_MAP[it.type];
    if (!meta?.model3d) continue;
    const m = meta.model3d;
    const baseHeight = m.onRoof ? findBuildingHeight(it.lng, it.lat) : 0;

    // 본체 — buildItemPolygon 은 단일 ring 또는 ring 배열 반환
    const result = buildItemPolygon(it);
    if (result) {
      // panel_array → result = [ring1, ring2, ...] (ring = 점 배열)
      // 단일 → result = [[lng,lat], [lng,lat], ...] (점 배열)
      const isMulti = Array.isArray(result[0]) && Array.isArray(result[0][0]);
      const ringsToRender = isMulti ? result : [result];
      ringsToRender.forEach((r, idx) => {
        features.push({
          type: 'Feature',
          properties: {
            id: it.id + (isMulti ? `_p${idx}` : ''),
            itemType: it.type,
            color: m.color,
            topColor: m.topColor || m.color,
            base: baseHeight + (m.hasPole ? m.poleHeight : 0),
            top: baseHeight + (m.hasPole ? m.poleHeight : 0) + m.height,
            isBody: true,
            parentId: it.id,
          },
          geometry: { type: 'Polygon', coordinates: [r] },
        });
      });
    }

    // 기둥 (있을 경우)
    if (m.hasPole) {
      const pole = buildPolePolygon(it);
      if (pole) {
        features.push({
          type: 'Feature',
          properties: {
            id: it.id,
            itemType: it.type,
            color: m.poleColor,
            topColor: m.poleColor,
            base: baseHeight,
            top: baseHeight + m.poleHeight,
            isBody: false,
          },
          geometry: { type: 'Polygon', coordinates: [pole] },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

export default function CampusMap({ selectedType, items, onPlace, onRemove }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const selectedRef = useRef(selectedType);
  const onRemoveRef = useRef(onRemove);
  const onPlaceRef = useRef(onPlace);

  useEffect(() => { selectedRef.current = selectedType; }, [selectedType]);
  useEffect(() => { onRemoveRef.current = onRemove; }, [onRemove]);
  useEffect(() => { onPlaceRef.current = onPlace; }, [onPlace]);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: INHA_CENTER,
      zoom: 17,
      pitch: 62,
      bearing: -25,
      antialias: true,
      maxPitch: 75,
    });
    mapRef.current = map;

    map.on('load', () => {
      // 호버 팝업 — 모든 레이어 추가 전에 미리 만들어 둠 (이후 핸들러에서 참조)
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px' });

      // ── 조명 (maplibre는 setFog 미지원, setLight만) ──
      try {
        map.setLight({ anchor: 'viewport', color: '#ffeacc', intensity: 0.6, position: [1.5, 220, 30] });
      } catch {}

      // ── OpenFreeMap dark 스타일의 기본 'building' 2D fill 레이어 숨김 ──
      // (rgb(10,10,10) 검정 fill이 우리 3D 건물 위에 그려져서 어둡게 보이는 원인)
      try {
        if (map.getLayer('building')) {
          map.setLayoutProperty('building', 'visibility', 'none');
        }
      } catch (e) {
        console.warn('기본 building 레이어 숨김 실패:', e.message);
      }

      const layers = map.getStyle().layers;
      const labelLayerId = layers.find(
        (l) => l.type === 'symbol' && l.layout && l.layout['text-field']
      )?.id;

      // ── 사용자가 지정한 OSM 타일 ID 별 건물 색상/이름 (대체 분류) ──
      // OpenMapTiles는 캠퍼스 일부 건물에 합성 ID를 부여하므로 Overpass 데이터에 없음.
      // 사용자가 호버해서 알려준 ID를 여기에 넣으면 빨강/녹색/노랑으로 도색됨.
      const TILE_ID_OVERRIDES = {
        // 사용자 지정: 큰 안뜰 건물 = 인하대 5호관 (태양광 설치 추정)
        31492463: { type: 'solar_building', name: '5호관 (인하대)', color: '#ffd633' },
      };
      const TILE_OLD_IDS = Object.keys(TILE_ID_OVERRIDES)
        .filter(k => TILE_ID_OVERRIDES[k].type === 'old_building').map(Number);
      const TILE_NEW_IDS = Object.keys(TILE_ID_OVERRIDES)
        .filter(k => TILE_ID_OVERRIDES[k].type === 'new_building').map(Number);
      const TILE_SOLAR_IDS = Object.keys(TILE_ID_OVERRIDES)
        .filter(k => TILE_ID_OVERRIDES[k].type === 'solar_building').map(Number);
      const ALL_OVERRIDE_IDS = Object.keys(TILE_ID_OVERRIDES).map(Number);

      // ── 배경 OSM 3D 건물 ──
      // 사용자 지정 override ID는 별도 색으로, 나머지는 보라색
      try {
        if (map.getSource('openmaptiles')) {
          map.addLayer({
            id: '3d-buildings',
            source: 'openmaptiles',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            // 사용자 지정 override 건물은 별도 레이어에서 그릴 거니 이 레이어에서 제외
            filter: ['!', ['in', ['id'], ['literal', ALL_OVERRIDE_IDS]]],
            paint: {
              'fill-extrusion-color': '#9b7cc7',  // 보라색 (캠퍼스 외부 건물)
              'fill-extrusion-height': ['get', 'render_height'],
              'fill-extrusion-base': ['get', 'render_min_height'],
              'fill-extrusion-opacity': 1.0,
              'fill-extrusion-vertical-gradient': false,
            },
          }, labelLayerId);

          // ── 사용자 지정 OSM 건물 (빨강 = 노후) ──
          if (TILE_OLD_IDS.length > 0) {
            map.addLayer({
              id: '3d-buildings-old',
              source: 'openmaptiles',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 14,
              filter: ['in', ['id'], ['literal', TILE_OLD_IDS]],
              paint: {
                'fill-extrusion-color': '#e85a5a',
                'fill-extrusion-height': ['get', 'render_height'],
                'fill-extrusion-base': ['get', 'render_min_height'],
                'fill-extrusion-opacity': 1.0,
                'fill-extrusion-vertical-gradient': false,
              },
            }, labelLayerId);
          }
          // ── 사용자 지정 OSM 건물 (녹색 = 신축) ──
          if (TILE_NEW_IDS.length > 0) {
            map.addLayer({
              id: '3d-buildings-new',
              source: 'openmaptiles',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 14,
              filter: ['in', ['id'], ['literal', TILE_NEW_IDS]],
              paint: {
                'fill-extrusion-color': '#3ddc84',
                'fill-extrusion-height': ['get', 'render_height'],
                'fill-extrusion-base': ['get', 'render_min_height'],
                'fill-extrusion-opacity': 1.0,
                'fill-extrusion-vertical-gradient': false,
              },
            }, labelLayerId);
          }
          // ── 사용자 지정 OSM 건물 (노랑 = 태양광) ──
          if (TILE_SOLAR_IDS.length > 0) {
            map.addLayer({
              id: '3d-buildings-solar',
              source: 'openmaptiles',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 14,
              filter: ['in', ['id'], ['literal', TILE_SOLAR_IDS]],
              paint: {
                'fill-extrusion-color': '#ffd633',
                'fill-extrusion-height': ['get', 'render_height'],
                'fill-extrusion-base': ['get', 'render_min_height'],
                'fill-extrusion-opacity': 1.0,
                'fill-extrusion-vertical-gradient': false,
              },
            }, labelLayerId);
          }

          // ── override 건물 라벨 ──
          // 각 override 건물 ID 별로 화살표 표시 (수동으로 좌표 지정)
          // (자동으로는 어려워서 일단 콘솔 로그만)
          const labelFeatures = Object.entries(TILE_ID_OVERRIDES).map(([idStr, info]) => {
            const id = Number(idStr);
            // OSM source-layer 'building' 에서 ID로 features 찾기 — 이건 비동기적이라
            // map.querySourceFeatures 로 모든 타일 로드 후 검색
            return { id, info };
          });
          // 타일이 로드된 후 라벨 표시
          map.once('idle', () => {
            const feats = map.querySourceFeatures('openmaptiles', {
              sourceLayer: 'building',
              filter: ['in', ['id'], ['literal', ALL_OVERRIDE_IDS]],
            });
            console.log('[override] 매칭된 OSM 건물 features:', feats.length);
            const labelGeoJSON = {
              type: 'FeatureCollection',
              features: feats.map(f => {
                const info = TILE_ID_OVERRIDES[f.id];
                if (!info) return null;
                // 폴리곤 중심 계산
                const ring = f.geometry.coordinates[0];
                let cx = 0, cy = 0;
                for (const [x, y] of ring) { cx += x; cy += y; }
                cx /= ring.length; cy /= ring.length;
                return {
                  type: 'Feature',
                  properties: { name: info.name, id: f.id },
                  geometry: { type: 'Point', coordinates: [cx, cy] },
                };
              }).filter(Boolean),
            };
            if (map.getSource('override-labels')) {
              map.getSource('override-labels').setData(labelGeoJSON);
            } else {
              map.addSource('override-labels', { type: 'geojson', data: labelGeoJSON });
              map.addLayer({
                id: 'override-labels-layer',
                type: 'symbol',
                source: 'override-labels',
                layout: {
                  'text-field': ['get', 'name'],
                  'text-size': 13,
                  'text-font': ['Noto Sans Regular'],
                  'text-allow-overlap': true,
                },
                paint: {
                  'text-color': '#ffffff',
                  'text-halo-color': '#0d1117',
                  'text-halo-width': 2.5,
                },
              });
            }
          });
        }
      } catch (err) {
        console.warn('OSM 3D 건물 레이어 추가 실패:', err.message);
      }

      // ── 캠퍼스 경계 (OSM amenity=university 폴리곤, 인하대 + 인하공전 둘 다) ──
      const campusBoundaryGeoJSON = {
        type: 'FeatureCollection',
        features: CAMPUS_POLYS
          .filter((cp) => cp.name === '인하대학교' || cp.name === '인하공업전문대학')
          .map((cp) => ({
            type: 'Feature',
            properties: { name: cp.name },
            geometry: {
              type: 'Polygon',
              coordinates: [[...cp.polygon, cp.polygon[0]]],
            },
          })),
      };
      map.addSource('campus-boundary', { type: 'geojson', data: campusBoundaryGeoJSON });
      // fill 레이어는 depth test에 간섭 가능성이 있어서 제거. line만 남김.
      map.addLayer({
        id: 'campus-boundary-line',
        type: 'line',
        source: 'campus-boundary',
        paint: {
          'line-color': '#58a6ff',
          'line-width': 2,
          'line-opacity': 0.5,
          'line-dasharray': [4, 3],
        },
      });

      // ── 캠퍼스 구역 ──
      map.addSource('campus-zones', { type: 'geojson', data: zonesToGeoJSON() });

      const groundColorExpr = ['match', ['get', 'zoneType'],
        ...Object.entries(ZONE_STYLE).flatMap(([k, v]) => [k, v.ground]),
        '#ffffff11',
      ];
      const lineColorExpr = ['match', ['get', 'zoneType'],
        ...Object.entries(ZONE_STYLE).flatMap(([k, v]) => [k, v.line]),
        '#ffffff44',
      ];

      // 인경호
      map.addLayer({
        id: 'water-fill', type: 'fill', source: 'campus-zones',
        filter: ['==', ['get', 'zoneType'], 'water'],
        paint: { 'fill-color': '#1c5d8c', 'fill-opacity': 0.85 },
      });
      map.addLayer({
        id: 'water-edge', type: 'line', source: 'campus-zones',
        filter: ['==', ['get', 'zoneType'], 'water'],
        paint: { 'line-color': '#7fc3ed', 'line-width': 2, 'line-opacity': 0.7, 'line-blur': 1 },
      });

      // 비건물·비호수 지면
      map.addLayer({
        id: 'zones-ground-fill', type: 'fill', source: 'campus-zones',
        filter: ['all', ['==', ['get', 'isBuilding'], false], ['!=', ['get', 'zoneType'], 'water']],
        paint: { 'fill-color': groundColorExpr, 'fill-opacity': 0.6 },
      });
      // 비건물 외곽선 (점선)
      map.addLayer({
        id: 'zones-line-nonbldg', type: 'line', source: 'campus-zones',
        filter: ['all', ['!=', ['get', 'zoneType'], 'water'], ['==', ['get', 'isBuilding'], false]],
        paint: {
          'line-color': lineColorExpr,
          'line-width': 2,
          'line-dasharray': [3, 2],
          'line-opacity': 0.6,
        },
      });
      // 건물 외곽선 (실선)
      map.addLayer({
        id: 'zones-line-bldg', type: 'line', source: 'campus-zones',
        filter: ['==', ['get', 'isBuilding'], true],
        paint: {
          'line-color': lineColorExpr,
          'line-width': 1.5,
          'line-opacity': 0.6,
        },
      });

      // 산책로
      map.addSource('walkways', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: WALKWAYS.map((w) => ({
            type: 'Feature', properties: { id: w.id },
            geometry: { type: 'LineString', coordinates: w.coordinates },
          })),
        },
      });
      map.addLayer({
        id: 'walkways-line', type: 'line', source: 'walkways',
        paint: { 'line-color': '#c9b88a', 'line-width': 2.5, 'line-opacity': 0.7 },
      });

      // ── 인하대 정의 건물 (3D) ──
      map.addSource('campus-buildings', { type: 'geojson', data: buildingsGeoJSON() });

      // 건물 색상 — 진하고 채도 높은 단색
      const buildingColorExpr = ['match', ['get', 'zoneType'],
        'old_building',   '#e85a5a',  // 강렬한 빨강 (노후건물)
        'new_building',   '#3ddc84',  // 강렬한 녹색 (신축)
        'solar_building', '#ffd633',  // 강렬한 노랑 (태양광)
        'hospital',       '#ff8a65',  // 산호색 (의료)
        'auxiliary',      '#42a5f5',  // 강렬한 파랑 (부속 시설, OSM 무명)
        '#7a8aa0',                     // 기본
      ];

      // 단일 fill-extrusion 레이어 — base 1m로 들어 올려서 OSM 위에
      map.addLayer(
        {
          id: 'campus-buildings-3d', type: 'fill-extrusion', source: 'campus-buildings',
          paint: {
            'fill-extrusion-color': buildingColorExpr,
            'fill-extrusion-height': ['+', ['get', 'height'], 1],
            'fill-extrusion-base': 1,
            'fill-extrusion-opacity': 1.0,
            'fill-extrusion-vertical-gradient': false,
          },
        },
        labelLayerId
      );

      // 디버그: GeoJSON에 들어간 건물 개수 + 샘플
      const bgj = buildingsGeoJSON();
      console.log(`[Map] campus-buildings GeoJSON: ${bgj.features.length} features`);
      if (bgj.features.length > 0) {
        const sample = bgj.features.slice(0, 3).map(f => ({
          name: f.properties.name,
          height: f.properties.height,
          zoneType: f.properties.zoneType,
          coords: f.geometry.coordinates[0].length + 'pts',
        }));
        console.log('[Map] 샘플:', sample);
      }

      // ── 기존 태양광 패널 시각화 (solar_building 옥상 자동 표시) ──
      // 인하대 60주년기념관, 하이테크센터, 5호관 = 이미 태양광 설치됨
      function makePanelArray(cxLng, cyLat, widthLng, heightLat, baseAlt) {
        const features = [];
        const arrayWLng = widthLng * 0.5;
        const arrayHLat = heightLat * 0.5;
        const cols = 5;
        const rows = 3;
        const panelW = arrayWLng / cols;
        const panelH = arrayHLat / rows;
        const startLng = cxLng - arrayWLng / 2;
        const startLat = cyLat - arrayHLat / 2;
        const gap = 0.2;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const pl = startLng + col * panelW + panelW * gap / 2;
            const pa = startLat + row * panelH + panelH * gap / 2;
            const w = panelW * (1 - gap);
            const h = panelH * (1 - gap);
            features.push({
              type: 'Feature',
              properties: { base: baseAlt, top: baseAlt + 1.0 },
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [pl, pa], [pl + w, pa], [pl + w, pa + h], [pl, pa + h], [pl, pa],
                ]],
              },
            });
          }
        }
        return features;
      }

      const existingSolarFeatures = [];
      // 캠퍼스 등록된 solar_building 건물
      for (const z of CAMPUS_ZONES) {
        if (z.type !== 'solar_building' || !z.height) continue;
        const xs = z.polygon.map((p) => p[0]);
        const ys = z.polygon.map((p) => p[1]);
        const cxLng = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cyLat = (Math.min(...ys) + Math.max(...ys)) / 2;
        const widthLng = Math.max(...xs) - Math.min(...xs);
        const heightLat = Math.max(...ys) - Math.min(...ys);
        // 빌딩 높이 + 3m 버퍼 (OSM 타일과 KNOWN 높이 차이 흡수)
        const baseAlt = z.height + 3;
        existingSolarFeatures.push(...makePanelArray(cxLng, cyLat, widthLng, heightLat, baseAlt));
      }
      map.addSource('existing-solar', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: existingSolarFeatures },
      });
      // 패널 본체 (다크 네이비)
      map.addLayer({
        id: 'existing-solar-panels',
        type: 'fill-extrusion',
        source: 'existing-solar',
        paint: {
          'fill-extrusion-color': '#0d1a3a',
          'fill-extrusion-height': ['get', 'top'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 1.0,
          'fill-extrusion-vertical-gradient': false,
        },
      });
      // 패널 윗면 (반사 청색)
      map.addLayer({
        id: 'existing-solar-panels-top',
        type: 'fill-extrusion',
        source: 'existing-solar',
        paint: {
          'fill-extrusion-color': '#3b5fa8',
          'fill-extrusion-height': ['+', ['get', 'top'], 0.2],
          'fill-extrusion-base': ['get', 'top'],
          'fill-extrusion-opacity': 1.0,
          'fill-extrusion-vertical-gradient': false,
        },
      });
      console.log(`[기존 태양광] solar_building (캠퍼스 등록) 옥상에 ${existingSolarFeatures.length}개 패널 표시`);

      // OSM 타일 ID Override 중 solar_building 인 건물도 옥상에 패널 자동 표시
      // (타일 로드 후 비동기로 polygon 가져와서 처리)
      const SOLAR_OVERRIDE_IDS = Object.entries(TILE_ID_OVERRIDES)
        .filter(([, info]) => info.type === 'solar_building')
        .map(([k]) => Number(k));
      if (SOLAR_OVERRIDE_IDS.length > 0) {
        map.once('idle', () => {
          const feats = map.querySourceFeatures('openmaptiles', {
            sourceLayer: 'building',
            filter: ['in', ['id'], ['literal', SOLAR_OVERRIDE_IDS]],
          });
          const newPanels = [];
          for (const f of feats) {
            const ring = f.geometry.coordinates[0];
            const xs = ring.map((p) => p[0]);
            const ys = ring.map((p) => p[1]);
            const cxLng = (Math.min(...xs) + Math.max(...xs)) / 2;
            const cyLat = (Math.min(...ys) + Math.max(...ys)) / 2;
            const widthLng = Math.max(...xs) - Math.min(...xs);
            const heightLat = Math.max(...ys) - Math.min(...ys);
            const baseAlt = (f.properties?.render_height || 20) + 3;
            newPanels.push(...makePanelArray(cxLng, cyLat, widthLng, heightLat, baseAlt));
          }
          const src = map.getSource('existing-solar');
          if (src && newPanels.length > 0) {
            src.setData({
              type: 'FeatureCollection',
              features: [...existingSolarFeatures, ...newPanels],
            });
            console.log(`[기존 태양광] OSM 타일 override (5호관 등) 옥상에 ${newPanels.length}개 추가`);
          }
        });
      }

      // ── 캠퍼스 전력 인프라 (한전 인입점 + 변전실) ──
      // 인하대는 일반 대학과 비슷하게 정문 인근에 한전 인입점, 본관-인경호 사이 중앙 변전실로 추정
      const INFRA_POINTS = [
        { id: 'kepco_in', name: '⚡ 한전 인입점',
          lng: 126.65445, lat: 37.44805,  // 정문 진입로 부근
          color: '#ff6b35', height: 12,
          desc: '22.9kV 지중 인입선 종단점 (KEPCO ↔ 캠퍼스 변전실)' },
        { id: 'main_substation', name: '🔌 캠퍼스 주변전실',
          lng: 126.65525, lat: 37.44935,  // 본관 동측 중앙
          color: '#ffa726', height: 10,
          desc: '22.9kV → 380V/220V 강압, 캠퍼스 전체 배전 분기점' },
      ];
      const infraFeatures = INFRA_POINTS.map((p) => {
        const r = 0.00006;
        const latRatio = 1 / Math.cos((p.lat * Math.PI) / 180);
        const rx = r * latRatio;
        const ring = [
          [p.lng - rx, p.lat - r], [p.lng + rx, p.lat - r],
          [p.lng + rx, p.lat + r], [p.lng - rx, p.lat + r],
          [p.lng - rx, p.lat - r],
        ];
        return {
          type: 'Feature',
          properties: { name: p.name, desc: p.desc, color: p.color, height: p.height },
          geometry: { type: 'Polygon', coordinates: [ring] },
        };
      });
      const infraLabelFeatures = INFRA_POINTS.map((p) => ({
        type: 'Feature',
        properties: { name: p.name },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      }));
      map.addSource('infra-3d', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: infraFeatures },
      });
      map.addSource('infra-labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: infraLabelFeatures },
      });
      map.addLayer({
        id: 'infra-3d-layer',
        type: 'fill-extrusion',
        source: 'infra-3d',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 1.0,
          'fill-extrusion-vertical-gradient': false,
        },
      });
      map.addLayer({
        id: 'infra-labels-layer',
        type: 'symbol',
        source: 'infra-labels',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 13,
          'text-font': ['Noto Sans Regular'],
          'text-allow-overlap': true,
          'text-offset': [0, -1.5],
        },
        paint: {
          'text-color': '#ffd633',
          'text-halo-color': '#0d1117',
          'text-halo-width': 2.5,
        },
      });

      // 인프라 호버 팝업
      map.on('mousemove', 'infra-3d-layer', (e) => {
        const f = e.features[0];
        if (!f) return;
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${f.properties.name}</strong><br/><span style="font-size:11px;color:#8b949e">${f.properties.desc}</span>`)
          .addTo(map);
      });
      map.on('mouseleave', 'infra-3d-layer', () => popup.remove());

      // ── 장식용 나무 ──
      const treeRadius = 0.000035;
      const decorTrees = {
        type: 'FeatureCollection',
        features: DECORATIVE_TREES.map((t, i) => {
          const ring = [];
          const sides = 6;
          const latRatio = 1 / Math.cos((t.lat * Math.PI) / 180);
          for (let s = 0; s < sides; s++) {
            const angle = (s / sides) * Math.PI * 2;
            ring.push([
              t.lng + Math.cos(angle) * treeRadius * latRatio,
              t.lat + Math.sin(angle) * treeRadius * 1.3,
            ]);
          }
          ring.push(ring[0]);
          return {
            type: 'Feature',
            properties: { height: 6 + ((i * 7) % 5), colorIdx: i % 3 },
            geometry: { type: 'Polygon', coordinates: [ring] },
          };
        }),
      };
      map.addSource('decorative-trees', { type: 'geojson', data: decorTrees });

      map.addLayer({
        id: 'trees-canopy', type: 'fill-extrusion', source: 'decorative-trees',
        paint: {
          'fill-extrusion-color': ['match', ['get', 'colorIdx'],
            0, '#3d7a40', 1, '#4a8c4f', 2, '#2f6a35', '#3d7a40'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 1.5, 'fill-extrusion-opacity': 0.92,
          'fill-extrusion-vertical-gradient': true,
        },
      });
      map.addLayer({
        id: 'trees-trunk', type: 'fill-extrusion', source: 'decorative-trees',
        paint: {
          'fill-extrusion-color': '#5a3a1f',
          'fill-extrusion-height': 1.5, 'fill-extrusion-base': 0,
        },
      });

      // ── 라벨 ──
      // OpenFreeMap은 Noto Sans, Mapbox는 Open Sans → 둘 다 폴백 시도
      map.addLayer({
        id: 'zones-label', type: 'symbol', source: 'campus-zones',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['case', ['==', ['get', 'isBuilding'], true], 12, 11],
          'text-allow-overlap': false,
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#0d1117', 'text-halo-width': 2 },
      });

      // ── 호버 팝업 핸들러 (popup 객체는 앞쪽에서 이미 생성됨) ──
      const onHover = (e) => {
        const f = e.features[0];
        if (!f) return;
        const { name, zoneType, note, floors } = f.properties;
        const typeLabel = {
          old_building: '🔴 노후건물', new_building: '🟢 신축건물', solar_building: '🟡 태양광 설치 건물',
          main_road: '🔴 주도로 (지중송전선)', parking: '🟣 주차장', green: '🟢 녹지',
          plaza: '⚪ 포장 광장', sports: '🔵 운동장', hospital: '🔴 의료시설',
          water: '💧 호수 (인경호)',
        }[zoneType] || zoneType;
        const floorInfo = floors ? `<br/><span style="font-size:11px;color:#7ee787">🏢 ${floors}층</span>` : '';
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${name}</strong><br/><span style="font-size:12px">${typeLabel}</span>${floorInfo}<br/><span style="font-size:11px;color:#8b949e">${note || ''}</span>`)
          .addTo(map);
      };
      map.on('mousemove', 'zones-ground-fill', onHover);
      map.on('mousemove', 'campus-buildings-3d', onHover);

      // OSM 배경 건물도 호버 시 OSM ID + 좌표 + 클릭 시 좌표 콘솔 출력
      map.on('mousemove', '3d-buildings', (e) => {
        const f = e.features[0];
        if (!f) return;
        const id = f.id || f.properties?.osm_id || '?';
        const h = f.properties?.render_height || '?';
        const { lng, lat } = e.lngLat;
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<strong>OSM 배경 건물</strong>
            <br/><span style="font-size:12px;color:#9b7cc7">🟣 ID #${id}</span>
            <br/><span style="font-size:11px">render_height: ${h}m</span>
            <br/><span style="font-size:11px;color:#7ee787">📍 ${lng.toFixed(5)}, ${lat.toFixed(5)}</span>
            <br/><span style="font-size:10px;color:#8b949e">우클릭 → 콘솔에 좌표 출력</span>`)
          .addTo(map);
      });
      map.on('mouseleave', '3d-buildings', () => popup.remove());

      // 우클릭으로 위치 콘솔 출력 (사용자가 클릭한 건물의 좌표 식별용)
      map.on('contextmenu', '3d-buildings', (e) => {
        e.preventDefault();
        const f = e.features[0];
        const { lng, lat } = e.lngLat;
        console.log(`[OSM 우클릭] OSM ID=${f?.id || '?'}, 클릭위치=(${lng.toFixed(6)}, ${lat.toFixed(6)})`);
      });
      map.on('mousemove', 'water-fill', onHover);
      map.on('mouseleave', 'zones-ground-fill', () => popup.remove());
      map.on('mouseleave', 'campus-buildings-3d', () => popup.remove());
      map.on('mouseleave', 'water-fill', () => popup.remove());

      // ── 배치된 아이템 (3D 익스트루전) ──
      map.addSource('placed-items', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      // 본체
      map.addLayer({
        id: 'placed-items-body',
        type: 'fill-extrusion',
        source: 'placed-items',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'top'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.95,
          'fill-extrusion-vertical-gradient': true,
        },
      });
      // 윗면 강조 (얇은 레이어)
      map.addLayer({
        id: 'placed-items-top',
        type: 'fill-extrusion',
        source: 'placed-items',
        filter: ['==', ['get', 'isBody'], true],
        paint: {
          'fill-extrusion-color': ['get', 'topColor'],
          'fill-extrusion-height': ['+', ['get', 'top'], 0.3],
          'fill-extrusion-base': ['get', 'top'],
          'fill-extrusion-opacity': 1,
        },
      });

      // 호버 시 강조 + 클릭 시 삭제 안내
      map.on('mouseenter', 'placed-items-body', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'placed-items-body', () => {
        map.getCanvas().style.cursor = selectedRef.current ? 'crosshair' : '';
      });

      // 배치된 아이템 클릭 → 삭제 (Shift+클릭 또는 우클릭)
      const handleItemClick = (e) => {
        if (!e.features || !e.features[0]) return;
        const id = e.features[0].properties.id;
        if (e.originalEvent.shiftKey) {
          e.preventDefault();
          onRemoveRef.current(id);
          return true;
        }
      };
      map.on('click', 'placed-items-body', handleItemClick);
      map.on('contextmenu', 'placed-items-body', (e) => {
        if (!e.features || !e.features[0]) return;
        e.preventDefault();
        onRemoveRef.current(e.features[0].properties.id);
      });
    });

    // 일반 클릭 → 새 아이템 배치
    map.on('click', (e) => {
      const type = selectedRef.current;
      if (!type) return;
      if (e.originalEvent.shiftKey) return;

      // 이미 배치된 아이템 위 클릭 → 무시
      const placedHits = map.queryRenderedFeatures(e.point, { layers: ['placed-items-body'] });
      if (placedHits.length > 0) return;

      // 3D 건물 클릭 보정:
      // 사용자가 시각적으로 건물 옥상을 클릭하면 e.lngLat이 건물 footprint 너머
      // 지면에 떨어짐. 건물 레이어 hit-test로 클릭한 건물 폴리곤의 중앙 근처로 옮김.
      let { lng, lat } = e.lngLat;
      const bldHits = map.queryRenderedFeatures(e.point, { layers: ['campus-buildings-3d'] });
      if (bldHits.length > 0) {
        const props = bldHits[0].properties;
        const zone = CAMPUS_ZONES.find((z) => z.id === props.id);
        if (zone) {
          // 폴리곤 중심을 사용 (안전한 옥상 위치)
          let cx = 0, cy = 0;
          for (const [x, y] of zone.polygon) { cx += x; cy += y; }
          cx /= zone.polygon.length; cy /= zone.polygon.length;
          // 같은 건물에 여러 개 배치 시 겹치지 않게 약간씩 분산
          const offset = 0.000015;
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * offset;
          lng = cx + Math.cos(angle) * dist / Math.cos((cy * Math.PI) / 180);
          lat = cy + Math.sin(angle) * dist;
        }
      }
      onPlaceRef.current({ type, lng, lat });
    });

    map.on('contextmenu', (e) => e.preventDefault());

    return () => map.remove();
  }, []);

  // 배치 아이템 변경 시 GeoJSON 업데이트
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const update = () => {
      const src = map.getSource('placed-items');
      if (src) src.setData(placedItemsGeoJSON(items));
    };
    if (map.isStyleLoaded()) update();
    else map.once('load', update);
  }, [items]);

  // 커서 변경
  useEffect(() => {
    if (!mapRef.current) return;
    const canvas = mapRef.current.getCanvas();
    canvas.style.cursor = selectedType ? 'crosshair' : '';
  }, [selectedType]);

  return <div id="map" ref={containerRef} />;
}
