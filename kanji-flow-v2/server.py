"""
Kanji Flow 2.0 - Flask 백엔드 서버
포트 8005로 실행
"""
import json
import re
import random
from datetime import date, timedelta
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from database import get_db, init_db, get_setting, set_setting
from srs import calculate_next_review, QUALITY_MAP, get_card_state, predict_interval

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)


@app.after_request
def no_cache_assets(resp):
    """HTML/JS/CSS는 캐시하지 않게 해서 배포 후 항상 최신본이 보이도록 함."""
    if request.path == "/" or request.path.endswith((".html", ".js", ".css")):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp

# ══════════════════════════════════════════════════════════
#  정적 파일 서빙
# ══════════════════════════════════════════════════════════

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ══════════════════════════════════════════════════════════
#  API: 오늘의 학습
# ══════════════════════════════════════════════════════════

@app.route("/api/today")
def get_today_cards():
    """오늘 복습 예정 카드 + 새 카드 반환 (설정 및 셔플 연동)"""
    today = date.today().isoformat()
    extra = request.args.get("extra") == "1"   # 추가 학습 모드 (오늘 목표 초과)
    study_mode = get_setting("study_mode", "both")
    daily_new = int(get_setting("daily_new_cards", "10"))

    active_levels_str = get_setting("active_levels", "N5,N4")
    active_categories_str = get_setting("active_categories", "자연,사람,행동,감정,일상,지식")
    shuffle_study = get_setting("shuffle_study", "1")

    # 콤마 기준 파싱 및 정제
    levels = [l.strip() for l in active_levels_str.split(",") if l.strip()]
    categories = [c.strip() for c in active_categories_str.split(",") if c.strip()]

    # 빈 리스트 대비 기본값
    if not levels: levels = ["N5", "N4", "N3", "N2", "N1"]
    if not categories: categories = ["한자", "명사", "동사", "형용사", "부사", "기타", "문법"]

    conn = get_db()

    # 오늘 이미 복습한 신규 카드 수 확인
    new_done_today = conn.execute("""
        SELECT COUNT(DISTINCT rl.card_id) FROM review_log rl
        JOIN cards c ON c.id = rl.card_id
        WHERE rl.reviewed_at = ? AND (SELECT repetitions FROM reviews WHERE card_id = c.id) = 1
    """, (today,)).fetchone()[0]

    # 추가 학습 모드면 오늘 한 개수와 무관하게 새 카드 한 묶음을 더 제공
    remaining_new = daily_new if extra else max(0, daily_new - new_done_today)

    # 모드 필터
    type_filter = ""
    if study_mode == "kanji_only":
        type_filter = "AND c.type = 'kanji'"
    elif study_mode == "word_only":
        type_filter = "AND c.type = 'word'"
    elif study_mode == "grammar_only":
        type_filter = "AND c.type = 'grammar'"

    # 등급 & 카테고리 동적 조건 생성을 위해 플레이스홀더 준비
    level_placeholders = ",".join(["?"] * len(levels))
    category_placeholders = ",".join(["?"] * len(categories))

    # 복습 카드
    #  - 일반 학습: 오늘 복습 예정(next_review <= 오늘)인 카드만
    #  - 추가 학습: 진행 중(학습 중) 카드 전체에서 무작위 (예정일 무관) → '학습중 + @'
    if extra:
        # 추가 학습: 진행 중(학습 중) 카드 무작위로 설정 개수만큼
        review_cards = conn.execute(f"""
            SELECT c.*, r.ease_factor, r.interval, r.repetitions,
                   r.next_review, r.total_reviews, r.correct_count, r.id as review_id
            FROM cards c
            JOIN reviews r ON r.card_id = c.id
            WHERE r.repetitions > 0
            AND c.jlpt_level IN ({level_placeholders})
            AND c.category IN ({category_placeholders})
            {type_filter}
            ORDER BY RANDOM()
            LIMIT ?
        """, levels + categories + [daily_new]).fetchall()
    else:
        review_cards = conn.execute(f"""
            SELECT c.*, r.ease_factor, r.interval, r.repetitions,
                   r.next_review, r.total_reviews, r.correct_count, r.id as review_id
            FROM cards c
            JOIN reviews r ON r.card_id = c.id
            WHERE r.next_review <= ? AND r.repetitions > 0
            AND c.jlpt_level IN ({level_placeholders})
            AND c.category IN ({category_placeholders})
            {type_filter}
            ORDER BY r.next_review ASC
        """, [today] + levels + categories).fetchall()

    # 신규 카드 (한 번도 안 본 것, 오늘 개수 제한)
    query_params_new = levels + categories + [remaining_new]
    new_cards = conn.execute(f"""
        SELECT c.*, r.ease_factor, r.interval, r.repetitions,
               r.next_review, r.total_reviews, r.correct_count, r.id as review_id
        FROM cards c
        JOIN reviews r ON r.card_id = c.id
        WHERE r.repetitions = 0
        AND c.jlpt_level IN ({level_placeholders})
        AND c.category IN ({category_placeholders})
        {type_filter}
        ORDER BY c.jlpt_level DESC, c.type ASC, c.id ASC
        LIMIT ?
    """, query_params_new).fetchall()

    conn.close()

    def row_to_dict(row):
        d = dict(row)
        if d.get("extra_info"):
            try:
                d["extra_info"] = json.loads(d["extra_info"])
            except:
                pass
        d["state"] = get_card_state(d["repetitions"], d["interval"])
        rep, ef, iv = d["repetitions"], d["ease_factor"], d["interval"]
        d["hints"] = {
            a: predict_interval(rep, ef, iv, a)
            for a in ("again", "hard", "good", "easy")
        }
        return d

    review_list = [row_to_dict(r) for r in review_cards]
    new_list = [row_to_dict(r) for r in new_cards]

    if extra:
        # 추가 학습: 설정 개수(daily_new)만큼, 학습 중 카드를 우선 채우고
        # 모자라면 신규로 채운 뒤, 전부 한데 섞어서 출제
        queue = review_list[:daily_new]
        if len(queue) < daily_new:
            queue += new_list[:daily_new - len(queue)]
        random.shuffle(queue)
        review_list, new_list = queue, []
    elif shuffle_study == "1":
        # 일반 학습: 복습/신규를 개별적으로 섞음 (복습 우선 순서 유지)
        random.shuffle(review_list)
        random.shuffle(new_list)

    return jsonify({
        "today": today,
        "review_cards": review_list,
        "new_cards": new_list,
        "review_count": len(review_list),
        "new_count": len(new_list),
        "total_due": len(review_list) + len(new_list),
    })


@app.route("/api/review", methods=["POST"])
def submit_review():
    """복습 결과 제출 및 SRS 업데이트"""
    data = request.get_json()
    card_id = data.get("card_id")
    answer = data.get("answer")  # 'again' / 'hard' / 'good' / 'easy'
    today = date.today().isoformat()

    quality = QUALITY_MAP.get(answer, 0)

    conn = get_db()
    row = conn.execute(
        "SELECT * FROM reviews WHERE card_id = ?", (card_id,)
    ).fetchone()

    if not row:
        conn.close()
        return jsonify({"error": "카드를 찾을 수 없습니다"}), 404

    new_interval, new_ef, new_reps, next_review = calculate_next_review(
        row["repetitions"], row["ease_factor"], row["interval"], quality
    )

    correct = 1 if quality >= 4 else 0

    conn.execute("""
        UPDATE reviews
        SET ease_factor = ?, interval = ?, repetitions = ?,
            next_review = ?, last_quality = ?,
            total_reviews = total_reviews + 1,
            correct_count = correct_count + ?
        WHERE card_id = ?
    """, (new_ef, new_interval, new_reps, next_review, quality, correct, card_id))

    conn.execute("""
        INSERT INTO review_log (card_id, reviewed_at, quality)
        VALUES (?, ?, ?)
    """, (card_id, today, quality))

    conn.commit()
    conn.close()

    return jsonify({
        "next_review": next_review,
        "interval": new_interval,
        "ease_factor": new_ef,
        "repetitions": new_reps,
        "state": get_card_state(new_reps, new_interval),
    })


# ══════════════════════════════════════════════════════════
#  API: 통계
# ══════════════════════════════════════════════════════════

@app.route("/api/stats")
def get_stats():
    """전체 학습 통계 반환"""
    today = date.today().isoformat()
    conn = get_db()

    total = conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
    new_cnt = conn.execute("SELECT COUNT(*) FROM reviews WHERE repetitions = 0").fetchone()[0]
    learning = conn.execute(
        "SELECT COUNT(*) FROM reviews WHERE repetitions > 0 AND interval < 21"
    ).fetchone()[0]
    mastered = conn.execute(
        "SELECT COUNT(*) FROM reviews WHERE interval >= 21"
    ).fetchone()[0]

    due_today = conn.execute(
        "SELECT COUNT(*) FROM reviews WHERE next_review <= ? AND repetitions > 0", (today,)
    ).fetchone()[0]

    today_done = conn.execute(
        "SELECT COUNT(*) FROM review_log WHERE reviewed_at = ?", (today,)
    ).fetchone()[0]

    today_correct = conn.execute(
        "SELECT COUNT(*) FROM review_log WHERE reviewed_at = ? AND quality >= 3", (today,)
    ).fetchone()[0]

    # 연속 학습 일수 계산
    streak = _calc_streak(conn)

    # 히트맵 데이터 (최근 365일)
    heatmap = conn.execute("""
        SELECT reviewed_at, COUNT(*) as count
        FROM review_log
        WHERE reviewed_at >= date('now', '-365 days')
        GROUP BY reviewed_at
        ORDER BY reviewed_at
    """).fetchall()

    # 취약 카드 TOP 10 (정답률 낮은 순)
    weak_cards = conn.execute("""
        SELECT c.front, c.back_meaning, c.type, r.total_reviews,
               r.correct_count,
               CAST(r.correct_count AS REAL) / MAX(r.total_reviews, 1) as accuracy
        FROM cards c JOIN reviews r ON r.card_id = c.id
        WHERE r.total_reviews >= 3
        ORDER BY accuracy ASC
        LIMIT 10
    """).fetchall()

    conn.close()

    return jsonify({
        "total_cards": total,
        "new": new_cnt,
        "learning": learning,
        "mastered": mastered,
        "due_today": due_today,
        "today_reviewed": today_done,
        "today_correct": today_correct,
        "today_accuracy": round(today_correct / max(today_done, 1) * 100, 1),
        "streak": streak,
        "heatmap": [{"date": r["reviewed_at"], "count": r["count"]} for r in heatmap],
        "weak_cards": [dict(r) for r in weak_cards],
    })


def _calc_streak(conn) -> int:
    """연속 학습 일수 계산"""
    rows = conn.execute("""
        SELECT DISTINCT reviewed_at FROM review_log
        ORDER BY reviewed_at DESC
    """).fetchall()

    if not rows:
        return 0

    streak = 0
    check = date.today()
    for row in rows:
        d = date.fromisoformat(row["reviewed_at"])
        if d == check:
            streak += 1
            check -= timedelta(days=1)
        elif d == check + timedelta(days=1):
            # 오늘 아직 안 했지만 어제부터 연속인 경우
            check = d - timedelta(days=1)
            streak += 1
        else:
            break
    return streak


# ══════════════════════════════════════════════════════════
#  API: 전체 카드 목록 / 검색
# ══════════════════════════════════════════════════════════

@app.route("/api/cards")
def get_all_cards():
    """전체 카드 목록 (타입, JLPT 레벨 필터 가능)"""
    card_type = request.args.get("type")   # 'kanji' / 'word' / 'grammar'
    level = request.args.get("level")      # 'N5' ~ 'N1'
    state = request.args.get("state")      # 'new' / 'learning' / 'mastered'
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 50))
    offset = (page - 1) * per_page

    conn = get_db()
    params = []
    where = []

    if card_type:
        where.append("c.type = ?")
        params.append(card_type)
    if level:
        where.append("c.jlpt_level = ?")
        params.append(level)
    if state == "new":
        where.append("r.repetitions = 0")
    elif state == "learning":
        where.append("r.repetitions > 0 AND r.interval < 21")
    elif state == "mastered":
        where.append("r.interval >= 21")

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    rows = conn.execute(f"""
        SELECT c.*, r.repetitions, r.interval, r.ease_factor, r.next_review,
               r.total_reviews, r.correct_count
        FROM cards c JOIN reviews r ON r.card_id = c.id
        {where_sql}
        ORDER BY c.jlpt_level DESC, c.type ASC, c.id ASC
        LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()

    total = conn.execute(f"""
        SELECT COUNT(*) FROM cards c JOIN reviews r ON r.card_id = c.id {where_sql}
    """, params).fetchone()[0]

    conn.close()

    def to_dict(row):
        d = dict(row)
        if d.get("extra_info"):
            d["extra_info"] = json.loads(d["extra_info"])
        d["state"] = get_card_state(d["repetitions"], d["interval"])
        return d

    return jsonify({
        "cards": [to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    })


@app.route("/api/search")
def search_cards():
    """한자/단어 검색"""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"results": []})

    conn = get_db()
    rows = conn.execute("""
        SELECT c.*, r.repetitions, r.interval, r.total_reviews, r.correct_count
        FROM cards c JOIN reviews r ON r.card_id = c.id
        WHERE c.front LIKE ? OR c.back_meaning LIKE ? OR c.back_reading LIKE ?
        LIMIT 20
    """, (f"%{q}%", f"%{q}%", f"%{q}%")).fetchall()
    conn.close()

    def to_dict(row):
        d = dict(row)
        if d.get("extra_info"):
            d["extra_info"] = json.loads(d["extra_info"])
        d["state"] = get_card_state(d["repetitions"], d["interval"])
        return d

    return jsonify({"results": [to_dict(r) for r in rows]})


# ══════════════════════════════════════════════════════════
#  API: 랜덤 사지선다 퀴즈
# ══════════════════════════════════════════════════════════

@app.route("/api/quiz")
def build_quiz():
    """사지선다 퀴즈 문제 묶음 생성.

    쿼리 파라미터:
      n      : 문제 수 (기본 15)
      level  : 특정 JLPT 등급만 (예: N5) — 선택
      type   : 'kanji' | 'word' — 선택
      ids    : 콤마로 구분된 카드 id (가사 퀴즈 등 특정 카드 한정) — 선택
    """
    n = max(1, min(50, int(request.args.get("n", 15))))
    level = request.args.get("level")
    ctype = request.args.get("type")
    ids = request.args.get("ids", "").strip()

    conn = get_db()
    pool = conn.execute("SELECT id, type, front, back_meaning, back_reading, jlpt_level FROM cards").fetchall()
    conn.close()
    pool = [dict(r) for r in pool]

    # 출제 대상 선정
    if ids:
        id_set = {int(x) for x in ids.split(",") if x.strip().isdigit()}
        targets = [c for c in pool if c["id"] in id_set]
    else:
        targets = pool
        if level:
            targets = [c for c in targets if c["jlpt_level"] == level]
        if ctype:
            targets = [c for c in targets if c["type"] == ctype]

    if not targets:
        return jsonify({"questions": [], "available": 0})

    random.shuffle(targets)
    chosen = targets[:n]

    # 보기(distractor) 풀
    meanings = list({c["back_meaning"] for c in pool})
    fronts = list({c["front"] for c in pool})
    readings = list({c["back_reading"] for c in pool if c["type"] == "word"})

    def sample_distractors(source, answer, k=3):
        cand = [x for x in source if x != answer]
        random.shuffle(cand)
        return cand[:k]

    questions = []
    for c in chosen:
        directions = ["front2meaning", "meaning2front"]
        if c["type"] == "word" and c["back_reading"]:
            directions.append("front2reading")
        direction = random.choice(directions)

        if direction == "front2meaning":
            prompt, answer, source = c["front"], c["back_meaning"], meanings
        elif direction == "meaning2front":
            prompt, answer, source = c["back_meaning"], c["front"], fronts
        else:
            prompt, answer, source = c["front"], c["back_reading"], readings

        distractors = sample_distractors(source, answer, 3)
        if len(distractors) < 3:
            continue  # 보기 부족하면 건너뜀
        options = distractors + [answer]
        random.shuffle(options)

        questions.append({
            "card_id": c["id"],
            "type": c["type"],
            "level": c["jlpt_level"],
            "direction": direction,
            "prompt": prompt,
            "answer": answer,
            "options": options,
            # 정답 공개 후 보여줄 전체 정보 (한자/단어 · 읽기 · 뜻)
            "info": {
                "front": c["front"],
                "reading": c["back_reading"],
                "meaning": c["back_meaning"],
            },
        })

    return jsonify({"questions": questions, "available": len(targets)})


# ══════════════════════════════════════════════════════════
#  API: 가사 분석
# ══════════════════════════════════════════════════════════

@app.route("/api/lyrics/analyze", methods=["POST"])
def analyze_lyrics():
    """가사 텍스트에서 한자 추출 및 DB 매핑"""
    data = request.get_json()
    text = data.get("text", "")

    # 한자 범위: CJK Unified Ideographs
    kanji_chars = list(dict.fromkeys(
        ch for ch in text if '\u4e00' <= ch <= '\u9faf'
    ))

    conn = get_db()
    results = []
    for ch in kanji_chars:
        row = conn.execute("""
            SELECT c.*, r.repetitions, r.interval
            FROM cards c JOIN reviews r ON r.card_id = c.id
            WHERE c.type = 'kanji' AND c.front = ?
        """, (ch,)).fetchone()
        if row:
            d = dict(row)
            if d.get("extra_info"):
                d["extra_info"] = json.loads(d["extra_info"])
            d["state"] = get_card_state(d["repetitions"], d["interval"])
            results.append(d)

    conn.close()
    return jsonify({
        "found": len(results),
        "not_in_db": len(kanji_chars) - len(results),
        "kanji": results,
    })


# ══════════════════════════════════════════════════════════
#  API: 설정
# ══════════════════════════════════════════════════════════

@app.route("/api/categories")
def get_categories():
    """데이터에 존재하는 카테고리 목록 (설정 칩 동적 생성용)."""
    conn = get_db()
    rows = conn.execute("SELECT DISTINCT category FROM cards ORDER BY category").fetchall()
    conn.close()
    # 보기 좋은 순서로 정렬 (한자·품사·문법)
    order = ["한자", "명사", "동사", "형용사", "부사", "기타", "문법"]
    cats = [r["category"] for r in rows]
    cats.sort(key=lambda x: order.index(x) if x in order else 99)
    return jsonify({"categories": cats})


@app.route("/api/settings", methods=["GET"])
def get_settings():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return jsonify({r["key"]: r["value"] for r in rows})


@app.route("/api/settings", methods=["POST"])
def update_settings():
    data = request.get_json()
    for key, value in data.items():
        set_setting(key, str(value))
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════
#  실행
# ══════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 50)
    print("  Kanji Flow 2.0 서버 시작 중...")
    print("=" * 50)
    init_db()
    print("[서버] http://0.0.0.0:8005 에서 실행 중")
    app.run(host="0.0.0.0", port=8005, debug=False)
