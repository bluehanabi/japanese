"""
SQLite 데이터베이스 초기화 및 초기 데이터 INSERT
데이터 출처: anki_cards.json (JLPT 어휘/한자/문법 통합 덱)
"""
import sqlite3
import json
import os
from datetime import date, datetime
from glob import glob

DB_PATH = "kanji_flow.db"
BACKUP_DIR = "backups"
BACKUP_KEEP = 14   # 최근 N개 백업만 보관
DATA_FILE = os.path.join(os.path.dirname(__file__), "anki_cards.json")
# 데이터 버전 — 이 값이 바뀌면 배포 시 카드 DB를 자동으로 재생성한다.
DATA_VERSION = "anki-jlpt-2025-09d"  # 문법 분류 라벨 22개 제거


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

    # AI 설명 캐시 (실시간 생성분을 저장 = 백데이터, 카드 재생성에도 유지되도록 type:front 키)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ai_cache (
            card_key   TEXT PRIMARY KEY,
            content    TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # 학습 세션 기록 (세션 종료 시 저장 = 백데이터)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS session_log (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            ended_at  TEXT NOT NULL,
            studied   INTEGER NOT NULL,
            correct   INTEGER NOT NULL,
            accuracy  REAL    NOT NULL,
            summary   TEXT
        )
    """)

    # 문장 연습 캐시 (미리 생성해 두면 즉시 출제 = 백데이터)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sentence_cache (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            jp         TEXT NOT NULL,
            jp_tiles   TEXT NOT NULL,
            kr         TEXT NOT NULL,
            kr_tiles   TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # 저장한 가사 (제목 + 원문 + 추출 결과)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS saved_lyrics (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL,
            text       TEXT NOT NULL,
            data       TEXT,
            created_at TEXT NOT NULL
        )
    """)

    # 번역 기록 (원문 + 결과, 60일 보관)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS translation_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            source     TEXT NOT NULL,
            result     TEXT NOT NULL,
            created_at TEXT NOT NULL
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
        ("study_order",           "jlpt"),   # jlpt(현재) | frequency(실사용 빈도순)
        ("gemini_api_key",        ""),
        ("gemini_model",          "gemini-3.5-flash"),
    ]
    for key, val in defaults:
        cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))
    conn.commit()

    cur_ver = cur.execute("SELECT value FROM settings WHERE key='data_version'").fetchone()
    cur_ver = cur_ver["value"] if cur_ver else None
    card_count = cur.execute("SELECT COUNT(*) FROM cards").fetchone()[0]

    if cur_ver != DATA_VERSION or card_count == 0:
        print(f"[DB] 데이터 버전 변경 감지 ({cur_ver} -> {DATA_VERSION}) — 카드 재생성")

        # 1) 기존 학습 진도 백업 (종류+표제어 기준) — 카드 데이터가 바뀌어도 진도 보존
        progress = {}
        try:
            for r in cur.execute("""
                SELECT c.type AS t, c.front AS f, r.ease_factor, r.interval, r.repetitions,
                       r.next_review, r.last_quality, r.total_reviews, r.correct_count
                FROM reviews r JOIN cards c ON c.id = r.card_id
                WHERE r.total_reviews > 0 OR r.repetitions > 0
            """):
                progress[(r["t"], r["f"])] = dict(r)
        except sqlite3.OperationalError:
            pass  # 아주 예전 스키마면 백업 생략

        # 2) 카드/복습 테이블만 재생성 (review_log = 히트맵·연속일 기록은 보존)
        cur.execute("DROP TABLE IF EXISTS reviews")
        cur.execute("DROP TABLE IF EXISTS cards")
        _create_schema(cur)
        cats = _insert_from_json(conn, cur)

        # 3) 진도 복원 (여전히 존재하는 카드에 한해)
        restored = 0
        for (typ, front), pr in progress.items():
            row = cur.execute("SELECT id FROM cards WHERE type = ? AND front = ?", (typ, front)).fetchone()
            if row:
                cur.execute("""
                    UPDATE reviews SET ease_factor=?, interval=?, repetitions=?,
                        next_review=?, last_quality=?, total_reviews=?, correct_count=?
                    WHERE card_id=?
                """, (pr["ease_factor"], pr["interval"], pr["repetitions"], pr["next_review"],
                      pr["last_quality"], pr["total_reviews"], pr["correct_count"], row["id"]))
                restored += 1

        # 새 데이터에 맞춰 카테고리 설정 재지정 (전체 활성화)
        cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_categories', ?)",
                    (",".join(cats),))
        cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('data_version', ?)",
                    (DATA_VERSION,))
        conn.commit()
        print(f"[DB] 카드 {cur.execute('SELECT COUNT(*) FROM cards').fetchone()[0]}개 삽입, 진도 {restored}개 복원")
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


def backup_db():
    """DB를 일관된 스냅샷으로 backups/ 에 저장하고, 최근 N개만 남긴다. 저장 경로 반환."""
    if not os.path.exists(DB_PATH):
        return None
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    dst_path = os.path.join(BACKUP_DIR, f"kanji_flow-{ts}.db")
    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(dst_path)
    try:
        with dst:
            src.backup(dst)   # WAL 포함 일관된 온라인 백업
    finally:
        dst.close()
        src.close()
    # 오래된 백업 정리
    files = sorted(glob(os.path.join(BACKUP_DIR, "kanji_flow-*.db")))
    for f in files[:-BACKUP_KEEP]:
        try:
            os.remove(f)
        except OSError:
            pass
    return dst_path


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
