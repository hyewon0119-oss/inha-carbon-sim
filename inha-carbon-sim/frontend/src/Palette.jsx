import { ITEM_TYPES, GROUPS } from './items.js';

export default function Palette({ selected, onSelect, nickname, onNickname }) {
  return (
    <aside className="sidebar">
      <h2>🌱 Inha Carbon Sim</h2>
      <p style={{ fontSize: 11, color: '#8b949e', margin: '0 0 12px' }}>
        인하대학교 캠퍼스 탄소중립 시뮬레이터
      </p>

      <h3>닉네임</h3>
      <input
        type="text"
        placeholder="닉네임 입력"
        value={nickname}
        maxLength={20}
        onChange={(e) => onNickname(e.target.value)}
      />

      {GROUPS.map((group) => (
        <div key={group}>
          <h3>{group}</h3>
          {ITEM_TYPES.filter((it) => it.group === group).map((it) => (
            <div
              key={it.id}
              className={
                'palette-item' +
                (selected === it.id ? ' active' : '') +
                (it.coeff === 0 ? ' disabled' : '')
              }
              onClick={() => onSelect(selected === it.id ? null : it.id)}
            >
              <div className="icon">{it.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="label">{it.label}</div>
                <div className="coeff">
                  {it.coeff === 0
                    ? '⚠ 절감효과 0 (대학 귀속 불가)'
                    : `${it.coeff.toLocaleString()} kgCO₂/년 · ${it.unit}`}
                </div>
                <div className="item-desc">{it.desc}</div>
              </div>
            </div>
          ))}
        </div>
      ))}

      <h3>사용법</h3>
      <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.6 }}>
        1. 닉네임 입력<br />
        2. 좌측에서 요소 선택<br />
        3. 지도 클릭으로 배치<br />
        4. 하단 "제출"로 리더보드 등록<br />
        <br />
        우클릭 또는 Shift+클릭 = 삭제
      </div>
    </aside>
  );
}
