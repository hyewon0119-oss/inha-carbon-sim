import { useEffect, useState } from 'react';

export default function Leaderboard({ refreshKey }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [refreshKey]);

  const rankClass = (r) => (r === 1 ? 'gold' : r === 2 ? 'silver' : r === 3 ? 'bronze' : '');

  return (
    <aside className="leaderboard">
      <h2>🏆 리더보드</h2>
      {entries.length === 0 && <div className="empty">아직 등록된 시나리오가 없습니다</div>}
      {entries.map((e) => (
        <div key={e.rank + e.nickname + e.created_at} className="entry">
          <div className={'rank ' + rankClass(e.rank)}>#{e.rank}</div>
          <div>
            <div className="nick">{e.nickname}</div>
            <div className="meta">{e.item_count}개 요소 · {e.created_at.slice(0, 10)}</div>
          </div>
          <div className="score">{(e.total_saving / 1000).toFixed(1)}t</div>
        </div>
      ))}
    </aside>
  );
}
