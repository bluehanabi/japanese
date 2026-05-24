"""
SQLite 데이터베이스 초기화 및 초기 데이터 INSERT
데이터 출처: anki_cards.json (JLPT 어휘/한자/문법 통합 덱)
"""
import sqlite3
import json
import os
from datetime import date

DB_PATH = "kanji_flow.db"
DATA_FILE = os.path.join(os.path.dirname(__file__), "anki_cards.json")
# 데이터 버전 — 이 값이 바뀌면 배포 시 카드 DB를 자동으로 재생성한다.
DATA_VERSION = "anki-jlpt-2025-09c"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _create_schema(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cards (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            type         TEXT NOT NULL,
            kanji        TEXT NOT NULL,
            front        TEXT NOT NULL,
            back_meaning TEXT NOT NULL,
            back_reading TEXT NOT NULL,
            extra_info   TEXT,
            jlpt_level   TEXT NOT NULL,
            category     TEXT NOT NULL DEFAULT '일반',
            sub_level    TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS reviews (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id       INTEGER NOT NULL REFERENCES cards(id),
            ease_factor   REAL    NOT NULL DEFAULT 2.5,
            interval      INTEGER NOT NULL DEFAULT 0,
            repetitions   INTEGER NOT NULL DEFAULT 0,
            next_review   TEXT    NOT NULL DEFAULT '1970-01-01',
            last_quality  INTEGER,
            total_reviews INTEGER NOT NULL DEFAULT 0,
            correct_count INTEGER NOT NULL DEFAULT 0
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS review_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id     INTEGER NOT NULL,
            reviewed_at TEXT    NOT NULL,
            quality     INTEGER NOT NULL
        )
    """)


def init_db():
    """스키마 생성 + (데이터 버전이 바뀌었으면) 카드 재생성."""
    conn = get_db()
    cur = conn.cursor()
    _create_schema(cur)

    # 기본 설정값 (없을 때만)
    defaults = [
        ("daily_new_cards",       "10"),
        ("show_reading_on_front", "0"),
        ("study_mode",            "both"),
        ("active_levels",         "N5,N4"),
        ("active_kanken",         "10급,9급,8급,7급"),   # 학습할 한자 漢検 급수
        ("shuffle_study",         "1"),
    ]
    for key, val in defaults:
        cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))
    conn.commit()

    cur_ver = cur.execute("SELECT value FROM settings WHERE key='data_version'").fetchone()
    cur_ver = cur_ver["value"] if cur_ver else None
    card_count = cur.execute("SELECT COUNT(*) FROM cards").fetchone()[0]

    if cur_ver != DATA_VERSION or card_count == 0:
        print(f"[DB] 데이터 버전 변경 감지 ({cur_ver} -> {DATA_VERSION}) — 카드 재생성")
        # 컬럼이 추가됐을 수 있으니 DROP 후 현재 스키마로 재생성 (DELETE 만으론 새 컬럼이 안 생김)
        cur.execute("DROP TABLE IF EXISTS review_log")
        cur.execute("DROP TABLE IF EXISTS reviews")
        cur.execute("DROP TABLE IF EXISTS cards")
        _create_schema(cur)
        cats = _insert_from_json(conn, cur)
        # 새 데이터에 맞춰 카테고리 설정 재지정 (전체 활성화)
        cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_categories', ?)",
                    (",".join(cats),))
        cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('data_version', ?)",
                    (DATA_VERSION,))
        conn.commit()
        print(f"[DB] 카드 {cur.execute('SELECT COUNT(*) FROM cards').fetchone()[0]}개 삽입 완료")
    else:
        print(f"[DB] 기존 카드 {card_count}개 확인 (버전 {cur_ver})")

    conn.close()


def _insert_from_json(conn, cur):
    """anki_cards.json 의 카드를 cards/reviews 테이블에 삽입. 카테고리 목록 반환."""
    today = date.today().isoformat()
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    cats = []
    for c in data["cards"]:
        cur.execute("""
            INSERT INTO cards (type, kanji, front, back_meaning, back_reading, extra_info, jlpt_level, category, sub_level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (c["type"], c.get("kanji", c["front"]), c["front"], c["back_meaning"],
              c.get("back_reading", ""), c.get("extra_info"), c["jlpt_level"], c.get("category", "일반"),
              c.get("sub_level")))
        cur.execute("INSERT INTO reviews (card_id, next_review) VALUES (?, ?)", (cur.lastrowid, today))
        cat = c.get("category", "일반")
        if cat not in cats:
            cats.append(cat)
    return cats


def get_setting(key: str, default: str = None) -> str:
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else default


def set_setting(key: str, value: str):
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()
    conn.close()


if __name__ == "__main__":
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print("[DB] 기존 DB 삭제 후 재생성")
    init_db()
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
    by_type = conn.execute("SELECT type, COUNT(*) FROM cards GROUP BY type").fetchall()
    by_level = conn.execute("SELECT jlpt_level, COUNT(*) FROM cards GROUP BY jlpt_level ORDER BY jlpt_level").fetchall()
    conn.close()
    print(f"\n총 카드: {total}개")
    print("타입별:", {r[0]: r[1] for r in by_type})
    print("레벨별:", {r[0]: r[1] for r in by_level})
