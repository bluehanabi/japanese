"""
SQLite 데이터베이스 초기화 및 초기 데이터 INSERT (v2 - category 컬럼 추가)
"""
import sqlite3
import json
from datetime import date
from kanji_data import KANJI_DATA

DB_PATH = "kanji_flow.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """DB 스키마 생성 및 초기 데이터 삽입"""
    conn = get_db()
    cur = conn.cursor()

    # ── 설정 테이블 ──────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)

    # 기본 설정값
    defaults = [
        ("daily_new_cards",         "10"),
        ("show_reading_on_front",   "0"),
        ("study_mode",              "both"),
        ("active_levels",           "N5,N4"),       # 학습할 JLPT 레벨
        ("active_categories",       "자연,사람,행동,감정,일상,지식"),  # 학습할 카테고리
        ("shuffle_study",           "1"),           # 셔플 학습 여부 (1: 켜짐, 0: 꺼짐)
    ]
    for key, val in defaults:
        cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))

    # ── 카드 테이블 ──────────────────────────────────────
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
            category     TEXT NOT NULL DEFAULT '일반'
        )
    """)

    # ── SRS 복습 현황 ──────────────────────────────────
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

    # ── 복습 이력 (히트맵용) ──────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS review_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id     INTEGER NOT NULL,
            reviewed_at TEXT    NOT NULL,
            quality     INTEGER NOT NULL
        )
    """)

    conn.commit()

    # ── 초기 카드 데이터 삽입 ────────────────────────────
    existing = cur.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
    if existing == 0:
        _insert_initial_cards(conn, cur)
        conn.commit()
        print("[DB] 초기 카드 데이터 삽입 완료")
    else:
        print(f"[DB] 기존 카드 {existing}개 확인")

    conn.close()


def _insert_initial_cards(conn, cur):
    """한자 카드 + 단어 카드 각각 삽입 (B안: 독립 카드)"""
    today = date.today().isoformat()

    for item in KANJI_DATA:
        kanji    = item["kanji"]
        level    = item["grade"]
        category = item.get("category", "일반")

        # 1) 한자 카드
        reading   = f"음독: {item['onyomi']} / 훈독: {item['kunyomi']}"
        words_json = json.dumps(item["words"], ensure_ascii=False)
        cur.execute("""
            INSERT INTO cards (type, kanji, front, back_meaning, back_reading, extra_info, jlpt_level, category)
            VALUES ('kanji', ?, ?, ?, ?, ?, ?, ?)
        """, (kanji, kanji, item["meaning"], reading, words_json, level, category))
        kanji_card_id = cur.lastrowid
        cur.execute("INSERT INTO reviews (card_id, next_review) VALUES (?, ?)", (kanji_card_id, today))

        # 2) 파생 단어 카드 (각각 독립)
        for w in item["words"]:
            parent_info = json.dumps(
                {"parent_kanji": kanji, "parent_meaning": item["meaning"]},
                ensure_ascii=False
            )
            cur.execute("""
                INSERT INTO cards (type, kanji, front, back_meaning, back_reading, extra_info, jlpt_level, category)
                VALUES ('word', ?, ?, ?, ?, ?, ?, ?)
            """, (kanji, w["word"], w["meaning"], w["reading"], parent_info, level, category))
            word_card_id = cur.lastrowid
            cur.execute("INSERT INTO reviews (card_id, next_review) VALUES (?, ?)", (word_card_id, today))


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
    import os
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print("[DB] 기존 DB 삭제 후 재생성")
    init_db()
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
    by_level = conn.execute("SELECT jlpt_level, COUNT(*) FROM cards GROUP BY jlpt_level ORDER BY jlpt_level").fetchall()
    conn.close()
    print(f"\n총 카드: {total}개")
    for row in by_level:
        print(f"  {row[0]}: {row[1]}개")
