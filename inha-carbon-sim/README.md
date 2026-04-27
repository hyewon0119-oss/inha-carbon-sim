# Inha Carbon Sim

인하대학교 캠퍼스 3D 탄소중립 시뮬레이터.
Mapbox 3D 건물 위에 태양광/LED/EV 충전소/그린루프/수목을 배치해
연간 CO₂ 절감량을 계산하고 리더보드로 경쟁합니다.

## 구조
- `frontend/` — React + Vite + Mapbox GL JS
- `backend/` — FastAPI + SQLite

## 실행

### 백엔드
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 프론트엔드
```bash
cd frontend
npm install
npm run dev
```

> **Mapbox 토큰 불필요** — 기본적으로 [OpenFreeMap](https://openfreemap.org/) 무료 벡터 타일을 사용합니다.
>
> Mapbox 스타일을 쓰고 싶다면 `.env` 파일을 만들고 `VITE_MAPBOX_TOKEN=pk.xxx` 추가.

http://localhost:5173 접속.

## 배치 요소 & 절감 계수 (kgCO₂/년)
| 요소 | 단위 | 절감량 |
|---|---|---|
| 태양광 패널 | 1 kW | 460 |
| LED 조명 | 1 개 | 30 |
| EV 충전소 | 1 기 | 1,200 |
| 그린루프 | 1 ㎡ | 5 |
| 수목 | 1 그루 | 22 |
