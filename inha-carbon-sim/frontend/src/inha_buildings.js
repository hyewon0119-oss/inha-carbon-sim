/**
 * OSM Overpass API에서 자동 임포트한 인하대 캠퍼스 건물.
 *
 * 데이터 구조:
 *   osm_buildings.json = { campus_polys: [...], buildings: [...] }
 *   - campus_polys: amenity=university 폴리곤 (인하대 캠퍼스 경계)
 *   - buildings: 모든 건물. b.in_campus 가 set 이면 캠퍼스 폴리곤 내부
 *
 * 갱신: python ../fetch_osm_buildings.py
 */
import OSM_DATA from './osm_buildings.json';

const ALL_BUILDINGS = OSM_DATA.buildings || [];
export const CAMPUS_POLYS = OSM_DATA.campus_polys || [];

// 캠퍼스 폴리곤 안에 있어도 캠퍼스 건물이 아닌 것 (식음/매점/외부 임차)
// Grazie는 캠퍼스 안 카페라서 캠퍼스 건물로 분류 (제외 X)
const NON_CAMPUS_KEYWORDS = [
  'GS25', 'CU', 'Halal', 'Jafar', 'Ashrafia',
  'masjid', 'Rhea', 'LunaSquare', 'Shine', '메사', '나빌레',
  '인하대역', '아리스타', '헤리움', '편의점',
];

// 캠퍼스 폴리곤 밖이지만 캠퍼스 건물로 추가 (기숙사단지 등)
const FORCE_INCLUDE_KEYWORDS = [
  '웅비재', '학산생활', '인하드림센터', '비룡재', '김현태',
];

// 알려진 건물 메타데이터 (이름 → 정보)
const KNOWN = {
  '본관':              { id: 'bldg_main', type: 'old_building',   year: 1954, floors: 4,  height: 16, note: '대학 초기 건물, 자체 보존 방침' },
  '정석학술정보관':         { id: 'bldg_lib',  type: 'new_building',   year: 2009, floors: 8,  height: 32, note: '도서관, 신축 구조 양호' },
  '60주년기념관':         { id: 'bldg_60th', type: 'solar_building', year: 2014, floors: 14, height: 49, note: '기존 태양광 설치 건물' },
  '5호관':             { id: 'bldg_5',    type: 'old_building',   year: 1980, floors: 7,  height: 28, note: '문과대학·자연과학대' },
  '도서관(7호관)':         { id: 'bldg_7',    type: 'old_building',   year: 1985, floors: 6,  height: 24, note: '구 도서관' },
  '학생회관':            { id: 'bldg_student', type: 'old_building', year: 1988, floors: 5, height: 20, note: '학생편의시설' },
  '하이테크센터':          { id: 'bldg_hitech', type: 'solar_building', year: 2005, floors: 9, height: 36, note: '기존 태양광 설치 건물' },
  '체육관':             { id: 'bldg_gym',  type: 'old_building',   year: 1985, floors: 3,  height: 18, note: '체육시설' },
  '비룡재':             { id: 'bldg_dorm', type: 'new_building',   year: 2010, floors: 14, height: 56, note: '신축 기숙사' },
  '서호관':             { id: 'bldg_seoho', type: 'old_building',  year: 1983, floors: 5,  height: 22, note: '인문대' },
  '로스쿨관':            { id: 'bldg_law',  type: 'new_building',   year: 2008, floors: 7,  height: 28, note: '법학전문대학원' },
  '4호관':             { id: 'bldg_4',    type: 'old_building',   year: 1978, floors: 5,  height: 22, note: '옥상 냉각탑 점유' },
  '3호관':             { id: 'bldg_3',    type: 'old_building',   year: 1975, floors: 5,  height: 20, note: '옥상 적재하중 부족' },
  '6호관':             { id: 'bldg_6',    type: 'old_building',   year: 1983, floors: 6,  height: 24, note: '구조안전진단 미실시' },
  '8호관(평생교육원)':       { id: 'bldg_8',    type: 'old_building',   year: 1990, floors: 5,  height: 22, note: '평생교육원' },
  '9호관':             { id: 'bldg_9',    type: 'old_building',   year: 1990, floors: 5,  height: 22, note: '공학관' },
  '10호관':            { id: 'bldg_10',   type: 'old_building',   year: 1992, floors: 5,  height: 22, note: '공학관' },
  '2남관':             { id: 'bldg_2nam', type: 'old_building',   year: 1972, floors: 6,  height: 24, note: '옥상 적재하중 부족' },
  '인하드림센터2관':         { id: 'bldg_dream2', type: 'new_building',  year: 2018, floors: 7,  height: 30, note: '신축 기숙사' },
  '인하드림센터3관':         { id: 'bldg_dream3', type: 'new_building',  year: 2020, floors: 7,  height: 28, note: '신축 기숙사' },
  '김현태인하드림센터':        { id: 'bldg_dreamkh', type: 'new_building', year: 2019, floors: 8, height: 32, note: '신축 기숙사' },
  '1호관':             { id: 'bldg_1',    type: 'old_building',   year: 1971, floors: 5,  height: 20, note: '공학관' },
  '2호관':             { id: 'bldg_2h',   type: 'old_building',   year: 1973, floors: 5,  height: 20, note: '공학관' },
  'C호관':             { id: 'bldg_c',    type: 'old_building',   year: 1990, floors: 4,  height: 16, note: '부속 강의동' },
  '평생교육관':           { id: 'bldg_lifeed', type: 'old_building',  year: 1995, floors: 5,  height: 22, note: '평생교육원' },
  '동아리관':            { id: 'bldg_club', type: 'old_building',   year: 1992, floors: 3,  height: 14, note: '학생 동아리실' },
  '웅비재':             { id: 'bldg_woongbi', type: 'new_building', year: 2008, floors: 12, height: 48, note: '기숙사' },
  '학산생활문화센터':         { id: 'bldg_haksan', type: 'new_building',  year: 2015, floors: 4,  height: 18, note: '학생 생활문화시설' },
  '학군단':             { id: 'bldg_rotc', type: 'old_building',   year: 1985, floors: 2,  height: 8,  note: 'ROTC 학군단' },
  '격납고':             { id: 'bldg_hangar', type: 'old_building',  year: 1990, floors: 1,  height: 8,  note: '격납고' },
  '관중석':             { id: 'bldg_stand', type: 'old_building',   year: 1985, floors: 1,  height: 6,  note: '운동장 관중석' },
  '주차관리실':           { id: 'bldg_parkmgr', type: 'old_building', year: 2000, floors: 1, height: 4,  note: '주차관리실' },
  'Grazie':            { id: 'bldg_grazie', type: 'old_building', year: 2010, floors: 3, height: 12, note: '캠퍼스 카페' },
};

function shouldExclude(name) {
  if (!name) return false;
  return NON_CAMPUS_KEYWORDS.some((p) => name.includes(p));
}

function shouldForceInclude(name) {
  if (!name) return false;
  return FORCE_INCLUDE_KEYWORDS.some((p) => name.includes(p));
}

function lookupKnown(name) {
  const trimmed = (name || '').trim();
  if (KNOWN[trimmed]) return KNOWN[trimmed];
  const normalized = trimmed.replace(/\s+/g, '');
  for (const [k, v] of Object.entries(KNOWN)) {
    if (k.replace(/\s+/g, '') === normalized) return v;
  }
  return null;
}

// Shoelace 부호 면적 (CCW=양수, CW=음수)
function signedArea(ring) {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

// GeoJSON 외곽 링 = CCW (RFC 7946). MapLibre fill-extrusion 의 top face가
// CW일 때 backface-culling 돼서 안 보이는 문제를 막기 위해 정규화.
function ensureCCW(ring) {
  const cleaned = [];
  for (const pt of ring) {
    const last = cleaned[cleaned.length - 1];
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) cleaned.push(pt);
  }
  return signedArea(cleaned) < 0 ? cleaned.slice().reverse() : cleaned;
}

const usedIds = new Set();
function makeId(base, osmId) {
  let id = base;
  if (usedIds.has(id)) id = `${base}_${osmId}`;
  usedIds.add(id);
  return id;
}

function osmToZone(b) {
  const meta = lookupKnown(b.name) || {};
  const id = makeId(meta.id || `bldg_osm_${b.osm_id}`, b.osm_id);
  // 캠퍼스 폴리곤 안의 무명 건물도 노후건물(빨강)로 기본 분류 — 보라색 안 보이게
  const isUnnamed = !b.name;
  const defaultType = 'old_building';  // 무명이든 명명이든 기본 빨강
  return {
    id,
    osm_id: b.osm_id,
    name: b.name || `부속 #${b.osm_id}`,
    type: meta.type || defaultType,
    year: meta.year,
    height: meta.height || b.height || 12,
    floors: meta.floors || b.levels || Math.max(1, Math.round((b.height || 12) / 3.5)),
    note: meta.note || (isUnnamed ? '캠퍼스 부속 시설' : `OSM #${b.osm_id}`),
    polygon: ensureCCW(b.polygon),
    in_campus: !!b.in_campus,
  };
}

// 필터:
// 1) 캠퍼스 폴리곤 안 + 명시 제외 키워드 아님
// 2) 캠퍼스 폴리곤 밖이어도 FORCE_INCLUDE 키워드 매치 (기숙사 단지 등)
const filtered = ALL_BUILDINGS.filter((b) => {
  if (shouldExclude(b.name)) return false;
  if (b.in_campus) return true;
  if (shouldForceInclude(b.name)) return true;
  return false;
});

export const INHA_BUILDINGS = filtered.map(osmToZone);

if (typeof window !== 'undefined') {
  const named = INHA_BUILDINGS.filter((b) => !b.name.startsWith('부속')).length;
  const aux = INHA_BUILDINGS.length - named;
  console.log(`[inha_buildings] OSM 캠퍼스 건물 ${INHA_BUILDINGS.length}개 (이름 있음 ${named}, 부속 ${aux})`);
}
