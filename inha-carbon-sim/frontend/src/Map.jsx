import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ITEM_MAP, buildItemPolygon, buildPolePolygon } from './items.js';
import { CAMPUS_ZONES, DECORATIVE_TREES, WALKWAYS } from './zones.js';

// Mapbox 토큰이 있으면 Mapbox 스타일을, 없으면 OpenFreeMap (무료, 토큰 불필요)
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const USE_MAPBOX = !!MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith('pk.');

const INHA_CENTER = [126.6555, 37.4493];

// OSM 3D 건물 레이어 — 스타일별 source 차이
const OSM_BUILDING_SOURCE = USE_MAPBOX ? 'composite' : 'openmaptiles';

const ZONE_STYLE = {
  old_building:   { ground: '#f8514922', line: '#f85149', roof: '#7d3c40', wall: '#5a2a2d' },
  new_building:   { ground: '#56d36422', line: '#56d364', roof: '#3a8b48', wall: '#246332' },
  solar_building: { ground: '#f2cc6033', line: '#f2cc60', roof: '#b8964a', wall: '#7d6630' },
  hospital:       { ground: '#ff7b7222', line: '#ff7b72', roof: '#8a4a48', wall: '#5a2e2c' },
  main_road:      { ground: '#f8514944', line: '#ff7b72' },
  parking:        { ground: '#a371f733', line: '#a371f7' },
  green:          { ground: '#3fb95055', line: '#3fb950' },
  plaza:          { ground: '#8b949e33', line: '#8b949e' },
  sports:         { ground: '#58a6ff33', line: '#58a6ff' },
  water:          { ground: '#1e6091', line: '#58a6ff' },
};

const BUILDING_TYPES = ['old_building', 'new_building', 'solar_building', 'hospital'];

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
      geometry: { type: 'Polygon', coordinates: [[...z.polygon, z.polygon[0]]] },
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
        geometry: { type: 'Polygon', coordinates: [[...z.polygon, z.polygon[0]]] },
      })),
  };
}

// 점이 폴리곤 안에 있는지 (간단 ray casting)
function pointInPolygon(lng, lat, ring) {
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

function findBuildingHeight(lng, lat) {
  const z = CAMPUS_ZONES.find(
    (z) => BUILDING_TYPES.includes(z.type) && pointInPolygon(lng, lat, z.polygon)
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

    // 본체
    const ring = buildItemPolygon(it);
    if (ring) {
      features.push({
        type: 'Feature',
        properties: {
          id: it.id,
          itemType: it.type,
          color: m.color,
          topColor: m.topColor || m.color,
          base: baseHeight + (m.hasPole ? m.poleHeight : 0),
          top: baseHeight + (m.hasPole ? m.poleHeight : 0) + m.height,
          isBody: true,
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
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
    // 토큰 없어도 동작 — OpenFreeMap 무료 타일 사용
    const styleUrl = USE_MAPBOX
      ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${MAPBOX_TOKEN}`
      : 'https://tiles.openfreemap.org/styles/dark';

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: INHA_CENTER,
      zoom: 17,
      pitch: 62,
      bearing: -25,
      antialias: true,
      maxPitch: 75,
    });
    mapRef.current = map;

    map.on('load', () => {
      // ── 조명 (maplibre는 setFog 미지원, setLight만) ──
      try {
        map.setLight({ anchor: 'viewport', color: '#ffeacc', intensity: 0.6, position: [1.5, 220, 30] });
      } catch {}

      const layers = map.getStyle().layers;
      const labelLayerId = layers.find(
        (l) => l.type === 'symbol' && l.layout && l.layout['text-field']
      )?.id;

      // ── 배경 OSM 3D 건물 (source는 스타일에 따라 다름) ──
      // OpenFreeMap에는 height 속성이 'render_height' 일 수도 있음 → fallback 처리
      const buildingSource = map.getSource(OSM_BUILDING_SOURCE) ? OSM_BUILDING_SOURCE
        : (map.getSource('openmaptiles') ? 'openmaptiles' : null);

      if (buildingSource) {
        map.addLayer(
          {
            id: '3d-buildings',
            source: buildingSource,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': [
                'interpolate', ['linear'],
                ['coalesce', ['get', 'render_height'], ['get', 'height'], 5],
                0, '#262d3a', 20, '#2e3645', 50, '#3a4458', 100, '#4a566f',
              ],
              'fill-extrusion-height': [
                'interpolate', ['linear'], ['zoom'],
                15, 0,
                15.05, ['coalesce', ['get', 'render_height'], ['get', 'height'], 5],
              ],
              'fill-extrusion-base': [
                'interpolate', ['linear'], ['zoom'],
                15, 0,
                15.05, ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
              ],
              'fill-extrusion-opacity': 0.85,
              'fill-extrusion-vertical-gradient': true,
            },
          },
          labelLayerId
        );
      }

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
      map.addLayer({
        id: 'zones-line', type: 'line', source: 'campus-zones',
        filter: ['!=', ['get', 'zoneType'], 'water'],
        paint: {
          'line-color': lineColorExpr,
          'line-width': ['case', ['==', ['get', 'isBuilding'], true], 1.5, 2],
          'line-dasharray': ['case', ['==', ['get', 'isBuilding'], true], ['literal', [1, 0]], ['literal', [3, 2]]],
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

      const wallColorExpr = ['match', ['get', 'zoneType'],
        'old_building', '#5a2a2d', 'new_building', '#246332',
        'solar_building', '#7d6630', 'hospital', '#5a2e2c', '#3a4458',
      ];
      const roofColorExpr = ['match', ['get', 'zoneType'],
        'old_building', '#7d3c40', 'new_building', '#3a8b48',
        'solar_building', '#f2cc60', 'hospital', '#8a4a48', '#4a566f',
      ];

      map.addLayer(
        {
          id: 'campus-buildings-3d', type: 'fill-extrusion', source: 'campus-buildings',
          paint: {
            'fill-extrusion-color': wallColorExpr,
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.95,
            'fill-extrusion-vertical-gradient': true,
            'fill-extrusion-ambient-occlusion-intensity': 0.5,
            'fill-extrusion-ambient-occlusion-radius': 5.0,
          },
        },
        labelLayerId
      );
      map.addLayer(
        {
          id: 'campus-buildings-roof', type: 'fill-extrusion', source: 'campus-buildings',
          paint: {
            'fill-extrusion-color': roofColorExpr,
            'fill-extrusion-height': ['+', ['get', 'height'], 0.5],
            'fill-extrusion-base': ['get', 'height'],
            'fill-extrusion-opacity': 1.0,
          },
        },
        labelLayerId
      );

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
      map.addLayer({
        id: 'zones-label', type: 'symbol', source: 'campus-zones',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['case', ['==', ['get', 'isBuilding'], true], 12, 11],
          'text-allow-overlap': false,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#0d1117', 'text-halo-width': 2 },
      });

      // ── 호버 팝업 ──
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px' });
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
