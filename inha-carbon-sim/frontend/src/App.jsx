import { useMemo, useState, useCallback } from 'react';
import Palette from './Palette.jsx';
import CampusMap from './Map.jsx';
import Leaderboard from './Leaderboard.jsx';
import { ITEM_MAP } from './items.js';

export default function App() {
  const [nickname, setNickname] = useState('');
  const [selectedType, setSelectedType] = useState(null);
  const [items, setItems] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handlePlace = useCallback((raw) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, qty: 1, ...raw }]);
  }, []);

  const handleRemove = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const total = useMemo(
    () => items.reduce((s, it) => s + (ITEM_MAP[it.type]?.coeff || 0) * (it.qty || 1), 0),
    [items]
  );

  const handleReset = () => {
    if (items.length && !confirm('모든 배치를 초기화할까요?')) return;
    setItems([]);
  };

  const handleSubmit = async () => {
    if (!nickname.trim()) return showToast('닉네임을 입력하세요');
    if (items.length === 0) return showToast('최소 1개 이상 배치하세요');

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: nickname.trim(),
        items: items.map(({ type, lng, lat, qty }) => ({ type, lng, lat, qty })),
      }),
    });
    if (!res.ok) return showToast('제출 실패');
    const data = await res.json();
    showToast(`🎉 ${data.total_saving.toLocaleString()} kgCO₂ 등록!`);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="app">
      <Palette
        selected={selectedType}
        onSelect={setSelectedType}
        nickname={nickname}
        onNickname={setNickname}
      />

      <div className="map-wrap">
        <CampusMap
          selectedType={selectedType}
          items={items}
          onPlace={handlePlace}
          onRemove={handleRemove}
        />

        <div className="hud">
          <div className="label">연간 CO₂ 절감량</div>
          <div className="total">{total.toLocaleString()} kg</div>
          <div className="count">
            {items.length}개 요소 · {(total / 1000).toFixed(2)} 톤/년
          </div>
        </div>

        <div className="controls">
          <div className="left">
            <button className="danger" onClick={handleReset} disabled={!items.length}>
              초기화
            </button>
          </div>
          <div className="right">
            <button onClick={handleSubmit} disabled={!items.length || !nickname.trim()}>
              리더보드 제출
            </button>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>

      <Leaderboard refreshKey={refreshKey} />
    </div>
  );
}
