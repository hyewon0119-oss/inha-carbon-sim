import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { ITEM_MAP } from './items.js';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// 인하대학교 본관 부근
const INHA_CENTER = [126.6565, 37.4516];

export default function CampusMap({ selectedType, items, onPlace, onRemove }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markersRef = useRef(new Map());
  const selectedRef = useRef(selectedType);

  useEffect(() => { selectedRef.current = selectedType; }, [selectedType]);

  useEffect(() => {
    if (!mapboxgl.accessToken) {
      containerRef.current.innerHTML =
        '<div style="padding:40px;color:#f85149">Mapbox 토큰이 없습니다. frontend/.env 확인</div>';
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: INHA_CENTER,
      zoom: 16.5,
      pitch: 60,
      bearing: -20,
      antialias: true,
    });
    mapRef.current = map;

    map.on('load', () => {
      // 3D 건물 레이어 (Mapbox 기본 벡터 타일 사용)
      const layers = map.getStyle().layers;
      const labelLayerId = layers.find(
        (l) => l.type === 'symbol' && l.layout && l.layout['text-field']
      )?.id;

      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#2a3441',
            'fill-extrusion-height': [
              'interpolate', ['linear'], ['zoom'],
              15, 0, 15.05, ['get', 'height'],
            ],
            'fill-extrusion-base': [
              'interpolate', ['linear'], ['zoom'],
              15, 0, 15.05, ['get', 'min_height'],
            ],
            'fill-extrusion-opacity': 0.85,
          },
        },
        labelLayerId
      );
    });

    map.on('click', (e) => {
      const type = selectedRef.current;
      if (!type) return;
      onPlace({ type, lng: e.lngLat.lng, lat: e.lngLat.lat });
    });

    map.on('contextmenu', (e) => e.preventDefault());

    return () => map.remove();
  }, []);

  // items 동기화 → 마커 생성/삭제
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const current = markersRef.current;
    const incomingIds = new Set(items.map((it) => it.id));

    // 제거
    for (const [id, marker] of current) {
      if (!incomingIds.has(id)) {
        marker.remove();
        current.delete(id);
      }
    }

    // 추가
    for (const it of items) {
      if (current.has(it.id)) continue;
      const meta = ITEM_MAP[it.type];
      if (!meta) continue;

      const el = document.createElement('div');
      el.style.cssText = `
        width: 32px; height: 32px; border-radius: 50%;
        background: ${meta.color}; border: 2px solid #fff;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,.5);
      `;
      el.textContent = meta.icon;
      el.title = `${meta.label} (우클릭/Shift+클릭 삭제)`;

      const handleRemove = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onRemove(it.id);
      };
      el.addEventListener('contextmenu', handleRemove);
      el.addEventListener('click', (ev) => {
        if (ev.shiftKey) handleRemove(ev);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([it.lng, it.lat])
        .addTo(map);
      current.set(it.id, marker);
    }
  }, [items, onRemove]);

  // 커서 변경
  useEffect(() => {
    if (!mapRef.current) return;
    const canvas = mapRef.current.getCanvas();
    canvas.style.cursor = selectedType ? 'crosshair' : '';
  }, [selectedType]);

  return <div id="map" ref={containerRef} />;
}
