export const ITEM_TYPES = [
  { id: 'solar',     label: '태양광 패널', icon: '☀️',  coeff: 460,  unit: 'kW',  color: '#f2cc60' },
  { id: 'led',       label: 'LED 조명',   icon: '💡',  coeff: 30,   unit: '개',   color: '#58a6ff' },
  { id: 'ev',        label: 'EV 충전소',  icon: '🔌',  coeff: 1200, unit: '기',   color: '#a371f7' },
  { id: 'greenroof', label: '그린루프',   icon: '🌿',  coeff: 5,    unit: '㎡',  color: '#56d364' },
  { id: 'tree',      label: '수목',       icon: '🌳',  coeff: 22,   unit: '그루', color: '#3fb950' },
];

export const ITEM_MAP = Object.fromEntries(ITEM_TYPES.map((t) => [t.id, t]));
