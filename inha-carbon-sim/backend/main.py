import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB_PATH = Path(__file__).parent / "leaderboard.db"

COEFFS = {
    "solar": 460,
    "led": 30,
    "ev": 1200,
    "greenroof": 5,
    "tree": 22,
}


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scenarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nickname TEXT NOT NULL,
                total_saving REAL NOT NULL,
                items_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


class Item(BaseModel):
    type: str
    lng: float
    lat: float
    qty: float = 1.0


class Submission(BaseModel):
    nickname: str = Field(min_length=1, max_length=20)
    items: List[Item]


class LeaderboardEntry(BaseModel):
    rank: int
    nickname: str
    total_saving: float
    item_count: int
    created_at: str


app = FastAPI(title="Inha Carbon Sim API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/coeffs")
def get_coeffs():
    return COEFFS


def calc_total(items: List[Item]) -> float:
    total = 0.0
    for it in items:
        if it.type not in COEFFS:
            raise HTTPException(400, f"unknown item type: {it.type}")
        total += COEFFS[it.type] * it.qty
    return round(total, 2)


@app.post("/api/submit")
def submit(payload: Submission):
    if not payload.items:
        raise HTTPException(400, "no items placed")
    total = calc_total(payload.items)
    with db() as conn:
        conn.execute(
            "INSERT INTO scenarios (nickname, total_saving, items_json, created_at) VALUES (?, ?, ?, ?)",
            (
                payload.nickname,
                total,
                json.dumps([it.model_dump() for it in payload.items]),
                datetime.utcnow().isoformat(timespec="seconds"),
            ),
        )
    return {"total_saving": total}


@app.get("/api/leaderboard", response_model=List[LeaderboardEntry])
def leaderboard(limit: int = 20):
    with db() as conn:
        rows = conn.execute(
            "SELECT nickname, total_saving, items_json, created_at FROM scenarios "
            "ORDER BY total_saving DESC LIMIT ?",
            (limit,),
        ).fetchall()
    result = []
    for i, r in enumerate(rows, start=1):
        items = json.loads(r["items_json"])
        result.append(
            LeaderboardEntry(
                rank=i,
                nickname=r["nickname"],
                total_saving=r["total_saving"],
                item_count=len(items),
                created_at=r["created_at"],
            )
        )
    return result
