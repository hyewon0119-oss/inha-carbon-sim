import { useMemo, useState, useCallback } from 'react';
import Palette from './Palette.jsx';
import CampusMap from './Map.jsx';
import Leaderboard from './Leaderboard.jsx';
import { ITEM_MAP } from './items.js';
import { checkPlacement } from './zones.js';
import { calculateRealistic } from './penalties.js';

export default function App() {
  const [nickname, setNickname] = useState('');
  const [selectedType, setSelectedType] = useState(null);
  const [items, setItems] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === 'error' ? 4000 : 2500);
  };

  const handlePlace = useCallback((raw) => {
    const result = checkPlacement(raw.type, raw.lng, raw.lat);

    if (!result.allowed) {
      const zoneName = result.zone ? `[${result.zone.name}] ` : '';
      showToast(`${zoneName}${result.reason}`, 'error');
      return;
    }

    const penalty = result.penalty || 1;
    const meta = ITEM_MAP[raw.type];
    const effectiveCoeff = Math.round(meta.coeff * penalty);

    const id = crypto.randomUUID();
    setItems((prev) => [...prev, {
      id,
      qty: 1,
      ...raw,
      effectiveCoeff,
      zoneName: result.zone?.name || '일반 구역',
      zoneReason: result.reason,
    }]);

    if (result.zone) {
      const penaltyNote =
        penalty < 1 ? ` (효율 ${Math.round(penalty * 100)}%)` :
        penalty > 1 ? ` (보너스 +${Math.round((penalty - 1) * 100)}%)` : '';
      showToast(`[${result.zone.name}] ${result.reason}${penaltyNote}`);
    }
  }, []);

  const handleRemove = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  // 현실적 계산 엔진
  const calc = useMemo(() => calculateRealistic(items), [items]);

  const handleReset = () => {
    if (items.length && !confirm('모든 배치를 초기화할까요?')) return;
    setItems([]);
  };

  const handleSubmit = async () => {
    if (!nickname.trim()) return showToast('닉네임을 입력하세요', 'error');
    if (items.length === 0) return showToast('최소 1개 이상 배치하세요', 'error');

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: nickname.trim(),
        items: items.map(({ type, lng, lat, qty }) => ({ type, lng, lat, qty })),
      }),
    });
    if (!res.ok) return showToast('제출 실패', 'error');
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

        {/* 메인 HUD */}
        <div className="hud">
          <div className="hud-label">순 CO₂ 절감량 (연간)</div>
          <div className={'hud-total ' + (calc.netSaving < 0 ? 'negative' : '')}>
            {calc.netSaving.toLocaleString()} kg
          </div>
          <div className="hud-sub">
            {items.length}개 요소 · {(calc.netSaving / 1000).toFixed(2)} 톤/년
          </div>

          {/* 간이 분석 바 */}
          <div className="hud-breakdown">
            <div className="bar-row">
              <span className="bar-label">총 절감</span>
              <span className="bar-value positive">+{calc.grossSaving.toLocaleString()}</span>
            </div>
            {calc.embodiedPenalty > 0 && (
              <div className="bar-row">
                <span className="bar-label">설치 탄소</span>
                <span className="bar-value negative">-{calc.embodiedPenalty.toLocaleString()}</span>
              </div>
            )}
            {calc.diminishingPenalty > 0 && (
              <div className="bar-row">
                <span className="bar-label">수확 체감</span>
                <span className="bar-value negative">-{calc.diminishingPenalty.toLocaleString()}</span>
              </div>
            )}
            {calc.synergyPenalty > 0 && (
              <div className="bar-row">
                <span className="bar-label">부정 상호작용</span>
                <span className="bar-value negative">-{calc.synergyPenalty.toLocaleString()}</span>
              </div>
            )}
            {calc.synergyBonus > 0 && (
              <div className="bar-row">
                <span className="bar-label">긍정 시너지</span>
                <span className="bar-value positive">+{calc.synergyBonus.toLocaleString()}</span>
              </div>
            )}
          </div>

          {(calc.details.length > 0 || calc.warnings.length > 0) && (
            <button
              className="detail-toggle"
              onClick={() => setShowDetail(!showDetail)}
            >
              {showDetail ? '▲ 상세 닫기' : '▼ 상세 분석 보기'} ({calc.details.length + calc.warnings.length})
            </button>
          )}
        </div>

        {/* 상세 분석 패널 */}
        {showDetail && (calc.details.length > 0 || calc.warnings.length > 0) && (
          <div className="detail-panel">
            {calc.warnings.map((w, i) => (
              <div key={'w' + i} className="detail-warn">{w}</div>
            ))}
            {calc.details.map((d, i) => (
              <div key={'d' + i} className="detail-item">{d}</div>
            ))}
          </div>
        )}

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

        {toast && <div className={'toast ' + (toast.type === 'error' ? 'toast-error' : '')}>{toast.msg}</div>}
      </div>

      <Leaderboard refreshKey={refreshKey} />
    </div>
  );
}
